import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { agentResponseSchema } from '../schema/unknownAgentSchema.js';
import { SYSTEM_PROMPT, buildAgentPrompt } from '../prompt/unknownAgent.prompt.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Summarizes the past step execution history verbatim for the last N steps,
 * while condensing older steps into brief one-line summaries to conserve token context.
 */
export const buildAgentHistoryText = (steps = [], N = 5) => {
  if (!steps || steps.length === 0) return '';

  const lastN = steps.slice(-N);
  const older = steps.slice(0, -N);

  let historyText = '';
  if (older.length > 0) {
    historyText += `--- Older Execution Steps (Summarized) ---\n`;
    older.forEach((step, idx) => {
      historyText += `Step ${idx + 1}: Goal was "${step.nextGoal}". summary: ${step.summary || 'Actions executed successfully'}.\n`;
    });
    historyText += `\n`;
  }

  historyText += `--- Last ${lastN.length} Steps (Verbatim) ---\n`;
  lastN.forEach((step, idx) => {
    historyText += `Step ${older.length + idx + 1}:\n`;
    historyText += `  Previous Goal: ${step.evaluationPreviousGoal || 'N/A'}\n`;
    historyText += `  Memory: ${step.memory || 'N/A'}\n`;
    historyText += `  Goal: ${step.nextGoal || 'N/A'}\n`;
    historyText += `  Actions: ${JSON.stringify(step.actions || [], null, 2)}\n`;
  });

  return historyText;
};

/**
 * Resolves prompt message lists and executes the structured Gemini call
 * with strict schema enforcement, timeout checks, and estimated token counts.
 *
 * @param {object} model - LangChain ChatGoogleGenerativeAI instance
 * @param {object} params
 * @param {string} params.stateText - Current serialized page DOM state
 * @param {Array<object>} params.steps - Historical step list
 * @param {object} params.candidateFacts - Allowed facts object
 * @param {object} params.jobFacts - Target job document
 * @param {object} [params.pendingHumanAnswers] - Verified askHuman approvals
 * @param {string} [params.budgetNotice] - Turn and step budget warnings
 * @param {string} [params.screenshotBase64] - Optional active page image screenshot
 * @param {object} [options]
 * @returns {Promise<object>} Parsed step agent actions response
 */
export const callAgentLlm = async (model, params, options = {}) => {
  const maxRetries = options.maxRetries || 3;
  const timeoutMs = options.timeoutMs || 25000;

  const historyText = buildAgentHistoryText(params.steps || []);
  const promptText = buildAgentPrompt({
    stateText: params.stateText,
    historyText,
    candidateFacts: params.candidateFacts,
    jobFacts: params.jobFacts,
    pendingHumanAnswers: params.pendingHumanAnswers,
    budgetNotice: params.budgetNotice
  });

  // Strict structured JSON validation against the schema
  const structuredModel = model.withStructuredOutput(agentResponseSchema);

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      await logJobEvent(
        'agentLlm',
        'CALL_LLM_START',
        `Requesting structured agent step from Gemini (attempt ${attempt}/${maxRetries})`
      );

      let response;
      if (params.screenshotBase64) {
        const message = new HumanMessage({
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: `data:image/png;base64,${params.screenshotBase64}` }
          ]
        });

        response = await Promise.race([
          structuredModel.invoke([
            new SystemMessage({ content: SYSTEM_PROMPT }),
            message
          ]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Agent Gemini API structured call timed out')), timeoutMs)
          )
        ]);
      } else {
        response = await Promise.race([
          structuredModel.invoke([
            new SystemMessage({ content: SYSTEM_PROMPT }),
            new HumanMessage({ content: promptText })
          ]),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Agent Gemini API structured call timed out')), timeoutMs)
          )
        ]);
      }

      // Token usage estimated calculations (Counts only!)
      const promptChars = promptText.length + SYSTEM_PROMPT.length;
      const respChars = JSON.stringify(response).length;
      const inputTokensEst = Math.ceil(promptChars / 4);
      const outputTokensEst = Math.ceil(respChars / 4);

      await logJobEvent(
        'agentLlm',
        'TOKEN_ACCOUNTING',
        `Token accounting - Est Input Tokens: ${inputTokensEst} | Est Output Tokens: ${outputTokensEst}`
      );

      return response;
    } catch (err) {
      await logError('agentLlm.call', `Attempt ${attempt} failed: ${err.message}`);
      if (attempt >= maxRetries) {
        throw new Error(`Agent structured LLM loop failed after ${maxRetries} tries: ${err.message}`);
      }
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
};

export default {
  buildAgentHistoryText,
  callAgentLlm
};
