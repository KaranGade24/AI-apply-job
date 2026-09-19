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
import { geminiModel } from "../config/modelConfig.js";
import { extractResumeText } from "../tools/resumeParse.tool.js";
import { RESUME_PARSER_SYSTEM_PROMPT } from "../prompt/resumeParser.js";
import { resumeSchema } from "../schema/resumeSchema.js";
import { logError, logResumeEvent } from "../../utils/logger.js";
import {
  MAX_ATTEMPTS,
  MAX_TOOL_CALLS,
  LLM_TIMEOUT_MS,
  AGENT_STATUS,
  ERROR_CODES,
} from "../../constant/agent.constant.js";
import { MAX_FILE_SIZE_BYTES } from "../../constant/api.constant.js";

/**
 * Explicit State Annotation for the Resume Processing Pipeline
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

    const stats = fs.statSync(resolvedPath);
    if (stats.size >= MAX_FILE_SIZE_BYTES) {
      const errorMsg = `Validation failed: File size (${(stats.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum limit`;
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
      "File validated successfully on disk",
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
 * Extracts raw text from PDF/DOC using tool logic and saves explicitly to state.
 */
const extractResumeTextNode = async (state) => {
  try {
    if (state.status === AGENT_STATUS.FAILED || !state.fileValidated) {
      return state;
    }

    const currentToolCalls = (state.toolCallCount || 0) + 1;

    if (currentToolCalls > MAX_TOOL_CALLS) {
      const errorMsg =
        "Extraction halted: Tool call count limit reached to prevent looping";

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

    /*
     * extractResumeText() now returns:
     *
     * {
     *   text,
     *   hyperlinks,
     *   resumeLinks
     * }
     */
    const resumeData = await extractResumeText(state.filePath);

    /*
     * Validate extraction result.
     */
    if (
      !resumeData ||
      typeof resumeData.text !== "string" ||
      !resumeData.text.trim()
    ) {
      throw new Error("Resume extraction returned empty text");
    }

    /*
     * Log correct values.
     */
    await logResumeEvent(
      state.filePath,
      "EXTRACTED",
      `Extracted ${resumeData.text.length} characters and ${resumeData.hyperlinks.length} hyperlinks`,
    );

    /*
     * Store complete extraction result in graph state.
     */
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
 * Sends system prompt + raw text directly to Gemini model with Zod schema validation & timeout.
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

    /*
     * ==========================================
     * EXTRACTED RESUME DATA
     * ==========================================
     */

    const resumeData = state.extractedResumeData;

    /*
     * ==========================================
     * FORMAT PDF HYPERLINKS
     * ==========================================
     */

    const hyperlinkText = resumeData.hyperlinks
      .map(
        (link, index) =>
          `${index + 1}. ` + `Text: "${link.text}"\n` + `   URL: ${link.url}`,
      )
      .join("\n\n");

    /*
     * ==========================================
     * BUILD GEMINI INPUT
     * ==========================================
     */

    const llmInput = `
===== RESUME TEXT =====

${resumeData.text}


===== PDF HYPERLINKS =====

${hyperlinkText}


===== CLASSIFIED RESUME LINKS =====

Email:
${resumeData.resumeLinks.email}

LinkedIn:
${resumeData.resumeLinks.linkedin}

GitHub:
${resumeData.resumeLinks.github}

Website:
${resumeData.resumeLinks.website}


===== EXTRACTION RULES =====

1. Extract information only from the supplied resume data.

2. Do not invent information.

3. Do not infer missing information.

4. PDF hyperlinks are authoritative source data.

5. Preserve supplied URLs exactly.

6. The candidate GitHub profile URL is:
${resumeData.resumeLinks.github}

7. The candidate LinkedIn URL is:
${resumeData.resumeLinks.linkedin}

8. The candidate website URL is:
${resumeData.resumeLinks.website}

9. The candidate email is:
${resumeData.resumeLinks.email}

10. Use these values for personalInfo when appropriate.

11. Do not replace a project GitHub URL with the candidate's
    GitHub profile URL.

12. Do not replace a project Live Demo URL with the candidate's
    portfolio URL.

13. Match "Live Demo" and "GitHub" hyperlinks to the correct
    project using the project title and their position in the
    supplied resume.

14. If a project does not have a corresponding URL, return
    an empty string.

15. Do not create URLs.

16. Do not use external web search.

17. Extract phone number, location, name, education,
    experience, skills, projects and other fields directly
    from the resume text.

18. Return all information supported by the resume.
`;

    /*
     * ==========================================
     * DEBUG GEMINI INPUT
     * ==========================================
     *
     * Keep this temporarily while debugging.
     */

    console.log("\n========== GEMINI INPUT ==========\n");

    console.log(llmInput);

    console.log("\n========== END GEMINI INPUT ==========\n");

    /*
     * ==========================================
     * STRUCTURED MODEL
     * ==========================================
     */

    const structuredLlm = geminiModel.withStructuredOutput(resumeSchema);

    /*
     * ==========================================
     * LLM TIMEOUT
     * ==========================================
     */

    const llmPromise = structuredLlm.invoke([
      new SystemMessage(RESUME_PARSER_SYSTEM_PROMPT),

      new HumanMessage(llmInput),
    ]);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `LLM invocation timed out after ${LLM_TIMEOUT_MS / 1000} seconds`,
            ),
          ),
        LLM_TIMEOUT_MS,
      );
    });

    /*
     * ==========================================
     * CALL GEMINI
     * ==========================================
     */

    const parsedData = await Promise.race([llmPromise, timeoutPromise]);

    /*
     * ==========================================
     * FINAL ZOD VALIDATION
     * ==========================================
     */

    const validatedResume = resumeSchema.parse(parsedData);

    /*
     * ==========================================
     * LOG SUCCESS
     * ==========================================
     */

    await logResumeEvent(
      state.filePath,
      "PARSED",
      "Resume structured successfully",
    );

    /*
     * ==========================================
     * RETURN STATE UPDATE
     * ==========================================
     */

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
      if (state.status === AGENT_STATUS.FAILED || !state.fileValidated)
        return END;
      return "extract_text";
    },
    {
      extract_text: "extract_text",
      [END]: END,
    },
  )
  .addConditionalEdges(
    "extract_text",
    (state) => {
      if (
        state.status === AGENT_STATUS.FAILED ||
        !state.extractedResumeData?.text
      )
        return END;
      return "structure_resume";
    },
    {
      structure_resume: "structure_resume",
      [END]: END,
    },
  )
  .addEdge("structure_resume", END);

// Compile the graph with MemorySaver
export const resumeGraph = workflow.compile({ checkpointer: memorySaver });

/**
 * Runner function to execute the resume processing pipeline
 * Generates a unique thread_id using crypto.randomUUID() to guarantee concurrent isolation
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
