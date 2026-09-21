import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GEMINI_API_KEY } from '../../config/env.js';
import { MODEL_NAME, MODEL_TEMPERATURE } from '../../constant/agent.constant.js';
import { tools } from '../tools/all.tools.js';

// Initialize the Gemini LLM with API key from env.js and agent constants
export const geminiModel = new ChatGoogleGenerativeAI({
  model: MODEL_NAME,
  apiKey: GEMINI_API_KEY,
  temperature: MODEL_TEMPERATURE,
});

export const getGeminiModel = () => geminiModel;

// Bind tools to the model
export const agentModel = geminiModel.bindTools(tools);

export { tools };
export default agentModel;
