import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY } from '../../config/env.js';
import { MODEL_NAME, MODEL_TEMPERATURE, resolveUserAiSettings } from '../../constant/agent.constant.js';
import { tools } from '../tools/all.tools.js';
import { logError } from '../../utils/logger.js';

/**
 * Enhanced invoke wrapper that handles 429 Quota Exceeded with automated backoff retry.
 */
const wrapModelInvoke = (model) => {
  const originalInvoke = model.invoke.bind(model);
  
  model.invoke = async (input, config) => {
    let attempts = 0;
    const maxAttempts = 3;
    const baseDelay = 18000; // 18 seconds (Gemini free tier quota resets roughly every 15-20s)

    while (attempts < maxAttempts) {
      try {
        return await originalInvoke(input, config);
      } catch (error) {
        const errorMsg = String(error.message || error);
        if (errorMsg.includes('429') || errorMsg.includes('Quota exceeded')) {
          attempts++;
          if (attempts >= maxAttempts) throw error;
          
          const delay = baseDelay + (Math.random() * 5000);
          await logError('modelConfig.invoke', `429 Quota Exceeded. Retrying in ${Math.round(delay/1000)}s... (Attempt ${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }
  };
  return model;
};

/**
 * Returns a Gemini model instance tailored to the user's settings with automated fallback.
 * @param {string} [userId]
 * @returns {Promise<ChatGoogleGenerativeAI>}
 */
export const getGeminiModel = async (userId) => {
  const { model, temperature } = userId 
    ? await resolveUserAiSettings(userId) 
    : { model: MODEL_NAME, temperature: MODEL_TEMPERATURE };

  const targetModel = model || MODEL_NAME;

  const instance = new ChatGoogleGenerativeAI({
    model: targetModel,
    apiKey: GEMINI_API_KEY,
    temperature,
    maxRetries: 1, // We handle retries manually for 429
  });

  return wrapModelInvoke(instance);
};

// Default singleton instance for general tasks
export const geminiModel = wrapModelInvoke(new ChatGoogleGenerativeAI({
  model: MODEL_NAME,
  apiKey: GEMINI_API_KEY,
  temperature: MODEL_TEMPERATURE,
  maxRetries: 1,
}));

// Bind tools to the default model for legacy compatibility
export const agentModel = geminiModel.bindTools(tools);

export { tools };
export default agentModel;

