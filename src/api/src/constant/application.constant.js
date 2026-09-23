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
  REJECTED: "rejected",
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

export const RESUME_PAGE_COUNT = 2; // Default resume page count (e.g. 1, 2)
