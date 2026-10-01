import mongoose from "mongoose";
import { logJobEvent, logError } from "../../utils/logger.js";
import { executeAutonomousUnknownApplication } from "../unknown/unknownPageHandler.js";
import { updateApplicationStatus, updateApplicationEmail } from "../../repositories/application.repository.js";
import { APPLICATION_STATUS } from "../../constant/application.constant.js";
import { JobApplication } from "../../model/JobApplication.js";
import { inspectForm } from "../form/formInspector.js";
import { formatAndCleanEmailBody } from "../../agent/prompt/applicationEmail.js";
import { maskValue } from "../../utils/redact.js";
import { runUnknownAgentLoop } from "../unknown/unknownAgent.js";
import { runPhoneApplication } from "./phoneApplicationMethod.js";
import { runGoogleFormApplication } from "./googleFormApplicationMethod.js";

/**
 * Runs the full Autonomous Unknown / Career Portal application method workflow.
 *
 * Uses the Observe → Analyze → Decide → Act → Verify browser-agent engine:
 * 1. Restores user session / cookies if available
 * 2. Runs the autonomous agent loop across pages, accordions, modals, and multi-step forms
 * 3. Supports dynamic method handoff (Google Form, direct Email, Phone)
 * 4. Supports Human-in-the-loop pause/resume (WAITING_FOR_USER / HUMAN_REQUIRED)
 * 5. Supports WAITING_FOR_FINAL_REVIEW checkpoint before final form submission
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.pageUrl - Target job URL
 * @param {object} params.candidateInfo - Candidate resume / profile data
 * @param {object} params.jobDetails - Job document
 * @param {string} params.userId
 * @param {string} [params.resumePdfPath] - Local tailored resume PDF path
 * @param {object} [params.sessionState] - Optional browser session state
 * @returns {Promise<object>} Structured execution result
 */
export const runUnknownApplicationMethod = async ({
  applicationId,
  pageUrl,
  candidateInfo,
  jobDetails,
  userId,
  resumePdfPath = null,
  sessionState = null,
}) => {
  try {
    if (!pageUrl) {
      throw new Error("No URL provided for unknown application method");
    }

    await logJobEvent(
      "unknownApplicationMethod",
      "START",
      `Analyzing unknown/portal application page: ${pageUrl}`
    );

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.ANALYZING_PORTAL, {
        logMessage: `AI browser agent analyzing portal: ${pageUrl}`,
      }).catch(() => {});
    }

    // Run the autonomous browser agent
    const pageResult = await executeAutonomousUnknownApplication({
      url: pageUrl,
      job: jobDetails,
      userId,
      applicationId,
      resumePdfPath,
      candidateInfo,
      sessionState,
    });

    const detectedMethod = pageResult.detectedMethod || pageResult.handoff?.method || "unknown";

    await logJobEvent(
      "unknownApplicationMethod",
      "METHOD_DETECTED",
      `Detected method: ${detectedMethod} from page: ${pageUrl}`
    );

    // If dynamic handoff was executed (e.g. to Google Form, Phone, or Email)
    if (pageResult.handoffExecuted) {
      // Persist any form fields or state to JobApplication
      if (applicationId && mongoose.Types.ObjectId.isValid(applicationId) && (pageResult.formFields || pageResult.agentState)) {
        const updateData = {};
        if (pageResult.formFields) {
          updateData["form.fields"] = pageResult.formFields;
        }
        if (pageResult.missingQuestions) {
          updateData["form.missingQuestions"] = pageResult.missingQuestions;
        }
        if (pageResult.answeredQuestions) {
          updateData["form.answers"] = pageResult.answeredQuestions;
        }
        if (Object.keys(updateData).length > 0) {
          await JobApplication.findByIdAndUpdate(applicationId, updateData).catch(() => {});
        }
      }

      return {
        detectedMethod,
        actionTaken: "handoff_executed",
        handoffResult: pageResult.handoffResult,
        status: pageResult.status || APPLICATION_STATUS.WAITING_FOR_REVIEW,
        message: pageResult.message || `Discovered ${detectedMethod} application method.`,
        pageResult,
      };
    }

    // Otherwise, dispatch to appropriate handler manually

    // --- EMAIL ---
    if (detectedMethod === "email") {
      const recipientEmail =
        pageResult.emails?.[0] ||
        pageResult.emailInstructions?.email ||
        jobDetails?.hrEmail ||
        "";

      if (!recipientEmail) {
        // No email found — fallback to human review
        if (applicationId) {
          await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
            logMessage: `Email method detected but no recipient found. Human review required.`,
          }).catch(() => {});
        }
        return {
          detectedMethod,
          actionTaken: "human_review",
          message: "Email method detected but no recipient address found on the page.",
          pageResult,
        };
      }

      const uInfo = candidateInfo?.personalInfo || candidateInfo?.personal || candidateInfo || {};
      const candidateName =
        uInfo.fullName ||
        uInfo.name ||
        (uInfo.firstName ? `${uInfo.firstName} ${uInfo.lastName || ''}`.trim() : null) ||
        candidateInfo?.fullName ||
        candidateInfo?.name ||
        "Karan Santosh Gade";
      const jobTitle = jobDetails?.title || "Software Developer";
      const company = jobDetails?.company || "Company";
      const refId = pageResult.referenceIds?.[0] || pageResult.emailInstructions?.referenceId || "";

      const subject = refId
        ? `Application for ${jobTitle} - Ref ID: ${refId} - ${candidateName}`
        : `Application for ${jobTitle} at ${company} - ${candidateName}`;

      const rawBody = `Dear Hiring Team at ${company},

I am writing to express my strong interest in the ${jobTitle} position${refId ? ` (Ref ID: ${refId})` : ""}. ${candidateInfo?.summary || `With expertise in ${(candidateInfo?.skills || []).slice(0, 4).join(", ")}, I am confident in delivering immediate value to your team.`}

My tailored resume is attached for your review. I look forward to the opportunity to discuss my qualifications in an interview.

Sincerely,

${candidateName}`;

      const body = formatAndCleanEmailBody(rawBody, candidateName);

      let effectiveEmailPdfPath = resumePdfPath || null;
      if (!effectiveEmailPdfPath && candidateInfo) {
        try {
          const { tailorResumeForJobDescription } = await import("../../services/resumeTailoring.service.js");
          const tailoredRes = await tailorResumeForJobDescription({
            candidateResume: candidateInfo,
            jobDetails,
            userId,
            applicationId,
          });
          effectiveEmailPdfPath = tailoredRes.pdfPath;
        } catch (tailorErr) {
          await logError("unknownApplicationMethod.emailTailor", tailorErr.message);
        }
      }

      if (applicationId) {
        await updateApplicationEmail(applicationId, {
          recipient: recipientEmail,
          subject,
          body,
          approved: false,
        }).catch(() => {});
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
          logMessage: `Created draft application email to ${recipientEmail} (awaiting human approval).`,
        }).catch(() => {});
      }

      return {
        detectedMethod,
        actionTaken: "email_draft_created",
        recipientEmail,
        subject,
        message: `Draft email created for ${recipientEmail}, pending approval.`,
        pageResult,
      };
    }

    // --- PHONE ---
    if (detectedMethod === "phone") {
      const phoneNumber = pageResult.phoneNumbers?.[0] || jobDetails?.phone || "";
      const phoneResult = await runPhoneApplication({
        applicationId,
        phoneNumber,
        candidateInfo,
        jobDetails,
        userId,
      });
      return {
        detectedMethod,
        actionTaken: "phone_script_generated",
        phoneNumber,
        callScript: phoneResult.callScript,
        talkingPoints: phoneResult.talkingPoints,
        message: phoneResult.message,
        pageResult,
      };
    }

    // --- GOOGLE FORM ---
    if (detectedMethod === "google_form") {
      const googleFormUrl = pageResult.googleFormUrl;
      const formResult = await runGoogleFormApplication({
        applicationId,
        googleFormUrl,
        candidateInfo,
        jobDetails,
        userId,
        resumePdfPath,
      });
      return {
        detectedMethod,
        actionTaken: formResult.submitted ? "google_form_submitted" : "google_form_filled",
        googleFormUrl,
        filledCount: formResult.filledCount,
        submitted: formResult.submitted,
        message: formResult.message,
        pageResult,
      };
    }

    // --- CUSTOM FORM / ATS PORTAL ---
    if (detectedMethod === "custom_form" || detectedMethod === "career_portal") {
      await logJobEvent(
        "unknownApplicationMethod",
        "TRIGGER_AGENT_LOOP",
        "Custom Form or Career Portal detected. Spawning multi-step secure agent loop..."
      );

      const loopResult = await runUnknownAgentLoop({
        applicationId,
        userId,
        candidateInfo,
        jobDetails
      });

      if (applicationId) {
        await updateApplicationStatus(applicationId, loopResult.status, {
          logMessage: `Agent loop finished with status "${loopResult.status}". Summary: ${loopResult.summary}`,
        }).catch(() => {});
      }

      return {
        detectedMethod,
        actionTaken: loopResult.status === APPLICATION_STATUS.APPLIED ? "custom_form_submitted" : "custom_form_filled",
        filledCount: 0,
        submitted: loopResult.status === APPLICATION_STATUS.APPLIED,
        message: loopResult.summary,
        pageResult,
      };
    }

    // --- CAREER PORTAL / HUMAN REVIEW ---
    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
        logMessage: `Unknown page analyzed. Method: ${detectedMethod}. ${pageResult.message}`,
      }).catch(() => {});
    }

    // Persist any form fields or state to JobApplication
    if (applicationId && mongoose.Types.ObjectId.isValid(applicationId) && (pageResult.formFields || pageResult.agentState)) {
      const updateData = {};
      if (pageResult.formFields) {
        updateData["form.fields"] = pageResult.formFields;
      }
      if (pageResult.missingQuestions) {
        updateData["form.missingQuestions"] = pageResult.missingQuestions;
      }
      if (pageResult.answeredQuestions) {
        updateData["form.answers"] = pageResult.answeredQuestions;
      }
      if (Object.keys(updateData).length > 0) {
        await JobApplication.findByIdAndUpdate(applicationId, updateData).catch(() => {});
      }
    }

    return {
      detectedMethod,
      actionTaken: pageResult.terminalState || "in_progress",
      status: pageResult.status || APPLICATION_STATUS.WAITING_FOR_REVIEW,
      message: pageResult.message || "Agent completed iteration.",
      pageResult,
    };
  } catch (error) {
    await logError("unknownApplicationMethod.runUnknownApplicationMethod", error.message);

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
        logMessage: `Portal navigation halted: ${error.message}. Manual review available.`,
      }).catch(() => {});
    }

    return {
      detectedMethod: "unknown",
      actionTaken: "error_fallback",
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      message: error.message,
    };
  }
};
