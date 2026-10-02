import { JobApplication } from "../../model/JobApplication.js";
import { APPLICATION_STATUS, HUMAN_REASONS } from "../../constant/application.constant.js";
import { HUMAN_INTERVENTION_REASONS } from "../../constant/agent.constant.js";
import { logJobEvent, logError } from "../../utils/logger.js";
import { appError } from "../../utils/errors.js";

/**
 * Human Intervention Manager: Detects, pauses, and resumes when human participation is needed.
 */
export const checkHumanInterventionNeeded = (pageAnalysis, actionDecision) => {
  if (actionDecision?.type === "humanIntervention") {
    return {
      required: true,
      reason: actionDecision.interventionType || HUMAN_INTERVENTION_REASONS.UNKNOWN_AUTH,
      message: actionDecision.reason || "Human intervention is required to proceed.",
    };
  }

  // 1. CAPTCHA / Bot detection
  if (pageAnalysis.iframes?.some((f) => f.isCaptcha) || pageAnalysis.pageType === "CAPTCHA_OR_BLOCKED") {
    return {
      required: true,
      reason: HUMAN_INTERVENTION_REASONS.CAPTCHA,
      message: "The employer website is requesting CAPTCHA or security verification. Please complete it in your browser window.",
    };
  }

  // 2. Two-Factor Authentication / OTP
  const isOtp = pageAnalysis.inputs?.some((i) => /otp|verification code|one.time|2fa/i.test(`${i.label} ${i.name} ${i.placeholder}`));
  if (isOtp) {
    return {
      required: true,
      reason: HUMAN_INTERVENTION_REASONS.TWO_FACTOR,
      message: "Two-factor authentication code or OTP required to proceed. Please enter your verification code.",
    };
  }

  // 3. Unknown Authentication / Password needed
  if (pageAnalysis.pageType === "LOGIN" && !pageAnalysis.inputs?.some((i) => i.value)) {
    return {
      required: true,
      reason: HUMAN_INTERVENTION_REASONS.UNKNOWN_AUTH,
      message: "Employer portal requires candidate sign-in. Please log in or confirm your account credentials.",
    };
  }

  // 4. Low Confidence
  if (typeof actionDecision?.confidence === "number" && actionDecision.confidence < 0.3) {
    return {
      required: true,
      reason: HUMAN_INTERVENTION_REASONS.LOW_CONFIDENCE,
      message: `Agent encountered ambiguous portal state: "${actionDecision.reason || "Unable to determine next step"}".`,
    };
  }

  return { required: false };
};

/**
 * Pauses application execution and records human intervention state in MongoDB
 */
export const pauseForHumanIntervention = async (applicationId, userId, intervention) => {
  try {
    await JobApplication.findByIdAndUpdate(applicationId, {
      status: APPLICATION_STATUS.HUMAN_REQUIRED,
      "form.requiresHuman": true,
      "form.humanReason": intervention.reason || HUMAN_REASONS.SECURITY_CHALLENGE,
      "workflow.agentState.pendingHumanAction": {
        reason: intervention.reason,
        message: intervention.message,
        detectedAt: new Date(),
        savedUrl: intervention.currentUrl || "",
      },
    });

    await logJobEvent(
      "humanInterventionManager",
      "HUMAN_REQUIRED",
      `Paused for human intervention [${intervention.reason}]: ${intervention.message}`
    );

    return {
      status: APPLICATION_STATUS.HUMAN_REQUIRED,
      intervention,
    };
  } catch (error) {
    await logError("humanInterventionManager.pauseForHumanIntervention", error.message);
    throw error;
  }
};

/**
 * Resumes application execution after candidate solves the challenge in browser
 */
export const resumeAfterHumanIntervention = async (applicationId, userId) => {
  try {
    const application = await JobApplication.findById(applicationId);
    if (!application) throw new appError("Application not found", 404);

    await JobApplication.findByIdAndUpdate(applicationId, {
      status: APPLICATION_STATUS.PROCESSING,
      "form.requiresHuman": false,
      "form.humanReason": null,
      "workflow.agentState.pendingHumanAction": null,
    });

    await logJobEvent(
      "humanInterventionManager",
      "HUMAN_RESOLVED",
      `User confirmed resolution of human intervention for ${applicationId}. Resuming autonomous deep-dive loop...`
    );

    return {
      resumed: true,
      status: APPLICATION_STATUS.PROCESSING,
    };
  } catch (error) {
    await logError("humanInterventionManager.resumeAfterHumanIntervention", error.message);
    throw error;
  }
};

export default {
  checkHumanInterventionNeeded,
  pauseForHumanIntervention,
  resumeAfterHumanIntervention,
};
