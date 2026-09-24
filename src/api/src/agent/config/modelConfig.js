import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY } from '../../config/env.js';
import { MODEL_NAME, MODEL_TEMPERATURE, resolveUserAiSettings } from '../../constant/agent.constant.js';
import { tools } from '../tools/all.tools.js';

/**
 * Returns a Gemini model instance tailored to the user's settings.
 * @param {string} [userId]
 * @returns {Promise<ChatGoogleGenerativeAI>}
 */
export const getGeminiModel = async (userId) => {
  const { model, temperature } = userId 
    ? await resolveUserAiSettings(userId) 
    : { model: MODEL_NAME, temperature: MODEL_TEMPERATURE };

  return new ChatGoogleGenerativeAI({
    model,
    apiKey: GEMINI_API_KEY,
    temperature,
  });
};

// Default singleton instance for general tasks
export const geminiModel = new ChatGoogleGenerativeAI({
  model: MODEL_NAME,
  apiKey: GEMINI_API_KEY,
  temperature: MODEL_TEMPERATURE,
});

// Bind tools to the default model for legacy compatibility
export const agentModel = geminiModel.bindTools(tools);

export { tools };
export default agentModel;
