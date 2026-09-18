import crypto from 'crypto';
import resumeGraph from './graph/resumeGraph.js';
import { logError, logResumeEvent } from '../utils/logger.js';
import { appError } from '../utils/errors.js';

/**
 * Agent Registry
 */
export const agents = Object.freeze({
  resume: resumeGraph
});

/**
 * Retrieves a registered agent by name
 * @param {string} agentName - Name of the registered agent graph
 * @returns {object} Compiled LangGraph agent
 */
export const getAgent = (agentName) => {
  const agent = agents[agentName];
  if (!agent) {
    throw new appError(`Unknown agent: ${agentName}`, 404);
  }
  return agent;
};

/**
 * Central Universal Agent Runner
 * Resolves agent graph, generates unique thread_id automatically, handles logging, executes graph & extracts result.
 * @param {string} agentName - Name of the agent (e.g. 'resume')
 * @param {object} input - Input state payload (e.g. { filePath: '...' })
 * @param {object} options - Options including userId, threadId, or configurable object
 * @returns {Promise<object>} Final execution result or structured payload
 */
export const runAgent = async (agentName, input = {}, options = {}) => {
  try {
    const agent = getAgent(agentName);

    // Build unique, collision-free thread ID automatically for concurrent users
    const userTag = options.userId ? `usr-${options.userId}` : 'anon';
    const threadId =
      options.threadId ||
      options.configurable?.thread_id ||
      `${agentName}-${userTag}-${Date.now()}-${crypto.randomUUID()}`;

    const config = {
      configurable: {
        thread_id: threadId,
        ...(options.configurable || {})
      }
    };

    await logResumeEvent(
      input.filePath || agentName,
      'AGENT_RUN_START',
      `Executing ${agentName} agent on thread: ${threadId}`
    );

    // Invoke the agent graph
    const result = await agent.invoke(input, config);

    // Validate execution output status
    if (result.status === 'FAILED' || result.errorInfo) {
      const errMsg = result.errorInfo?.message || `${agentName} agent execution failed`;
      throw new appError(errMsg, 500);
    }

    await logResumeEvent(
      input.filePath || agentName,
      'AGENT_RUN_COMPLETE',
      `${agentName} agent completed successfully on thread: ${threadId}`
    );

    // If result contains parsedResume payload, return that directly for convenience
    if (result.parsedResume !== undefined) {
      return result.parsedResume;
    }

    return result;
  } catch (error) {
    await logError(`runAgent.${agentName}`, error.message, error.stack);
    if (error.isOperational) {
      throw error;
    }
    throw new appError(`Agent execution failed (${agentName}): ${error.message}`, 500);
  }
};

/**
 * Wrapper helpers delegating directly to runAgent
 */
export const executeResumePipeline = async (filePath, options = {}) => {
  return runAgent('resume', { filePath }, options);
};

export const retryResumePipeline = async (filePath, previousThreadId = null, options = {}) => {
  const userTag = options.userId ? `usr-${options.userId}` : 'anon';
  const newThreadId = `resume-retry-${userTag}-${Date.now()}-${crypto.randomUUID()}`;
  return runAgent('resume', { filePath }, { ...options, threadId: newThreadId });
};

export default {
  agents,
  getAgent,
  runAgent,
  executeResumePipeline,
  retryResumePipeline
};
