import { BrowserSession } from "../../browser/session/browserSession.js";
import { SessionRegistry } from "../../browser/session/sessionRegistry.js";
import { analyzePage } from "../browser/analyze/pageAnalyzer.js";
import { decideNextDeepDiveAction } from "../decision/decisionEngine.js";
import { executeDeepDiveAction } from "../../browser/executor/actionExecutor.js";
import { verifyDeepDiveAction } from "../../browser/verifier/actionVerifier.js";
import {
  checkHumanInterventionNeeded,
  pauseForHumanIntervention,
} from "../../browser/safety/humanInterventionManager.js";
import { JobApplication } from "../../model/JobApplication.js";
import { APPLICATION_STATUS } from "../../constant/application.constant.js";
import {
  DEEP_DIVE_ACTIONS,
  PERCEPTION_PAGE_TYPES,
  AGENT_STATUS,
} from "../../constant/agent.constant.js";
import { logJobEvent, logError } from "../../utils/logger.js";
import { appError } from "../../utils/errors.js";

/**
 * Autonomous Deep-Dive Agent Loop
 *
 * Implements the continuous state machine:
 * OBSERVE -> ANALYZE -> DECIDE -> ACT -> VERIFY -> RE-OBSERVE
 *
 * Runs until:
 * - APPLICATION_SUBMITTED
 * - HUMAN_INTERVENTION_REQUIRED
 * - APPLICATION_FAILED
 */
export const runDeepDiveAgentLoop = async ({
  applicationId,
  userId,
  initialUrl = null,
  maxSteps = 25,
  resumeSession = true,
}) => {
  const startTime = Date.now();
  await logJobEvent(
    "deepDiveAgent",
    "DEEP_DIVE_START",
    `[application:${applicationId}] Starting autonomous deep-dive agent loop (maxSteps: ${maxSteps})`
  );

  let session = null;
  let currentStep = 0;
  const actionHistory = [];

  try {
    // 1. Fetch Job Application context
    const application = await JobApplication.findById(applicationId)
      .populate("jobId")
      .populate("userId");

    if (!application) throw new appError("Job application not found", 404);

    const job = application.jobId || {};
    const userDoc = application.userId || {};

    // Retrieve candidate profile and resume data
    const { getUserProfile } = await import("../../repositories/userProfile.repository.js").catch(() => ({}));
    const profileDoc = getUserProfile ? await getUserProfile(userId).catch(() => null) : null;

    const userProfile = {
      personal: {
        fullName: userDoc.fullName || profileDoc?.fullName || "Candidate",
        email: userDoc.email || profileDoc?.email || "",
        phone: profileDoc?.phone || userDoc.phone || "",
        location: profileDoc?.location || "",
      },
      education: profileDoc?.education || [],
      experience: profileDoc?.experience || [],
      skills: profileDoc?.skills || [],
      customAnswers: profileDoc?.customAnswers || {},
    };

    const resumeData = {
      pdfPath: application.resume?.pdfPath || "",
      fileName: application.resume?.fileName || "Tailored_Resume.pdf",
      skills: application.resume?.tailoredResumeData?.skills || userProfile.skills,
      summary: application.resume?.tailoredResumeData?.summary || "",
      tailoredResumeData: application.resume?.tailoredResumeData || null,
    };

    const targetUrl =
      initialUrl ||
      application.pageAnalysis?.currentUrl ||
      job.applicationUrl ||
      job.sourceUrl ||
      "";

    if (!targetUrl) throw new appError("No target application URL available for deep-dive", 400);

    // 2. Initialize or recover BrowserSession
    session = await SessionRegistry.getOrCreateSession(applicationId, userId);
    let activePage = session.getActivePage();

    if (!activePage || activePage.isClosed()) {
      await session.recoverSession();
      activePage = session.getActivePage();
    }

    // Navigate to initial URL if page is blank or not on target
    const currentUrl = activePage.url() || "";
    if (!currentUrl || currentUrl === "about:blank" || (!currentUrl.includes(new URL(targetUrl).hostname) && !currentUrl.includes("naukri.com"))) {
      await logJobEvent(
        "deepDiveAgent",
        "NAVIGATING_INITIAL",
        `Navigating to target application portal: ${targetUrl}`
      );
      await session.navigate(targetUrl);
      activePage = session.getActivePage();
    }

    // If initial page is a job board with an external redirect button (like Naukri #company-site-button), click it
    if (activePage.url().includes("naukri.com/job-listings")) {
      const companyBtn = activePage.locator('#company-site-button, button:has-text("Apply on company site"), a:has-text("Apply on company site")').first();
      if (await companyBtn.isVisible().catch(() => false)) {
        await logJobEvent("deepDiveAgent", "NAVIGATE_EXTERNAL", "Clicking #company-site-button to access employer careers portal");
        await companyBtn.click().catch(() => {});
        await activePage.waitForTimeout(3000);
        activePage = session.getActivePage();
      }
    }

    let previousAnalysis = null;

    // --- AUTONOMOUS EXECUTION LOOP ---
    while (currentStep < maxSteps) {
      currentStep++;
      await logJobEvent(
        "deepDiveAgent",
        "STEP_START",
        `[Step ${currentStep}/${maxSteps}] Active URL: ${activePage.url()}`
      );

      // STEP 1: OBSERVE & ANALYZE
      const pageAnalysis = await analyzePage(activePage, { includeScreenshot: false });
      await logJobEvent(
        "deepDiveAgent",
        "ANALYZE_PAGE",
        `Page classified as "${pageAnalysis.pageType}" (${pageAnalysis.inputs.length} inputs, ${pageAnalysis.buttons.length} buttons)`
      );

      // Save latest analysis to DB for real-time frontend monitoring
      await JobApplication.findByIdAndUpdate(applicationId, {
        "pageAnalysis.pageType": pageAnalysis.pageType,
        "pageAnalysis.pageTitle": pageAnalysis.title,
        "pageAnalysis.currentUrl": pageAnalysis.url,
        "pageAnalysis.analyzedAt": new Date(),
        "pageAnalysis.formFieldsCount": pageAnalysis.inputs.length,
      });

      // Check if terminal success reached
      if (pageAnalysis.pageType === PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS) {
        await logJobEvent(
          "deepDiveAgent",
          "APPLICATION_SUBMITTED",
          `Submission confirmation detected! Marking application as APPLIED.`
        );

        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.APPLIED,
          "form.submittedAt": new Date(),
          "form.portalUrl": pageAnalysis.url,
        });

        return {
          status: APPLICATION_STATUS.APPLIED,
          completed: true,
          message: "Application submitted and verified successfully on employer portal.",
          stepsRun: currentStep,
          finalUrl: pageAnalysis.url,
        };
      }

      // STEP 2: DECIDE
      const decision = await decideNextDeepDiveAction({
        pageAnalysis,
        jobContext: {
          jobId: job._id || job.id,
          title: job.title,
          company: job.company,
          description: job.description,
          location: job.location,
        },
        userProfile,
        resumeData,
        actionHistory,
        userId,
      });

      const nextAction = decision.nextAction;

      // STEP 3: HUMAN INTERVENTION CHECK
      const interventionCheck = checkHumanInterventionNeeded(pageAnalysis, nextAction);
      if (interventionCheck.required) {
        await pauseForHumanIntervention(applicationId, userId, {
          reason: interventionCheck.reason,
          message: interventionCheck.message,
          currentUrl: pageAnalysis.url,
        });

        return {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          completed: false,
          humanRequired: true,
          message: interventionCheck.message,
          intervention: interventionCheck,
          stepsRun: currentStep,
        };
      }

      // If decision is FINISH
      if (nextAction.type === DEEP_DIVE_ACTIONS.FINISH) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.APPLIED,
          "form.submittedAt": new Date(),
          "form.portalUrl": pageAnalysis.url,
        });

        return {
          status: APPLICATION_STATUS.APPLIED,
          completed: true,
          message: nextAction.reason || "Application completed successfully.",
          stepsRun: currentStep,
          finalUrl: pageAnalysis.url,
        };
      }

      // Emit event for real-time frontend monitoring
      const actionLabel =
        nextAction.type === "upload"
          ? "Uploading resume"
          : nextAction.type === "type"
            ? `Filling field: ${nextAction.target || "input"}`
            : nextAction.type === "check"
              ? "Checking agreement / consent"
              : nextAction.type === "click"
                ? `Clicking: ${nextAction.target || "button"}`
                : nextAction.type === "submit"
                  ? "Submitting application form"
                  : nextAction.type;

      await logJobEvent(
        "deepDiveAgent",
        "ACTION_PROGRESS",
        `→ ${actionLabel} (${nextAction.reason})`
      );

      // STEP 4: ACT
      const executionResult = await executeDeepDiveAction(activePage, nextAction, {
        resumePdfPath: resumeData.pdfPath,
      });

      // Update active page in case a new tab opened or popup appeared
      activePage = session.getActivePage();

      // STEP 5: VERIFY
      const postAnalysis = await analyzePage(activePage, { includeScreenshot: false });
      const verification = verifyDeepDiveAction(pageAnalysis, postAnalysis, nextAction);

      await logJobEvent(
        "deepDiveAgent",
        "VERIFY_ACTION",
        `Action outcome: ${verification.message}`
      );

      // Record step in history
      actionHistory.push({
        step: currentStep,
        type: nextAction.type,
        target: nextAction.target,
        value: nextAction.value,
        reason: nextAction.reason,
        verified: verification.verified,
        result: verification.message,
        timestamp: new Date().toISOString(),
      });

      previousAnalysis = postAnalysis;

      // Check if the page just completed submission
      if (postAnalysis.pageType === PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS) {
        await logJobEvent(
          "deepDiveAgent",
          "APPLICATION_SUBMITTED",
          `Verified application submission on employer portal.`
        );

        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.APPLIED,
          "form.submittedAt": new Date(),
          "form.portalUrl": postAnalysis.url,
        });

        return {
          status: APPLICATION_STATUS.APPLIED,
          completed: true,
          message: "Application submitted and verified successfully.",
          stepsRun: currentStep,
          finalUrl: postAnalysis.url,
        };
      }

      // Small breather between loop iterations
      await activePage.waitForTimeout(1000);
    }

    // Safety ceiling reached without terminal state
    await logJobEvent(
      "deepDiveAgent",
      "MAX_STEPS_REACHED",
      `Reached safety limit of ${maxSteps} steps. Pausing for user review.`
    );

    await JobApplication.findByIdAndUpdate(applicationId, {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      "pageAnalysis.currentUrl": activePage.url(),
    });

    return {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      completed: false,
      message: `Completed ${currentStep} autonomous steps. Ready for user verification.`,
      stepsRun: currentStep,
    };
  } catch (error) {
    await logError("deepDiveAgentLoop.run", error.message);

    await JobApplication.findByIdAndUpdate(applicationId, {
      status: APPLICATION_STATUS.FAILED,
      "workflow.agentState.error": error.message,
    }).catch(() => {});

    return {
      status: APPLICATION_STATUS.FAILED,
      completed: false,
      error: error.message,
      stepsRun: currentStep,
    };
  } finally {
    // If not waiting for human response, close session cleanly
    const freshApp = await JobApplication.findById(applicationId).lean().catch(() => null);
    const keepSessionAlive =
      freshApp &&
      [
        APPLICATION_STATUS.HUMAN_REQUIRED,
        APPLICATION_STATUS.WAITING_FOR_CONFIRMATION,
        APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
      ].includes(freshApp.status);

    if (!keepSessionAlive) {
      await SessionRegistry.closeSession(applicationId).catch(() => {});
    }
  }
};

export default {
  runDeepDiveAgentLoop,
};
