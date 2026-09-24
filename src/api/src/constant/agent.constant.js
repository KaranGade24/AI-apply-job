/**
 * Agent Constants
 */
export const MODEL_NAME = "gemini-2.0-flash";
export const MODEL_TEMPERATURE = 0.1;

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
    };

    if (!settings || !settings.aiSettings) {
      return defaults;
    }

    const { model, temperature } = settings.aiSettings;
    
    // Basic validation for model name - could be expanded to a list of allowed models
    const activeModel = model && typeof model === 'string' && model.startsWith('gemini-') ? model : defaults.model;

    return {
      model: activeModel,
      temperature: typeof temperature === 'number' && temperature >= 0 && temperature <= 1 ? temperature : defaults.temperature,
    };
  } catch (error) {
    return {
      model: MODEL_NAME,
      temperature: MODEL_TEMPERATURE,
    };
  }
};

export const MAX_ATTEMPTS = 3;
export const MAX_TOOL_CALLS = 2;
export const LLM_TIMEOUT_MS = 60000; // 60 seconds timeout for AI structured extraction

export const SCRAPE_LIMIT_CONFIG = Object.freeze({
  DEFAULT_TARGET_MATCHED: 5,
  MULTIPLIER: 10,
  MIN_SCRAPE_LIMIT: 40,
  MAX_SCRAPE_LIMIT: 50,
});

/**
 * Calculates the scrape limit based on requested target matched jobs
 * @param {number} targetMaxMatched
 * @returns {number}
 */
export const calculateScrapeLimit = (targetMaxMatched = SCRAPE_LIMIT_CONFIG.DEFAULT_TARGET_MATCHED) => {
  const target = targetMaxMatched || SCRAPE_LIMIT_CONFIG.DEFAULT_TARGET_MATCHED;
  return Math.min(
    Math.max(target * SCRAPE_LIMIT_CONFIG.MULTIPLIER, SCRAPE_LIMIT_CONFIG.MIN_SCRAPE_LIMIT),
    SCRAPE_LIMIT_CONFIG.MAX_SCRAPE_LIMIT
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
