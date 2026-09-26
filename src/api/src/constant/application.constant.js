/**
 * Application Constant Definitions
 */

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
  // Browser application workflow statuses
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
});

export const APPLICATION_METHOD = Object.freeze({
  EMAIL: "email",
  PHONE: "phone",
  GOOGLE_FORM: "googleForm",
  WEBSITE_FORM: "websiteForm",
  UNKNOWN: "unknown",
});

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
