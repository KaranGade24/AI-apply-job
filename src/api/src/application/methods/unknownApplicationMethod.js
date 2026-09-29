import { logJobEvent, logError } from "../../utils/logger.js";
import { executeAutonomousUnknownApplication } from "../unknown/unknownPageHandler.js";
import { runGoogleFormApplication } from "./googleFormApplicationMethod.js";
import { runPhoneApplication } from "./phoneApplicationMethod.js";
import { sendApplicationEmail } from "../../integrations/email/emailService.js";
import {
  updateApplicationStatus,
  updateApplicationEmail,
} from "../../repositories/application.repository.js";
import { APPLICATION_STATUS } from "../../constant/application.constant.js";
import { formatAndCleanEmailBody } from "../../agent/prompt/applicationEmail.js";
import { JobApplication } from "../../../src/model/JobApplication.js";

/**
 * Runs the full Autonomous Unknown / Career Portal application method workflow.
 *
 * It:
 * 1. Opens the URL in a headless browser with user session state.
 * 2. Runs the autonomous multi-step loop:
 *    - Click initial Apply on job description/ATS.
 *    - Detect and click modal actions (e.g. "Start Your Application", "Autofill with Resume", "Apply Manually").
 *    - Attach candidate tailored resume PDF if file upload dropzones appear.
 *    - Extract and resolve questionnaire fields.
 *    - Record candidate auth gateway state if login/creation required (HTTP 200).
 * 3. Saves pageAnalysis and form fields on the JobApplication document.
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.pageUrl - The unknown URL
 * @param {object} params.candidateInfo - Candidate resume data
 * @param {object} params.jobDetails - Job document
 * @param {string} params.userId
 * @param {string} [params.resumePdfPath] - Path to tailored resume PDF
 * @param {object} [params.sessionState] - Optional browser session state
 * @returns {Promise<object>} Result with detectedMethod, action taken, and status
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
      `Analyzing unknown/portal application page: ${pageUrl}`,
    );

    if (applicationId) {
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.ANALYZING_PORTAL,
        {
          logMessage: `AI analyzing employer portal: ${pageUrl}`,
        },
      );
    }

    // Run the autonomous multi-step portal engine
    const pageResult = await executeAutonomousUnknownApplication({
      url: pageUrl,
      job: jobDetails,
      userId,
      applicationId,
      resumePdfPath,
      candidateInfo,
      sessionState,
    });

    const { detectedMethod } = pageResult;

    // Save pageAnalysis and inspected form fields on JobApplication
    if (applicationId && pageResult.pageAnalysis) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        pageAnalysis: {
          ...pageResult.pageAnalysis,
          currentUrl: pageResult.pageUrl || pageUrl,
          analyzedAt: new Date(),
        },
        "form.fields": pageResult.formFields || [],
        "form.requiresHuman": false,
      });
    }

    // --- EMAIL ---
    if (detectedMethod === "email") {
      const recipientEmail =
        pageResult.emailContact?.email ||
        pageResult.emails?.[0] ||
        jobDetails?.hrEmail ||
        "";

      if (recipientEmail) {
        const candidateName =
          candidateInfo?.personalInfo?.fullName ||
          candidateInfo?.name ||
          "Candidate";
        const jobTitle = jobDetails?.title || "Software Developer";
        const company = jobDetails?.company || "Company";
        const refId =
          pageResult.emailContact?.referenceId ||
          pageResult.pageAnalysis?.matchedRole?.referenceId ||
          "";

        const subject = refId
          ? `Application for ${jobTitle} - Ref ID: ${refId} - ${candidateName}`
          : `Application for ${jobTitle} at ${company} - ${candidateName}`;

        const rawBody = `Dear Hiring Team at ${company},

I am writing to express my strong interest in the ${jobTitle} position${refId ? ` (Ref ID: ${refId})` : ""}. ${candidateInfo?.summary || `With expertise in ${(candidateInfo?.skills || []).slice(0, 4).join(", ")}, I am confident in delivering immediate value to your team.`}

My tailored resume is attached for your review. I look forward to the opportunity to discuss my qualifications in an interview.

Sincerely,

${candidateName}`;

        const body = formatAndCleanEmailBody(rawBody, candidateName);

        if (applicationId) {
          await updateApplicationEmail(applicationId, {
            recipient: recipientEmail,
            subject,
            body,
            approved: false,
          });
          await updateApplicationStatus(
            applicationId,
            APPLICATION_STATUS.WAITING_FOR_REVIEW,
            {
              logMessage: `Employer specifies email applications. Draft prepared for review with Ref ID: ${refId || "N/A"}.`,
            },
          );
        }

        return {
          detectedMethod,
          actionTaken: "email_prepared",
          recipientEmail,
          subject,
          message: `Application email draft prepared for ${recipientEmail}`,
          pageResult,
        };
      }
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
        actionTaken: formResult.submitted
          ? "google_form_submitted"
          : "google_form_filled",
        googleFormUrl,
        filledCount: formResult.filledCount,
        submitted: formResult.submitted,
        message: formResult.message,
        pageResult,
      };
    }

    // --- CUSTOM FORM / CAREER PORTAL ---
    if (applicationId) {
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.WAITING_FOR_REVIEW,
        {
          logMessage: `Employer portal analyzed: ${pageResult.message}`,
        },
      );
    }

    return {
      detectedMethod: detectedMethod || "career_portal",
      actionTaken: "waiting_for_review",
      message:
        pageResult.message || `Portal analyzed. Ready for candidate review.`,
      pageResult,
    };
  } catch (error) {
    await logError(
      "unknownApplicationMethod.runUnknownApplicationMethod",
      error.message,
    );
    if (applicationId) {
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.WAITING_FOR_REVIEW,
        {
          logMessage: `Portal navigation active. Manual review available.`,
        },
      );
    }
    return {
      detectedMethod: "career_portal",
      actionTaken: "waiting_for_review",
      message: error.message,
    };
  }
};
