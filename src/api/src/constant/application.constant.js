/**
 * Application Constant Definitions
 */

export const APPLICATION_STATUS = Object.freeze({
  PENDING: "pending",
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
});

export const APPLICATION_METHOD = Object.freeze({
  EMAIL: "email",
  PHONE: "phone",
  GOOGLE_FORM: "googleForm",
  WEBSITE_FORM: "websiteForm",
  UNKNOWN: "unknown",
});

export const RESUME_PDF_TEMPLATES = Object.freeze({
  MODERN: "modern",
  MINIMAL: "minimal",
  ATS: "ats",
});

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
      template: RESUME_PDF_TEMPLATES.MODERN,
      pageCount: RESUME_PAGE_COUNT
    };

    if (!settings || !settings.resumeSetting) {
      return defaults;
    }

    const { defaultTemplate, targetPages } = settings.resumeSetting;
    
    // Map DB template string to internal constant values
    // Validates that the template chosen exists in our RESUME_PDF_TEMPLATES enum
    const validTemplates = Object.values(RESUME_PDF_TEMPLATES);
    let template = defaults.template;

    if (defaultTemplate) {
      const lowerT = defaultTemplate.toLowerCase();
      if (lowerT.includes('modern')) template = RESUME_PDF_TEMPLATES.MODERN;
      else if (lowerT.includes('minimal')) template = RESUME_PDF_TEMPLATES.MINIMAL;
      else if (lowerT.includes('ats')) template = RESUME_PDF_TEMPLATES.ATS;
      
      // Strict check if it matches exactly after normalization
      if (!validTemplates.includes(template)) {
        template = defaults.template;
      }
    }

    return {
      template,
      pageCount: typeof targetPages === 'number' && targetPages > 0 ? targetPages : defaults.pageCount
    };
  } catch (error) {
    return {
      template: RESUME_PDF_TEMPLATES.ATS,
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
