/**
 * Agent Constants
 */
export const MODEL_NAME = "gemini-1.5-flash";
export const MODEL_TEMPERATURE = 0.1;

export const AI_PROVIDERS = [
  { id: "googleGemini", name: "Google Gemini" },
  { id: "openai", name: "OpenAI (Custom)" },
  { id: "anthropic", name: "Anthropic Claude" },
];

export const AI_MODELS = {
  googleGemini: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
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
    const { getUserSettingsService } = await import("../services/setting.service.js");
    const settings = await getUserSettingsService(userId);
    
    const defaults = {
      model: MODEL_NAME,
      temperature: MODEL_TEMPERATURE,
      provider: "googleGemini"
    };

    if (!settings || !settings.aiSettings) {
      return defaults;
    }

    const { model, temperature, provider } = settings.aiSettings;
    
    // Validate provider
    const activeProvider = AI_PROVIDERS.find(p => p.id === provider) ? provider : defaults.provider;

    // Validate model for the provider
    const allowedModels = AI_MODELS[activeProvider] || [];
    const activeModel = allowedModels.find(m => m.id === model) ? model : (allowedModels[0]?.id || defaults.model);

    return {
      provider: activeProvider,
      model: activeModel,
      temperature: typeof temperature === 'number' && temperature >= 0 && temperature <= 1 ? temperature : defaults.temperature,
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
export const LLM_TIMEOUT_MS = 60000; // 60 seconds timeout for AI structured extraction

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
    const { getUserSettingsService } = await import("../services/setting.service.js");
    const settings = await getUserSettingsService(userId);
    
    const defaults = {
      maxJobsToSearch: SCRAPE_LIMIT_CONFIG.MAX_SCRAPE_LIMIT,
    };

    if (!settings || !settings.jobSetting) {
      return defaults;
    }

    const { maxJobsToSearch } = settings.jobSetting;

    return {
      maxJobsToSearch: typeof maxJobsToSearch === 'number' && maxJobsToSearch > 0 ? maxJobsToSearch : defaults.maxJobsToSearch,
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
export const calculateScrapeLimit = (targetMaxMatched = SCRAPE_LIMIT_CONFIG.DEFAULT_TARGET_MATCHED, userMaxLimit) => {
  const target = targetMaxMatched || SCRAPE_LIMIT_CONFIG.DEFAULT_TARGET_MATCHED;
  const maxLimit = userMaxLimit || SCRAPE_LIMIT_CONFIG.MAX_SCRAPE_LIMIT;
  
  return Math.min(
    Math.max(target * SCRAPE_LIMIT_CONFIG.MULTIPLIER, SCRAPE_LIMIT_CONFIG.MIN_SCRAPE_LIMIT),
    maxLimit
  );
};

export const AGENT_STATUS = {
  IDLE: "IDLE",
  VALIDATED: "VALIDATED",
  EXTRACTED: "EXTRACTED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};

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
