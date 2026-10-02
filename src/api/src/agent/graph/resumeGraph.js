import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  StateGraph,
  END,
  START,
  Annotation,
  MemorySaver,
} from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getResumeParserModel } from "../config/modelConfig.js";
import { extractResumeText } from "../tools/resumeParse.tool.js";
import {
  RESUME_PARSER_SYSTEM_PROMPT,
  buildResumeParsePrompt,
} from "../prompt/resumeParser.js";
import { resumeSchema } from "../schema/resumeSchema.js";
import { logError, logResumeEvent } from "../../utils/logger.js";
import {
  MAX_ATTEMPTS,
  MAX_TOOL_CALLS,
  RESUME_PARSER_TIMEOUT_MS,
  AGENT_STATUS,
  ERROR_CODES,
} from "../../constant/agent.constant.js";
import { MAX_FILE_SIZE_BYTES } from "../../constant/api.constant.js";

/**
 * Canonical State Annotation for the Resume Processing Pipeline
 */
export const ResumeStateAnnotation = Annotation.Root({
  filePath: Annotation({
    reducer: (x, y) => y ?? x ?? "",
    default: () => "",
  }),

  fileValidated: Annotation({
    reducer: (x, y) => y ?? x ?? false,
    default: () => false,
  }),

  extractedResumeData: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),

  parsedResume: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),

  status: Annotation({
    reducer: (x, y) => y ?? x ?? AGENT_STATUS.IDLE,
    default: () => AGENT_STATUS.IDLE,
  }),

  attempts: Annotation({
    reducer: (x, y) => (typeof y === "number" ? y : x || 0),
    default: () => 0,
  }),

  toolCallCount: Annotation({
    reducer: (x, y) => (typeof y === "number" ? y : x || 0),
    default: () => 0,
  }),

  errorInfo: Annotation({
    reducer: (x, y) => y ?? x ?? null,
    default: () => null,
  }),
});

/**
 * 1. Validate File Node
 * Validates filePath exists on disk, fits allowed extensions, and is under 5MB.
 */
const validateFileNode = async (state) => {
  try {
    const filePath = state.filePath;
    if (!filePath) {
      const errorMsg = "Validation failed: No file path provided";
      await logError("validateFileNode", errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        fileValidated: false,
        errorInfo: {
          message: errorMsg,
          code: ERROR_CODES.MISSING_FILE_PATH,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);

    if (!fs.existsSync(resolvedPath)) {
      const errorMsg = `Validation failed: File does not exist at path: ${resolvedPath}`;
      await logError("validateFileNode", errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        fileValidated: false,
        errorInfo: {
          message: errorMsg,
          code: ERROR_CODES.FILE_NOT_FOUND,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const ext = path.extname(resolvedPath).toLowerCase();
    if (ext === ".doc") {
      const errorMsg = "Validation failed: Legacy binary .doc is not supported. Please upload .pdf or .docx.";
      await logError("validateFileNode", errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        fileValidated: false,
        errorInfo: {
          message: errorMsg,
          code: ERROR_CODES.VALIDATION_EXCEPTION,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const stats = fs.statSync(resolvedPath);
    if (stats.size >= MAX_FILE_SIZE_BYTES) {
      const errorMsg = `Validation failed: File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit of 5MB`;
      await logError("validateFileNode", errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        fileValidated: false,
        errorInfo: {
          message: errorMsg,
          code: ERROR_CODES.FILE_SIZE_EXCEEDED,
          timestamp: new Date().toISOString(),
        },
      };
    }

    await logResumeEvent(
      filePath,
      "VALIDATED",
      `File validated successfully (${ext}, ${(stats.size / 1024).toFixed(1)} KB)`
    );

    return {
      fileValidated: true,
      status: AGENT_STATUS.VALIDATED,
    };
  } catch (err) {
    await logError("validateFileNode", err.message, err.stack);
    return {
      status: AGENT_STATUS.FAILED,
      fileValidated: false,
      errorInfo: {
        message: err.message,
        code: ERROR_CODES.VALIDATION_EXCEPTION,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

/**
 * 2. Extract Resume Text Node
 * Extracts readable text, candidate links, and project hyperlinks into structured evidence.
 */
const extractResumeTextNode = async (state) => {
  try {
    if (state.status === AGENT_STATUS.FAILED || !state.fileValidated) {
      return state;
    }

    const currentToolCalls = (state.toolCallCount || 0) + 1;
    if (currentToolCalls > MAX_TOOL_CALLS) {
      const errorMsg = "Extraction halted: Tool call count limit exceeded";
      await logError("extractResumeTextNode", errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        toolCallCount: currentToolCalls,
        errorInfo: {
          message: errorMsg,
          code: ERROR_CODES.TOOL_CALL_LIMIT_EXCEEDED,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const resumeData = await extractResumeText(state.filePath);

    if (!resumeData || typeof resumeData.text !== "string" || !resumeData.text.trim()) {
      throw new Error("Resume extraction returned empty text content");
    }

    await logResumeEvent(
      state.filePath,
      "EXTRACTED",
      `Text length: ${resumeData.text.length}, Hyperlinks: ${resumeData.hyperlinks?.length || 0}, Project links: ${resumeData.projectLinks?.length || 0}`
    );

    return {
      extractedResumeData: resumeData,
      status: AGENT_STATUS.EXTRACTED,
      toolCallCount: currentToolCalls,
    };
  } catch (err) {
    await logError("extractResumeTextNode", err.message, err.stack);
    return {
      status: AGENT_STATUS.FAILED,
      errorInfo: {
        message: err.message,
        code: ERROR_CODES.EXTRACTION_ERROR,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

/**
 * 3. AI Structured Extraction Node
 * Uses dedicated structured Gemini model with Zod schema validation & timeout.
 */
const aiStructuredExtractionNode = async (state) => {
  try {
    if (
      state.status === AGENT_STATUS.FAILED ||
      !state.extractedResumeData?.text
    ) {
      return state;
    }

    const currentAttempt = (state.attempts || 0) + 1;
    if (currentAttempt > MAX_ATTEMPTS) {
      const errorMsg = `AI extraction halted: Exceeded maximum attempts (${MAX_ATTEMPTS})`;
      await logError("aiStructuredExtractionNode", errorMsg);
      return {
        status: AGENT_STATUS.FAILED,
        attempts: currentAttempt,
        errorInfo: {
          message: errorMsg,
          code: ERROR_CODES.MAX_RETRY_EXCEEDED,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const evidence = state.extractedResumeData;
    const promptText = buildResumeParsePrompt({
      text: evidence.text,
      candidateLinks: evidence.candidateLinks || evidence.resumeLinks || {},
      projectLinks: evidence.projectLinks || [],
      hyperlinks: evidence.hyperlinks || [],
    });

    // Use dedicated resume parser model configuration for determinism & stability
    const parserModel = getResumeParserModel();
    const structuredLlm = parserModel.withStructuredOutput(resumeSchema);

    const llmPromise = structuredLlm.invoke([
      new SystemMessage(RESUME_PARSER_SYSTEM_PROMPT),
      new HumanMessage(promptText),
    ]);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `LLM resume parsing timed out after ${RESUME_PARSER_TIMEOUT_MS / 1000} seconds`
            )
          ),
        RESUME_PARSER_TIMEOUT_MS
      );
    });

    const parsedData = await Promise.race([llmPromise, timeoutPromise]);

    // Strictly validate against the canonical Zod schema
    const validatedResume = resumeSchema.parse(parsedData);

    // Safeguard candidate contact links from evidence if model omitted them
    if (evidence.candidateLinks?.email && !validatedResume.personalInfo.email) {
      validatedResume.personalInfo.email = evidence.candidateLinks.email;
    }
    if (evidence.candidateLinks?.linkedin && !validatedResume.personalInfo.linkedin) {
      validatedResume.personalInfo.linkedin = evidence.candidateLinks.linkedin;
    }
    if (evidence.candidateLinks?.github && !validatedResume.personalInfo.github) {
      validatedResume.personalInfo.github = evidence.candidateLinks.github;
    }
    if (evidence.candidateLinks?.website && !validatedResume.personalInfo.website) {
      validatedResume.personalInfo.website = evidence.candidateLinks.website;
    }

    await logResumeEvent(
      state.filePath,
      "PARSED",
      `Resume structured successfully: ${validatedResume.workExperience.length} roles, ${validatedResume.projects.length} projects, ${validatedResume.education.length} degrees`
    );

    return {
      parsedResume: validatedResume,
      status: AGENT_STATUS.COMPLETED,
      attempts: currentAttempt,
    };
  } catch (err) {
    await logError("aiStructuredExtractionNode", err.message, err.stack);
    return {
      status: AGENT_STATUS.FAILED,
      attempts: (state.attempts || 0) + 1,
      errorInfo: {
        message: err.message,
        code: ERROR_CODES.AI_EXTRACTION_ERROR,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Create MemorySaver checkpointer
export const memorySaver = new MemorySaver();

// Construct clear, explicit LangGraph pipeline
const workflow = new StateGraph(ResumeStateAnnotation)
  .addNode("validate_file", validateFileNode)
  .addNode("extract_text", extractResumeTextNode)
  .addNode("structure_resume", aiStructuredExtractionNode)
  .addEdge(START, "validate_file")
  .addConditionalEdges(
    "validate_file",
    (state) => {
      if (state.status === AGENT_STATUS.FAILED || !state.fileValidated) {
        return END;
      }
      return "extract_text";
    },
    {
      extract_text: "extract_text",
      [END]: END,
    }
  )
  .addConditionalEdges(
    "extract_text",
    (state) => {
      if (
        state.status === AGENT_STATUS.FAILED ||
        !state.extractedResumeData?.text
      ) {
        return END;
      }
      return "structure_resume";
    },
    {
      structure_resume: "structure_resume",
      [END]: END,
    }
  )
  .addEdge("structure_resume", END);

// Compile the graph with MemorySaver
export const resumeGraph = workflow.compile({ checkpointer: memorySaver });

/**
 * Runner function to execute the resume processing pipeline
 */
export const runResumePipeline = async (filePath, threadId) => {
  const activeThreadId =
    threadId || `resume-${Date.now()}-${crypto.randomUUID()}`;
  const config = { configurable: { thread_id: activeThreadId } };
  const result = await resumeGraph.invoke({ filePath }, config);

  if (result.status === AGENT_STATUS.FAILED || result.errorInfo) {
    const errMsg =
      result.errorInfo?.message || "Resume parsing pipeline failed";
    throw new Error(errMsg);
  }

  return result.parsedResume;
};

export default resumeGraph;
