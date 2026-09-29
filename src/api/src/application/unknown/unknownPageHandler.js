import { logJobEvent, logError } from '../../utils/logger.js';
import { executeAgentLoop } from './agentLoop.js';
import { dispatchMethodHandoff } from './handoffRouter.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';

/**
 * Autonomous Browser Agent for Unknown / Generic Application URLs.
 *
 * Fully replaces the legacy step-based loop with a persistent
 * Observe → Analyze → Decide → Act → Verify agent loop with:
 * - State and memory persistence (agentState.js)
 * - Page fingerprinting and loop detection
 * - Automatic post-action verification
 * - Dynamic method handoff (Google Form, direct Email, Phone)
 * - Human-in-the-loop escalation (CAPTCHA, OTP, login, ambiguous questions)
 * - Waiting-for-final-review submission checkpoint
 *
 * @param {object} params
 * @param {string} params.url - URL to navigate to
 * @param {object} params.job - Job document
 * @param {string} params.userId - Candidate user ID
 * @param {string} [params.applicationId] - Application document ID
 * @param {string} [params.resumePdfPath] - Local tailored resume PDF path
 * @param {object} [params.candidateInfo] - Parsed candidate resume details
 * @param {object} [params.sessionState] - Optional saved browser session state
 * @returns {Promise<object>} Execution result with status, detectedMethod, and state
 */
export const executeAutonomousUnknownApplication = async ({
  url,
  job = {},
  userId = null,
  applicationId = null,
  resumePdfPath = null,
  candidateInfo = null,
  sessionState = null,
}) => {
  try {
    if (!url) {
      throw new Error('No URL provided for autonomous browser agent execution');
    }

    await logJobEvent(
      'unknownPageHandler',
      'AGENT_START',
      `Launching Observe-Analyze-Decide-Act-Verify agent for: ${url} (Job: "${job.title || 'Position'}")`
    );

    // 1. Run the core Observe-Analyze-Decide-Act-Verify agent loop
    const agentResult = await executeAgentLoop({
      url,
      job,
      userId,
      applicationId,
      resumePdfPath,
      candidateInfo,
      sessionState,
    });

    // 2. Check if a dynamic method handoff was triggered
    if (agentResult.handoff) {
      await logJobEvent(
        'unknownPageHandler',
        'DISPATCH_HANDOFF',
        `Discovered specialized application method: ${agentResult.handoff.method}`
      );

      const handoffResult = await dispatchMethodHandoff({
        method: agentResult.handoff.method,
        context: {
          url: agentResult.handoff.url,
          applicationId,
          userId,
          job,
          candidateInfo,
          pageClassification: agentResult.handoff.pageClassification,
          agentState: agentResult.agentState,
        },
      });

      return {
        ...agentResult,
        handoffExecuted: true,
        handoffResult,
        detectedMethod: agentResult.handoff.method,
      };
    }

    return {
      ...agentResult,
      detectedMethod: agentResult.agentState?.discoveredMethod || 'unknown',
    };
  } catch (error) {
    await logError('unknownPageHandler.executeAutonomousUnknownApplication', error.message);
    return {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      terminalState: 'failed',
      pageUrl: url,
      message: `Agent execution failed: ${error.message}`,
      error: error.message,
    };
  }
};
