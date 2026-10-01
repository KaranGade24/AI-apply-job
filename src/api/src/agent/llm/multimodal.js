import { HumanMessage } from '@langchain/core/messages';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Invokes the Gemini model with a multimodal payload (text + screenshot image)
 * with bounded retries and timeout boundaries.
 *
 * @param {object} model - LangChain ChatGoogleGenerativeAI instance
 * @param {string} promptText - The instruction or state serialization text
 * @param {string} base64Image - Base64 encoded PNG screenshot
 * @param {object} [options]
 * @param {number} [options.maxRetries=3] - Maximum number of attempts
 * @param {number} [options.timeoutMs=20000] - Request timeout duration
 * @returns {Promise<any>} Invocation response
 */
export const invokeMultimodal = async (model, promptText, base64Image, options = {}) => {
  const maxRetries = options.maxRetries || 3;
  const timeoutMs = options.timeoutMs || 20000;

  const message = new HumanMessage({
    content: [
      {
        type: 'text',
        text: promptText,
      },
      {
        type: 'image_url',
        image_url: `data:image/png;base64,${base64Image}`
      }
    ]
  });

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      await logJobEvent(
        'multimodalLlm',
        'INVOKE_START',
        `Sending multimodal request to Gemini (attempt ${attempt}/${maxRetries})`
      );

      const response = await Promise.race([
        model.invoke([message]),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini multimodal API call timed out')), timeoutMs)
        )
      ]);

      await logJobEvent('multimodalLlm', 'INVOKE_SUCCESS', 'Gemini successfully responded to multimodal payload');
      return response;
    } catch (err) {
      await logError('multimodalLlm.invoke', `Attempt ${attempt} failed: ${err.message}`);
      if (attempt >= maxRetries) {
        throw new Error(`Gemini multimodal invocation failed after ${maxRetries} attempts: ${err.message}`);
      }
      // Wait before retrying (exponential backoff)
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

export default {
  invokeMultimodal
};
