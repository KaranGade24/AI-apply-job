import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { getGeminiModel } from "../../config/modelConfig.js";
import { tailoredResumeSchema } from "../../schema/tailoredResumeSchema.js";
import {
  RESUME_TAILORING_SYSTEM_PROMPT,
  buildResumeTailoringPrompt,
} from "../../prompt/resumeTailoring.js";
import { logError } from "../../../utils/logger.js";

export const generateResumeTool = tool(
  async ({ candidateResume, jobDetails }) => {
    try {
      const model = getGeminiModel();
      const structuredLlm = model.withStructuredOutput(tailoredResumeSchema);

      const promptText = buildResumeTailoringPrompt({
        candidateResume,
        jobDetails,
      });

      const result = await structuredLlm.invoke([
        { role: "system", content: RESUME_TAILORING_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ]);

      return JSON.stringify(result);
    } catch (error) {
      await logError("generateResumeTool", error.message);
      return JSON.stringify({ error: error.message });
    }
  },
  {
    name: "generateResumeTool",
    description: "Generates tailored resume presentation JSON based on candidate base resume and target job requirements",
    schema: z.object({
      candidateResume: z.object({}).passthrough().describe("Candidate parsed base resume JSON object"),
      jobDetails: z.object({}).passthrough().describe("Job posting details object"),
    }),
  }
);
