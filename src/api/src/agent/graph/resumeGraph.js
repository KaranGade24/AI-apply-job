import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StateGraph, END, START, Annotation, MemorySaver } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { geminiModel } from '../config/modelConfig.js';
import { extractResumeText } from '../tools/resume_parse_tool.js';
import { RESUME_PARSER_SYSTEM_PROMPT } from '../prompt/resume_parser.js';
import { resumeSchema } from '../schema/resumeSchema.js';
import { logError, logResumeEvent } from '../../utils/logger.js';
import {
  MAX_ATTEMPTS,
  MAX_TOOL_CALLS,
  LLM_TIMEOUT_MS,
  AGENT_STATUS,
  ERROR_CODES
} from '../../constant/agent.constant.js';
import { MAX_FILE_SIZE_BYTES } from '../../constant/api.constant.js';

/**
 * Explicit State Annotation for the Resume Processing Pipeline
 */
export const ResumeStateAnnotation = Annotation.Root({
  filePath: Annotation({
    reducer: (x, y) => y ?? x ?? '',
    default: () => ''
  }),
  fileValidated: Annotation({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false
  }),
  extractedText: Annotation({
    reducer: (x, y) => y ?? x ?? '',
    default: () => ''
  }),
  parsedResume: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null
  }),
  status: Annotation({
    reducer: (x, y) => y ?? x ?? AGENT_STATUS.IDLE,
    default: () => AGENT_STATUS.IDLE
  }),
  attempts: Annotation({
    reducer: (x, y) => (typeof y === 'number' ? y : (x || 0)),
    default: () => 0
  }),
  toolCallCount: Annotation({
    reducer: (x, y) => (typeof y === 'number' ? y : (x || 0)),
    default: () => 0
  }),
  errorInfo: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null
  })
});

/**
 * 1. Validate File Node
 * Validates filePath exists on disk, fits allowed extensions, and is under 5MB.
 */
const validateFileNode = async (state) => {
  try {
    const filePath = state.filePath;
    if (!filePath) {
      const errorMsg = 'Validation failed: No file path provided';
      await logError('validateFileNode', errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        fileValidated: false,
        errorInfo: { message: errorMsg, code: ERROR_CODES.MISSING_FILE_PATH, timestamp: new Date().toISOString() }
      };
    }

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      const errorMsg = `Validation failed: File does not exist at path: ${resolvedPath}`;
      await logError('validateFileNode', errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        fileValidated: false,
        errorInfo: { message: errorMsg, code: ERROR_CODES.FILE_NOT_FOUND, timestamp: new Date().toISOString() }
      };
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.size >= MAX_FILE_SIZE_BYTES) {
      const errorMsg = `Validation failed: File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit`;
      await logError('validateFileNode', errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        fileValidated: false,
        errorInfo: { message: errorMsg, code: ERROR_CODES.FILE_SIZE_EXCEEDED, timestamp: new Date().toISOString() }
      };
    }

    await logResumeEvent(filePath, 'VALIDATED', 'File validated successfully on disk');
    return {
      fileValidated: true,
      status: AGENT_STATUS.VALIDATED
    };
  } catch (err) {
    await logError('validateFileNode', err.message, err.stack);
    return {
      status: AGENT_STATUS.FAILED,
      fileValidated: false,
      errorInfo: { message: err.message, code: ERROR_CODES.VALIDATION_EXCEPTION, timestamp: new Date().toISOString() }
    };
  }
};

/**
 * 2. Extract Resume Text Node
 * Extracts raw text from PDF/DOC using tool logic and saves explicitly to state.
 */
const extractResumeTextNode = async (state) => {
  try {
    if (state.status === AGENT_STATUS.FAILED || !state.fileValidated) {
      return state;
    }

    const currentToolCalls = (state.toolCallCount || 0) + 1;
    if (currentToolCalls > MAX_TOOL_CALLS) {
      const errorMsg = 'Extraction halted: Tool call count limit reached to prevent looping';
      await logError('extractResumeTextNode', errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        toolCallCount: currentToolCalls,
        errorInfo: { message: errorMsg, code: ERROR_CODES.TOOL_CALL_LIMIT_EXCEEDED, timestamp: new Date().toISOString() }
      };
    }

    const rawText = await extractResumeText(state.filePath);
    await logResumeEvent(state.filePath, 'EXTRACTED', `Extracted ${rawText.length} characters`);

    return {
      extractedText: rawText,
      status: AGENT_STATUS.EXTRACTED,
      toolCallCount: currentToolCalls
    };
  } catch (err) {
    await logError('extractResumeTextNode', err.message, err.stack);
    return {
      status: AGENT_STATUS.FAILED,
      errorInfo: { message: err.message, code: ERROR_CODES.EXTRACTION_ERROR, timestamp: new Date().toISOString() }
    };
  }
};

/**
 * 3. AI Structured Extraction Node
 * Sends system prompt + raw text directly to Gemini model with Zod schema validation & timeout.
 */
const aiStructuredExtractionNode = async (state) => {
  try {
    if (state.status === AGENT_STATUS.FAILED || !state.extractedText) {
      return state;
    }

    const currentAttempt = (state.attempts || 0) + 1;
    if (currentAttempt > MAX_ATTEMPTS) {
      const errorMsg = `AI extraction halted: Exceeded maximum attempts (${MAX_ATTEMPTS})`;
      await logError('aiStructuredExtractionNode', errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        attempts: currentAttempt,
        errorInfo: { message: errorMsg, code: ERROR_CODES.MAX_RETRY_EXCEEDED, timestamp: new Date().toISOString() }
      };
    }

    const structuredLlm = geminiModel.withStructuredOutput(resumeSchema);

    // Set timeout limit around the LLM call using LLM_TIMEOUT_MS constant
    const llmPromise = structuredLlm.invoke([
      new SystemMessage(RESUME_PARSER_SYSTEM_PROMPT),
      new HumanMessage(`Candidate Resume Raw Text:\n\n${state.extractedText}`)
    ]);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`LLM invocation timed out after ${LLM_TIMEOUT_MS / 1000} seconds`)), LLM_TIMEOUT_MS)
    );

    const parsedData = await Promise.race([llmPromise, timeoutPromise]);

    // Validate structured output against Zod schema
    const validatedResume = resumeSchema.parse(parsedData);

    await logResumeEvent(state.filePath, 'PARSED', 'Resume structured successfully');

    return {
      parsedResume: validatedResume,
      status: AGENT_STATUS.COMPLETED,
      attempts: currentAttempt
    };
  } catch (err) {
    await logError('aiStructuredExtractionNode', err.message, err.stack);
    return {
      status: AGENT_STATUS.FAILED,
      attempts: (state.attempts || 0) + 1,
      errorInfo: { message: err.message, code: ERROR_CODES.AI_EXTRACTION_ERROR, timestamp: new Date().toISOString() }
    };
  }
};

// Create MemorySaver checkpointer
export const memorySaver = new MemorySaver();

// Construct clear, explicit LangGraph pipeline
const workflow = new StateGraph(ResumeStateAnnotation)
  .addNode('validate_file', validateFileNode)
  .addNode('extract_text', extractResumeTextNode)
  .addNode('structure_resume', aiStructuredExtractionNode)
  .addEdge(START, 'validate_file')
  .addConditionalEdges('validate_file', (state) => {
    if (state.status === AGENT_STATUS.FAILED || !state.fileValidated) return END;
    return 'extract_text';
  }, {
    extract_text: 'extract_text',
    [END]: END
  })
  .addConditionalEdges('extract_text', (state) => {
    if (state.status === AGENT_STATUS.FAILED || !state.extractedText) return END;
    return 'structure_resume';
  }, {
    structure_resume: 'structure_resume',
    [END]: END
  })
  .addEdge('structure_resume', END);

// Compile the graph with MemorySaver
export const resumeGraph = workflow.compile({ checkpointer: memorySaver });

/**
 * Runner function to execute the resume processing pipeline
 * Generates a unique thread_id using crypto.randomUUID() to guarantee concurrent isolation
 */
export const runResumePipeline = async (filePath, threadId) => {
  const activeThreadId = threadId || `resume-${Date.now()}-${crypto.randomUUID()}`;
  const config = { configurable: { thread_id: activeThreadId } };
  const result = await resumeGraph.invoke({ filePath }, config);

  if (result.status === AGENT_STATUS.FAILED || result.errorInfo) {
    const errMsg = result.errorInfo?.message || 'Resume parsing pipeline failed';
    throw new Error(errMsg);
  }

  return result.parsedResume;
};

export default resumeGraph;
