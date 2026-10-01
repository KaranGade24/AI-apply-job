/**
 * Application Constant Definitions
 */

/**
 * Apply Button & Job Availability UI States
 */
export const AVAILABILITY_STATE = Object.freeze({
  AVAILABLE: "AVAILABLE",
  DISABLED: "DISABLED",
  LOADING: "LOADING",
  APPLYING: "APPLYING",
  COMPLETED: "COMPLETED",
  USER_ACTION_REQUIRED: "USER_ACTION_REQUIRED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
});

/**
 * Controlled Reason Codes for Application Availability
 */
export const AVAILABILITY_REASON = Object.freeze({
  READY: "READY",
  PROFILE_DATA_MISSING: "PROFILE_DATA_MISSING",
  RESUME_MISSING: "RESUME_MISSING",
  ALREADY_APPLIED: "ALREADY_APPLIED",
  APPLICATION_IN_PROGRESS: "APPLICATION_IN_PROGRESS",
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  JOB_EXPIRED: "JOB_EXPIRED",
  JOB_UNAVAILABLE: "JOB_UNAVAILABLE",
  UNSUPPORTED_APPLICATION_FLOW: "UNSUPPORTED_APPLICATION_FLOW",
  USER_INPUT_REQUIRED: "USER_INPUT_REQUIRED",
  HUMAN_REVIEW_REQUIRED: "HUMAN_REVIEW_REQUIRED",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  INVALID_JOB: "INVALID_JOB",
  APPLICATION_ERROR: "APPLICATION_ERROR",
  APPLICATION_REVIEW_REQUIRED: "APPLICATION_REVIEW_REQUIRED",
  UNKNOWN: "UNKNOWN",
});

/**
 * User-friendly Messages and Titles for Availability Reasons
 */
export const AVAILABILITY_REASON_DETAILS = Object.freeze({
  [AVAILABILITY_REASON.READY]: {
    title: "Ready to apply",
    message: "All required profile details and resume are ready.",
    severity: "success",
    canApply: true,
    status: AVAILABILITY_STATE.AVAILABLE,
  },
  [AVAILABILITY_REASON.PROFILE_DATA_MISSING]: {
    title: "Apply unavailable",
    message: "Your profile is missing required information for this application.",
    severity: "warning",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
  [AVAILABILITY_REASON.RESUME_MISSING]: {
    title: "Apply unavailable",
    message: "Please upload or generate a resume before applying.",
    severity: "warning",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
  [AVAILABILITY_REASON.ALREADY_APPLIED]: {
    title: "Apply unavailable",
    message: "You have already applied to this job.",
    severity: "info",
    canApply: false,
    status: AVAILABILITY_STATE.COMPLETED,
  },
  [AVAILABILITY_REASON.APPLICATION_IN_PROGRESS]: {
    title: "Application in progress",
    message: "An application is currently running for this job.",
    severity: "info",
    canApply: false,
    status: AVAILABILITY_STATE.APPLYING,
  },
  [AVAILABILITY_REASON.APPLICATION_SUBMITTED]: {
    title: "Already submitted",
    message: "This application has been successfully submitted.",
    severity: "success",
    canApply: false,
    status: AVAILABILITY_STATE.COMPLETED,
  },
  [AVAILABILITY_REASON.JOB_EXPIRED]: {
    title: "Apply unavailable",
    message: "This job posting has expired and is no longer accepting applications.",
    severity: "error",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
  [AVAILABILITY_REASON.JOB_UNAVAILABLE]: {
    title: "Apply unavailable",
    message: "This job posting is currently unavailable.",
    severity: "error",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
  [AVAILABILITY_REASON.UNSUPPORTED_APPLICATION_FLOW]: {
    title: "Apply unavailable",
    message: "This job is not currently supported by the automatic application agent.",
    severity: "warning",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
  [AVAILABILITY_REASON.USER_INPUT_REQUIRED]: {
    title: "Action required",
    message: "This application requires additional information before it can continue.",
    severity: "warning",
    canApply: true,
    status: AVAILABILITY_STATE.USER_ACTION_REQUIRED,
  },
  [AVAILABILITY_REASON.HUMAN_REVIEW_REQUIRED]: {
    title: "Manual review required",
    message: "This application flow requires manual review or verification.",
    severity: "warning",
    canApply: true,
    status: AVAILABILITY_STATE.REVIEW_REQUIRED,
  },
  [AVAILABILITY_REASON.AUTHENTICATION_REQUIRED]: {
    title: "Login required",
    message: "Portal authentication is required to apply for this job.",
    severity: "warning",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
  [AVAILABILITY_REASON.INVALID_JOB]: {
    title: "Apply unavailable",
    message: "Job details or application URL are incomplete or invalid.",
    severity: "error",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
  [AVAILABILITY_REASON.APPLICATION_ERROR]: {
    title: "Apply unavailable",
    message: "We couldn't safely continue with this application. Please review it manually.",
    severity: "error",
    canApply: false,
    status: AVAILABILITY_STATE.REVIEW_REQUIRED,
  },
  [AVAILABILITY_REASON.APPLICATION_REVIEW_REQUIRED]: {
    title: "Review required",
    message: "Please review the application details before submitting.",
    severity: "info",
    canApply: true,
    status: AVAILABILITY_STATE.REVIEW_REQUIRED,
  },
  [AVAILABILITY_REASON.UNKNOWN]: {
    title: "Apply unavailable",
    message: "Application status is currently being determined.",
    severity: "info",
    canApply: false,
    status: AVAILABILITY_STATE.DISABLED,
  },
});

export const APPLICATION_STATUS = Object.freeze({
  PENDING: "Pending",
  PROCESSING: "processing",
  UNSUPPORTED_METHOD: "unsupported_method",
  RESUME_GENERATING: "resume_generating",
  EMAIL_GENERATING: "email_generating",
  WAITING_FOR_REVIEW: "waiting_for_review",
  APPROVED: "approved",
  APPLIED: "Applied",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  SENDING: "sending",
  SENT: "sent",
  FAILED: "failed",
  // Phone application method statuses
  PHONE_APPLYING: "phone_applying",
  CALL_SCRIPT_READY: "call_script_ready",
  // Google Form application method statuses
  GOOGLE_FORM_FILLING: "google_form_filling",
  GOOGLE_FORM_SUBMITTED: "google_form_submitted",
  GOOGLE_LOGIN_REQUIRED: "google_login_required",
  // Browser / unknown page analysis statuses
  ANALYZING_PORTAL: "analyzing_portal",
  SESSION_LOADING: "session_loading",
  SESSION_EXPIRED: "session_expired",
  OPENING_JOB: "opening_job",
  APPLY_BUTTON_DETECTED: "apply_button_detected",
  APPLYING: "applying",
  FORM_DETECTED: "form_detected",
  INSPECTING_FORM: "inspecting_form",
  RESOLVING_ANSWERS: "resolving_answers",
  FILLING_FORM: "filling_form",
  HUMAN_REQUIRED: "human_required",
  WAITING_FOR_FINAL_REVIEW: "waiting_for_final_review",
  SUBMITTING: "submitting",
  SUBMITTED: "Applied",
  // Generic browser agent statuses
  AI_RUNNING: "ai_running",
  WAITING_FOR_USER: "waiting_for_user",
  PAUSED: "paused",
  FORM_FILLED: "form_filled",
  SUBMIT_ATTEMPTED: "submit_attempted",
  // Verification-first browser agent terminal states
  APPLICATION_COMPLETED: "APPLICATION_COMPLETED",
  APPLICATION_REQUIRES_HUMAN: "APPLICATION_REQUIRES_HUMAN",
  APPLICATION_BLOCKED: "APPLICATION_BLOCKED",
  APPLICATION_FAILED: "APPLICATION_FAILED",
  APPLICATION_SKIPPED: "APPLICATION_SKIPPED",
});

/**
 * Explicit Application State Machine States
 */
export const APPLICATION_STATES = Object.freeze({
  INIT: "INIT",
  JOB_PAGE_OPEN: "JOB_PAGE_OPEN",
  JOB_ANALYZED: "JOB_ANALYZED",
  APPLY_ACTION_FOUND: "APPLY_ACTION_FOUND",
  APPLICATION_ENTRY: "APPLICATION_ENTRY",
  FORM_ANALYZING: "FORM_ANALYZING",
  FORM_FILLING: "FORM_FILLING",
  FORM_VALIDATING: "FORM_VALIDATING",
  QUESTION_REVIEW: "QUESTION_REVIEW",
  FILE_UPLOAD: "FILE_UPLOAD",
  STEP_TRANSITION: "STEP_TRANSITION",
  PRE_SUBMISSION_REVIEW: "PRE_SUBMISSION_REVIEW",
  AWAITING_USER_CONFIRMATION: "AWAITING_USER_CONFIRMATION",
  SUBMISSION_IN_PROGRESS: "SUBMISSION_IN_PROGRESS",
  SUBMISSION_VERIFYING: "SUBMISSION_VERIFYING",
  APPLICATION_COMPLETED: "APPLICATION_COMPLETED",
  APPLICATION_REQUIRES_HUMAN: "APPLICATION_REQUIRES_HUMAN",
  APPLICATION_BLOCKED: "APPLICATION_BLOCKED",
  APPLICATION_FAILED: "APPLICATION_FAILED",
  APPLICATION_SKIPPED: "APPLICATION_SKIPPED",
});

/**
 * Verification Levels for Browser Execution
 */
export const VERIFICATION_LEVELS = Object.freeze({
  LEVEL_0: "LEVEL_0", // Low-level browser operation completed (click dispatched)
  LEVEL_1: "LEVEL_1", // Target DOM element state changed (value updated, check toggled)
  LEVEL_2: "LEVEL_2", // Expected UI container response observed (step stepper moved, modal closed)
  LEVEL_3: "LEVEL_3", // Semantic workflow progress verified (next question set, thank you banner)
  LEVEL_4: "LEVEL_4", // External durable receipt or confirmation number recorded
});

/**
 * Granular Failure Classifications
 */
export const FAILURE_TYPES = Object.freeze({
  TARGET_NOT_FOUND: "TARGET_NOT_FOUND",
  TARGET_AMBIGUOUS: "TARGET_AMBIGUOUS",
  TARGET_NOT_VISIBLE: "TARGET_NOT_VISIBLE",
  TARGET_DISABLED: "TARGET_DISABLED",
  STALE_ELEMENT: "STALE_ELEMENT",
  DOM_CHANGED: "DOM_CHANGED",
  PAGE_NOT_READY: "PAGE_NOT_READY",
  NETWORK_TIMEOUT: "NETWORK_TIMEOUT",
  NAVIGATION_TIMEOUT: "NAVIGATION_TIMEOUT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  WRONG_PAGE: "WRONG_PAGE",
  ACTION_REJECTED: "ACTION_REJECTED",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  OTP_REQUIRED: "OTP_REQUIRED",
  MFA_REQUIRED: "MFA_REQUIRED",
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  HUMAN_INPUT_REQUIRED: "HUMAN_INPUT_REQUIRED",
  SITE_ERROR: "SITE_ERROR",
  UNKNOWN_STATE: "UNKNOWN_STATE",
  LOOP_DETECTED: "LOOP_DETECTED",
  MAX_RETRIES_EXCEEDED: "MAX_RETRIES_EXCEEDED",
});

/**
 * Question Provenance and Classification
 */
export const QUESTION_CLASSIFICATIONS = Object.freeze({
  PROFILE_DERIVED: "PROFILE_DERIVED",
  RESUME_DERIVED: "RESUME_DERIVED",
  SAFE_TRANSFORMATION: "SAFE_TRANSFORMATION",
  USER_PREFERENCE: "USER_PREFERENCE",
  EMPLOYMENT_PREFERENCE: "EMPLOYMENT_PREFERENCE",
  LEGAL_SENSITIVE: "LEGAL_SENSITIVE",
  MISSING_INFORMATION: "MISSING_INFORMATION",
  AMBIGUOUS: "AMBIGUOUS",
});

/**
 * Confidence Thresholds
 */
export const CONFIDENCE_THRESHOLDS = Object.freeze({
  AUTOMATABLE: 0.9,
  OBSERVE_MORE: 0.75,
  HUMAN_REVIEW: 0.75,
});

/**
 * Retry Budgets by Action Risk Level
 */
export const RETRY_BUDGETS = Object.freeze({
  LOW: 3,
  MEDIUM: 2,
  HIGH: 1,
  CRITICAL: 0,
});

export const PORTAL_PAGE_TYPES = Object.freeze({
  JOB_LISTINGS_ACCORDION: "job_listings_accordion",
  MULTI_OPENINGS: "multi_openings",
  FORM_CLOSED: "form_closed",
  JOB_DESCRIPTION_PAGE: "job_description_page",
  APPLICATION_FORM: "application_form",
  MULTI_STEP_WIZARD: "multi_step_wizard",
  MODAL_APPLICATION_FORM: "modal_application_form",
  ATS_ACCOUNT_GATEWAY: "ats_account_gateway",
  EMAIL_INSTRUCTIONS: "email_instructions",
  EXTERNAL_ATS: "external_ats",
  LOGIN_REQUIRED: "login_required",
  ALREADY_APPLIED: "already_applied",
  UNKNOWN: "unknown",
});

export const APPLICATION_STATUSES = APPLICATION_STATUS; // For backward compatibility or if frontend expects this name

export const FORM_ACTIONS = Object.freeze({
  FILL: "fill",
  SELECT: "select",
  CHECK: "check",
  UNCHECK: "uncheck",
  UPLOAD: "upload",
  CLICK: "click",
  WAIT: "wait",
});

export const HUMAN_REASONS = Object.freeze({
  MISSING_INFORMATION: "missingInformation",
  CAPTCHA: "captcha",
  OTP: "otp",
  TWO_FACTOR_AUTH: "2fa",
  SESSION_EXPIRED: "sessionExpired",
  VALIDATION_MISMATCH: "validationMismatch",
  LOGIN_REQUIRED: "loginRequired",
  UNKNOWN_QUESTION: "unknownQuestion",
  AMBIGUOUS_ANSWER: "ambiguousAnswer",
  PERMISSION_REQUIRED: "permissionRequired",
  FINAL_SUBMISSION: "finalSubmission",
});

/**
 * 4 canonical application methods supported by the AI pipeline:
 * 1. EMAIL       — Send application email with tailored resume to HR contact
 * 2. PHONE       — AI generates call script; candidate calls HR
 * 3. GOOGLE_FORM — AI opens Google Form, fills fields, uploads resume if needed, submits
 * 4. UNKNOWN     — AI opens the URL, analyzes with LLM, detects actual method and takes action
 */
export const APPLICATION_METHOD = Object.freeze({
  EMAIL: "email",
  PHONE: "phone",
  GOOGLE_FORM: "googleForm",
  UNKNOWN: "unknown",
  // Legacy alias kept for backward compatibility
  WEBSITE_FORM: "unknown",
});

/**
 * Browser Actions — executed by Playwright via browserActionExecutor.
 * These are the ONLY actions that touch the browser DOM.
 */
export const BROWSER_ACTIONS = Object.freeze({
  NAVIGATE: "navigate",
  CLICK: "click",
  FILL: "fill",
  TYPE: "type",
  SELECT: "select",
  CHECK: "check",
  UNCHECK: "uncheck",
  UPLOAD: "upload",
  SCROLL: "scroll",
  PRESS_KEY: "pressKey",
  HOVER: "hover",
  FOCUS: "focus",
  WAIT: "wait",
  SWITCH_TAB: "switchTab",
  CLOSE_TAB: "closeTab",
  GO_BACK: "goBack",
  GO_FORWARD: "goForward",
  OPEN_LINK: "openLink",
  EVALUATE: "evaluate",
  EXTRACT: "extract",
  REQUEST_HUMAN: "requestHuman",
  FINISH: "finish",
  CLOSE_MODAL: "closeModal",
});

/**
 * System Actions — internal operations triggered by the agent loop,
 * NOT directly by the LLM. The agent loop transitions to these
 * based on page classification (e.g., pageType === APPLICATION_FORM → inspectForm).
 */
export const SYSTEM_ACTIONS = Object.freeze({
  INSPECT_FORM: "inspectForm",
  SUBMIT: "submit",
});

/**
 * Control Decisions — workflow routing decisions from the LLM.
 * These do NOT execute browser actions. They control agent flow.
 */
export const CONTROL_DECISIONS = Object.freeze({
  HANDOFF: "handoff",
  HUMAN_REQUIRED: "humanRequired",
  FINISH: "finish",
});

/**
 * Extended page types for the UNKNOWN browser agent.
 * Used by the two-stage classification pipeline (Stage 1: classify, Stage 2: decide).
 */
export const PAGE_TYPES = Object.freeze({
  JOB_LISTING: "job_listing",
  JOB_DESCRIPTION: "job_description",
  ROLE_SELECTION: "role_selection",
  APPLICATION_FORM: "application_form",
  MULTI_STEP_FORM: "multi_step_form",
  MODAL_FORM: "modal_form",
  ATS_GATEWAY: "ats_gateway",
  LOGIN_PAGE: "login_page",
  OTP_PAGE: "otp_page",
  GOOGLE_FORM: "google_form",
  EMAIL_INSTRUCTIONS: "email_instructions",
  EXTERNAL_APPLICATION: "external_application",
  FORM_CLOSED: "form_closed",
  SUCCESS_PAGE: "success_page",
  UNKNOWN: "unknown",
});

/**
 * Agent terminal states — end conditions for the Observe→Decide→Act→Verify loop.
 */
export const AGENT_TERMINAL_STATES = Object.freeze({
  SUCCESS: "success",
  HUMAN_REQUIRED: "human_required",
  FAILED: "failed",
  BLOCKED: "blocked",
  CLOSED: "closed",
});

/**
 * Safety limits for the UNKNOWN agent loop.
 * ACTIVE_RUN_TIMEOUT_MS only counts active browser execution time.
 * Human wait time (login, OTP, question answers) does NOT count against this.
 */
export const AGENT_LOOP_LIMITS = Object.freeze({
  MAX_ACTIONS: 50,
  MAX_RETRIES_PER_ACTION: 3,
  MAX_SAME_PAGE_VISITS: 3,
  MAX_AI_DECISIONS: 50,
  ACTIVE_RUN_TIMEOUT_MS: 300000, // 5 minutes of active browser time
});

/**
 * Handoff methods for dynamic method discovery during the UNKNOWN agent loop.
 * When the agent discovers the site is actually a known method, it hands off.
 */
export const HANDOFF_METHODS = Object.freeze({
  EMAIL: "email",
  PHONE: "phone",
  GOOGLE_FORM: "googleForm",
  GENERIC_FORM: "genericForm",
});

/**
 * Known ATS domains that are safe for navigation without additional validation.
 */
export const KNOWN_ATS_DOMAINS = Object.freeze([
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "taleo.net",
  "icims.com",
  "jobvite.com",
  "bamboohr.com",
  "ashbyhq.com",
  "breezy.hr",
  "recruitee.com",
  "workable.com",
  "jazz.co",
  "applytojob.com",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "docs.google.com",
  "forms.gle",
]);

export const RESUME_TEMPLATES = [
  {
    id: "ATS Modern",
    name: "ATS Modern",
    description: "Clean, professional, ATS friendly",
    tag: "Recommended",
  },
  {
    id: "ATS Minimal",
    name: "ATS Minimal",
    description: "Simple and elegant",
  },
  {
    id: "Tech Resume",
    name: "Tech Resume",
    description: "Modern for tech professionals",
  },
];

export const RESUME_PAGE_COUNT = 1; // Default resume page count (e.g. 1, 2)

/**
 * Resolves user-specific resume settings from DB and validates against supported features.
 * This ensures that even if a user sets a random value in DB, the system falls back to valid constants.
 */
export const resolveUserResumeSettings = async (userId) => {
  try {
    const { getUserSettingsService } = await import("../services/setting.service.js");
    const settings = await getUserSettingsService(userId);
    
    const defaults = {
      template: "ATS Modern",
      pageCount: RESUME_PAGE_COUNT
    };

    if (!settings || !settings.resumeSetting) {
      return defaults;
    }

    const { defaultTemplate, targetPages } = settings.resumeSetting;
    
    // Map DB template string to internal constant values
    // Validates that the template chosen exists in our RESUME_TEMPLATES array
    const validTemplates = RESUME_TEMPLATES.map(t => t.id);
    let template = defaults.template;

    if (defaultTemplate) {
      // Find matching template by ID (case insensitive search)
      const found = RESUME_TEMPLATES.find(t => 
        t.id.toLowerCase() === defaultTemplate.toLowerCase() ||
        t.name.toLowerCase() === defaultTemplate.toLowerCase()
      );
      
      if (found) {
        template = found.id;
      } else {
        // Fallback fuzzy matching for legacy values
        const lowerT = defaultTemplate.toLowerCase();
        if (lowerT.includes('modern')) template = "ATS Modern";
        else if (lowerT.includes('minimal')) template = "ATS Minimal";
        else if (lowerT.includes('tech')) template = "Tech Resume";
      }
    }

    return {
      template,
      pageCount: typeof targetPages === 'number' && targetPages > 0 ? targetPages : defaults.pageCount
    };
  } catch (error) {
    return {
      template: "ATS Modern",
      pageCount: RESUME_PAGE_COUNT
    };
  }
};

/**
 * Resolves user preferences for application methods
 */
export const resolveUserApplicationSettings = async (userId) => {
  try {
    const { getUserSettingsService } = await import("../services/setting.service.js");
    const settings = await getUserSettingsService(userId);
    
    const defaults = {
      preferredMethods: Object.values(APPLICATION_METHOD)
    };

    if (!settings || !settings.jobSetting) {
      return defaults;
    }

    const { preferredApplicationMethods } = settings.jobSetting;
    const validMethods = Object.values(APPLICATION_METHOD);

    // Filter out any invalid methods that might be in the DB
    const filteredMethods = (preferredApplicationMethods || []).filter(m => validMethods.includes(m));

    return {
      preferredMethods: filteredMethods.length > 0 ? filteredMethods : defaults.preferredMethods
    };
  } catch (error) {
    return {
      preferredMethods: Object.values(APPLICATION_METHOD)
    };
  }
};
