/**
 * Agent Constants
 */
export const MODEL_NAME = "gemini-2.5-flash";
export const MODEL_TEMPERATURE = 0.1;

// Dedicated Structured Extraction Model for Resume Parsing
export const RESUME_PARSER_MODEL_NAME = "gemini-2.5-flash";
export const RESUME_PARSER_TEMPERATURE = 0.0;
export const RESUME_PARSER_TIMEOUT_MS = 90000;

export const AI_PROVIDERS = [
  { id: "googleGemini", name: "Google Gemini" },
  { id: "openai", name: "OpenAI (Custom)" },
  { id: "anthropic", name: "Anthropic Claude" },
];

export const AI_MODELS = {
  googleGemini: [
    { id: "gemini-2.5-flash-lite", name: "gemini-2.5-flash-lite" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash (Latest)" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Latest)" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini" },
  ],
  anthropic: [{ id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" }],
};

/**
 * Resolves user-specific AI settings from DB and validates against supported features.
 */
export const resolveUserAiSettings = async (userId) => {
  try {
    const { getUserSettingsService } =
      await import("../services/setting.service.js");
    const settings = await getUserSettingsService(userId);

    const defaults = {
      model: MODEL_NAME,
      temperature: MODEL_TEMPERATURE,
      provider: "googleGemini",
    };

    if (!settings || !settings.aiSettings) {
      return defaults;
    }

    const { model, temperature, provider } = settings.aiSettings;

    // Validate provider
    const activeProvider = AI_PROVIDERS.find((p) => p.id === provider)
      ? provider
      : defaults.provider;

    // Validate model for the provider
    const allowedModels = AI_MODELS[activeProvider] || [];
    const activeModel = allowedModels.find((m) => m.id === model)
      ? model
      : allowedModels[0]?.id || defaults.model;

    return {
      provider: activeProvider,
      model: activeModel,
      temperature:
        typeof temperature === "number" && temperature >= 0 && temperature <= 1
          ? temperature
          : defaults.temperature,
    };
  } catch (error) {
    return {
      provider: "googleGemini",
      model: MODEL_NAME,
      temperature: MODEL_TEMPERATURE,
    };
  }
};

export const MAX_ATTEMPTS = 3;
export const MAX_DISCOVERY_ATTEMPTS = 3;
export const MAX_TOOL_CALLS = 2;
export const LLM_TIMEOUT_MS = 90000; // 90 seconds timeout for AI structured extraction

// Agent execution limits and timeouts
export const MAX_AGENT_STEPS = 50;
export const MAX_ACTION_RETRIES = 3;
export const MAX_ELEMENTS_IN_PROMPT = 60;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours in ms
export const DEFAULT_PAGE_TIMEOUT_MS = 30000;
export const DEFAULT_ACTION_TIMEOUT_MS = 10000;

export const SCRAPE_LIMIT_CONFIG = Object.freeze({
  DEFAULT_TARGET_MATCHED: 10,
  MULTIPLIER: 5,
  MIN_SCRAPE_LIMIT: 10,
  MAX_SCRAPE_LIMIT: 100,
});

/**
 * Resolves user-specific Job Search settings from DB.
 */
export const resolveUserJobSearchSettings = async (userId) => {
  try {
    const { getUserSettingsService } =
      await import("../services/setting.service.js");
    const settings = await getUserSettingsService(userId);

    const defaults = {
      maxJobsToSearch: SCRAPE_LIMIT_CONFIG.MAX_SCRAPE_LIMIT,
    };

    if (!settings || !settings.jobSetting) {
      return defaults;
    }

    const { maxJobsToSearch } = settings.jobSetting;

    return {
      maxJobsToSearch:
        typeof maxJobsToSearch === "number" && maxJobsToSearch > 0
          ? maxJobsToSearch
          : defaults.maxJobsToSearch,
    };
  } catch (error) {
    return {
      maxJobsToSearch: SCRAPE_LIMIT_CONFIG.MAX_SCRAPE_LIMIT,
    };
  }
};

/**
 * Calculates the scrape limit based on requested target matched jobs
 * @param {number} targetMaxMatched
 * @param {number} userMaxLimit - Optional user defined max limit from settings
 * @returns {number}
 */
export const calculateScrapeLimit = (
  targetMaxMatched = SCRAPE_LIMIT_CONFIG.DEFAULT_TARGET_MATCHED,
  userMaxLimit,
) => {
  const target = targetMaxMatched || SCRAPE_LIMIT_CONFIG.DEFAULT_TARGET_MATCHED;
  const maxLimit = userMaxLimit || SCRAPE_LIMIT_CONFIG.MAX_SCRAPE_LIMIT;

  return Math.min(
    Math.max(
      target * SCRAPE_LIMIT_CONFIG.MULTIPLIER,
      SCRAPE_LIMIT_CONFIG.MIN_SCRAPE_LIMIT,
    ),
    maxLimit,
  );
};

export const AGENT_STATUS = Object.freeze({
  STARTING: "STARTING",
  OPENING_SITE: "OPENING_SITE",
  ANALYZING_PAGE: "ANALYZING_PAGE",
  NAVIGATING: "NAVIGATING",
  DETECTING_FORM: "DETECTING_FORM",
  FILLING: "FILLING",
  WAITING_FOR_USER: "WAITING_FOR_USER",
  WAITING_FOR_HUMAN: "WAITING_FOR_HUMAN",
  WAITING_FOR_CONFIRMATION: "WAITING_FOR_CONFIRMATION",
  SUBMITTING: "SUBMITTING",
  VERIFYING: "VERIFYING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
  // Legacy values preserved for backward compatibility
  IDLE: "IDLE",
  VALIDATED: "VALIDATED",
  EXTRACTED: "EXTRACTED",
});

export const CONTROL_MODES = Object.freeze({
  AI: "AI",
  HUMAN: "HUMAN",
});

export const HUMAN_INTERVENTION_REASONS = Object.freeze({
  CAPTCHA_REQUIRED: "CAPTCHA_REQUIRED",
  MFA_REQUIRED: "MFA_REQUIRED",
  TWO_FACTOR_REQUIRED: "TWO_FACTOR_REQUIRED",
  EMAIL_VERIFICATION_REQUIRED: "EMAIL_VERIFICATION_REQUIRED",
  LOGIN_CHALLENGE: "LOGIN_CHALLENGE",
  HUMAN_VERIFICATION: "HUMAN_VERIFICATION",
  SECURITY_CHECKPOINT: "SECURITY_CHECKPOINT",
  MANUAL_LOGIN_REQUIRED: "MANUAL_LOGIN_REQUIRED",
  MANUAL_ACTION_REQUIRED: "MANUAL_ACTION_REQUIRED",
});

export const REALTIME_EVENTS = Object.freeze({
  BROWSER_STARTED: "BROWSER_STARTED",
  PAGE_CHANGED: "PAGE_CHANGED",
  AI_ACTION: "AI_ACTION",
  AI_ACTION_COMPLETED: "AI_ACTION_COMPLETED",
  HUMAN_INTERVENTION_REQUIRED: "HUMAN_INTERVENTION_REQUIRED",
  HUMAN_CONTROL_STARTED: "HUMAN_CONTROL_STARTED",
  HUMAN_CONTROL_ENDED: "HUMAN_CONTROL_ENDED",
  CAPTCHA_DETECTED: "CAPTCHA_DETECTED",
  MFA_DETECTED: "MFA_DETECTED",
  TWO_FACTOR_DETECTED: "TWO_FACTOR_DETECTED",
  EMAIL_VERIFICATION_REQUIRED: "EMAIL_VERIFICATION_REQUIRED",
  LOGIN_CHALLENGE_DETECTED: "LOGIN_CHALLENGE_DETECTED",
  SECURITY_CHECKPOINT_DETECTED: "SECURITY_CHECKPOINT_DETECTED",
  HUMAN_VERIFICATION_REQUIRED: "HUMAN_VERIFICATION_REQUIRED",
  VERIFICATION_COMPLETED: "VERIFICATION_COMPLETED",
  AI_RESUMED: "AI_RESUMED",
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  ERROR: "ERROR",
});

export const ERROR_CODES = {
  MISSING_FILE_PATH: "MISSING_FILE_PATH",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  FILE_SIZE_EXCEEDED: "FILE_SIZE_EXCEEDED",
  VALIDATION_EXCEPTION: "VALIDATION_EXCEPTION",
  TOOL_CALL_LIMIT_EXCEEDED: "TOOL_CALL_LIMIT_EXCEEDED",
  EXTRACTION_ERROR: "EXTRACTION_ERROR",
  MAX_RETRY_EXCEEDED: "MAX_RETRY_EXCEEDED",
  AI_EXTRACTION_ERROR: "AI_EXTRACTION_ERROR",
};

export const PERCEPTION_PAGE_TYPES = Object.freeze({
  UNKNOWN: "UNKNOWN",
  JOB_DETAIL: "JOB_DETAIL",
  APPLICATION_START: "APPLICATION_START",
  LOGIN: "LOGIN",
  SIGNUP: "SIGNUP",
  APPLICATION_FORM: "APPLICATION_FORM",
  QUESTION_FORM: "QUESTION_FORM",
  RESUME_UPLOAD: "RESUME_UPLOAD",
  REVIEW: "REVIEW",
  SUBMISSION_SUCCESS: "SUBMISSION_SUCCESS",
  ERROR: "ERROR",
  CAPTCHA_OR_BLOCKED: "CAPTCHA_OR_BLOCKED",
  EXTERNAL_REDIRECT: "EXTERNAL_REDIRECT",
  JOB_LIST: "JOB_LIST",
});

export const ACTION_FAILURE_TYPES = Object.freeze({
  ELEMENT_GONE: "ELEMENT_GONE",
  STALE_SNAPSHOT: "STALE_SNAPSHOT",
  TIMEOUT: "TIMEOUT",
  DISABLED: "DISABLED",
  NAVIGATION_FAILED: "NAVIGATION_FAILED",
  BLOCKED: "BLOCKED",
  UNKNOWN: "UNKNOWN",
});

export const DEEP_DIVE_ACTIONS = Object.freeze({
  NAVIGATE: "navigate",
  CLICK: "click",
  TYPE: "type",
  SELECT: "select",
  CHECK: "check",
  UNCHECK: "uncheck",
  UPLOAD: "upload",
  SCROLL: "scroll",
  WAIT: "wait",
  PRESS: "press",
  GOBACK: "goBack",
  ANSWER_QUESTION: "answerQuestion",
  SUBMIT: "submit",
  FINISH: "finish",
  HUMAN_INTERVENTION: "humanIntervention",
});

export const HUMAN_INTERVENTION_REASONS = Object.freeze({
  CAPTCHA: "CAPTCHA",
  TWO_FACTOR: "TWO_FACTOR",
  UNKNOWN_AUTH: "UNKNOWN_AUTH",
  LEGAL_CONSENT: "LEGAL_CONSENT",
  SENSITIVE_DATA: "SENSITIVE_DATA",
  UNEXPECTED_PAGE: "UNEXPECTED_PAGE",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
});

export const DISABLED_BUTTON_REASONS = Object.freeze({
  REQUIRED_FIELD_EMPTY: "REQUIRED_FIELD_EMPTY",
  TERMS_UNCHECKED: "TERMS_UNCHECKED",
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  LOCATION_UNSELECTED: "LOCATION_UNSELECTED",
  RESUME_MISSING: "RESUME_MISSING",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  PAGE_STILL_LOADING: "PAGE_STILL_LOADING",
  PERMANENTLY_DISABLED: "PERMANENTLY_DISABLED",
});

