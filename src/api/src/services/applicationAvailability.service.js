import { Job } from "../model/Job.js";
import { JobApplication } from "../model/JobApplication.js";
import { NaukriAccount } from "../model/NaukriAccount.js";
import { findOriginalResumeByUserId } from "../repositories/resume.repository.js";
import { findUserProfileByUserId, findUserById } from "../repositories/user.repository.js";
import {
  AVAILABILITY_STATE,
  AVAILABILITY_REASON,
  AVAILABILITY_REASON_DETAILS,
  APPLICATION_STATUS,
} from "../constant/application.constant.js";
import { logJobEvent, logError } from "../utils/logger.js";
import { appError } from "../utils/errors.js";

/**
 * Deterministically evaluate job application availability for a specific user and job.
 * Avoids spawning browser automation or calling LLMs when conditions can be known deterministically.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.jobId
 * @param {object} [params.jobDoc] - Optional pre-fetched job document
 * @returns {Promise<object>} Structured availability evaluation
 */
export const evaluateJobAvailabilityService = async ({ userId, jobId, jobDoc = null }) => {
  try {
    if (!jobId && !jobDoc) {
      return buildAvailabilityResult(AVAILABILITY_REASON.INVALID_JOB, {
        message: "Job ID or job data is missing.",
      });
    }

    const job = jobDoc || (await Job.findById(jobId));
    if (!job) {
      return buildAvailabilityResult(AVAILABILITY_REASON.JOB_UNAVAILABLE, {
        message: "Job posting could not be found.",
      });
    }

    // 1. Check existing application for this user and job
    if (userId) {
      const existingApp = await JobApplication.findOne({
        userId,
        $or: [
          { jobId: job._id },
          ...(job.sourceUrl ? [{ "result.sourceUrl": job.sourceUrl }] : []),
          ...(job.applicationUrl ? [{ applyUrl: job.applicationUrl }] : []),
        ],
      }).sort({ createdAt: -1 });

      if (existingApp) {
        const appStatus = (existingApp.status || "").toLowerCase();

        // Already applied / sent / completed states
        if (
          [
            "applied",
            "sent",
            "offer",
            "interview",
            "approved",
            APPLICATION_STATUS.APPLIED.toLowerCase(),
            APPLICATION_STATUS.SENT.toLowerCase(),
          ].includes(appStatus)
        ) {
          return buildAvailabilityResult(AVAILABILITY_REASON.ALREADY_APPLIED, {
            applicationId: existingApp._id,
            appliedAt: existingApp.email?.sentAt || existingApp.updatedAt,
          });
        }

        // Active in-progress states
        if (
          [
            "processing",
            "applying",
            "submitting",
            "ai_running",
            "analyzing_portal",
            "filling_form",
            "resolving_answers",
            APPLICATION_STATUS.PROCESSING.toLowerCase(),
            APPLICATION_STATUS.APPLYING.toLowerCase(),
          ].includes(appStatus)
        ) {
          return buildAvailabilityResult(AVAILABILITY_REASON.APPLICATION_IN_PROGRESS, {
            applicationId: existingApp._id,
          });
        }

        // Action or review required states
        if (
          [
            "waiting_for_user",
            "waiting_for_review",
            "waiting_for_final_review",
            "human_required",
            APPLICATION_STATUS.WAITING_FOR_REVIEW.toLowerCase(),
            APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW.toLowerCase(),
          ].includes(appStatus)
        ) {
          return buildAvailabilityResult(AVAILABILITY_REASON.USER_INPUT_REQUIRED, {
            applicationId: existingApp._id,
            canApply: true,
          });
        }
      }
    }

    // 2. Check Candidate Resume exists
    let hasResume = false;
    if (userId) {
      const resume = await findOriginalResumeByUserId(userId).catch(() => null);
      if (resume && (resume.parsedData || resume.fileUrl || resume.filePath)) {
        hasResume = true;
      }
    }

    if (!hasResume && userId) {
      return buildAvailabilityResult(AVAILABILITY_REASON.RESUME_MISSING, {
        canApply: false,
      });
    }

    // 3. Check User Profile basic required information
    if (userId) {
      const [userProfile, user] = await Promise.all([
        findUserProfileByUserId(userId).catch(() => null),
        findUserById(userId).catch(() => null),
      ]);

      const candidateName =
        userProfile?.personalInfo?.name ||
        userProfile?.name ||
        user?.name ||
        user?.username;
      const candidateEmail =
        userProfile?.personalInfo?.email || userProfile?.email || user?.email;

      if (!candidateName && !candidateEmail) {
        return buildAvailabilityResult(AVAILABILITY_REASON.PROFILE_DATA_MISSING, {
          canApply: false,
        });
      }
    }

    // 4. Source-specific authentication checks (e.g. Naukri)
    if (job.source === "naukri" && userId) {
      const naukriAcc = await NaukriAccount.findOne({ userId }).catch(() => null);
      if (!naukriAcc || naukriAcc.status !== "connected") {
        return buildAvailabilityResult(AVAILABILITY_REASON.AUTHENTICATION_REQUIRED, {
          title: "Naukri connection required",
          message: "Connect your Naukri account to apply for this position.",
          canApply: false,
        });
      }
    }

    // 5. Detect multiple openings / positions if present and rank them
    const positions = extractAndRankJobPositions(job);

    // 6. Default: Job is ready and available to apply
    return buildAvailabilityResult(AVAILABILITY_REASON.READY, {
      canApply: true,
      positions,
    });
  } catch (error) {
    await logError("evaluateJobAvailabilityService", error.message);
    return buildAvailabilityResult(AVAILABILITY_REASON.APPLICATION_ERROR, {
      message: "Unable to evaluate application availability.",
    });
  }
};

/**
 * Validates and normalizes an AI / Agent LLM availability analysis result.
 * Strictly guarantees that arbitrary LLM strings never leak into the application state.
 *
 * @param {object} agentResult - Raw output from LLM/agent
 * @returns {object} Validated, structured availability object
 */
export const normalizeAgentAvailabilityResult = (agentResult = {}) => {
  let reasonCode = (agentResult.reasonCode || "").toUpperCase();

  // Validate reason code against controlled enum
  if (!Object.values(AVAILABILITY_REASON).includes(reasonCode)) {
    reasonCode = AVAILABILITY_REASON.APPLICATION_REVIEW_REQUIRED;
  }

  const baseConfig = AVAILABILITY_REASON_DETAILS[reasonCode] || AVAILABILITY_REASON_DETAILS[AVAILABILITY_REASON.APPLICATION_REVIEW_REQUIRED];

  return {
    canApply: typeof agentResult.canApply === "boolean" ? agentResult.canApply : baseConfig.canApply,
    status: baseConfig.status,
    reasonCode,
    title: baseConfig.title,
    message: agentResult.userFriendlyMessage || agentResult.message || baseConfig.message,
    severity: baseConfig.severity,
    requiresUserAction: Boolean(agentResult.requiresUserAction || agentResult.requiresHuman),
    requiredFields: Array.isArray(agentResult.requiredFields) ? agentResult.requiredFields : [],
    positions: Array.isArray(agentResult.positions) ? agentResult.positions : [],
  };
};

/**
 * Extracts and ranks multiple job positions if a job includes multiple roles.
 * Prioritizes MERN stack / full stack / relevant tech roles to position #1.
 */
export const extractAndRankJobPositions = (job) => {
  if (!job) return [];

  const rawPositions = [];

  // Extract from job title if comma/slash separated
  if (job.title && (job.title.includes('/') || job.title.includes('|') || job.title.includes(','))) {
    const parts = job.title.split(/[/|,]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((p, idx) => {
        rawPositions.push({
          id: `pos-${idx + 1}`,
          title: p,
          location: job.location || "Remote",
          clickable: true,
        });
      });
    }
  }

  // If already structured positions exist in job
  if (Array.isArray(job.positions) && job.positions.length > 0) {
    rawPositions.push(...job.positions);
  }

  if (rawPositions.length === 0) {
    return [
      {
        id: "pos-main",
        title: job.title || "Primary Role",
        location: job.location || "Remote",
        clickable: true,
        isPriority: true,
      },
    ];
  }

  // Rank positions: MERN stack / React / Node.js roles get 1st priority
  return rawPositions.map((pos, index) => {
    const isMernOrWeb = /mern|full\s*stack|react|node|javascript|frontend|backend/i.test(pos.title);
    return {
      ...pos,
      isPriority: isMernOrWeb || index === 0,
      clickable: typeof pos.clickable === "boolean" ? pos.clickable : true,
    };
  }).sort((a, b) => (b.isPriority ? 1 : 0) - (a.isPriority ? 1 : 0));
};

/**
 * Helper to build standard structured availability result
 */
function buildAvailabilityResult(reasonCode, overrides = {}) {
  const details = AVAILABILITY_REASON_DETAILS[reasonCode] || AVAILABILITY_REASON_DETAILS[AVAILABILITY_REASON.UNKNOWN];

  return {
    canApply: typeof overrides.canApply === "boolean" ? overrides.canApply : details.canApply,
    status: details.status,
    reasonCode,
    title: overrides.title || details.title,
    message: overrides.message || details.message,
    severity: overrides.severity || details.severity,
    positions: overrides.positions || [],
    ...overrides,
  };
}
