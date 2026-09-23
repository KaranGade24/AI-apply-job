import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { generateResumePdf } from "../../../pdf/resumePdfService.js";
import { RESUME_PDF_TEMPLATES } from "../../../constant/application.constant.js";
import { logError } from "../../../utils/logger.js";

export const generateResumePdfTool = tool(
  async ({
    tailoredResumeData,
    template = RESUME_PDF_TEMPLATES.MODERN,
    userId,
  }) => {
    try {
      const pdfPath = await generateResumePdf({
        resumeData: tailoredResumeData,
        template,
        userId,
      });

      return JSON.stringify({
        success: true,
        pdfPath,
      });
    } catch (error) {
      await logError("generateResumePdfTool", error.message);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "generateResumePdfTool",
    description:
      "Generates a deterministic PDF file from structured tailored resume JSON",
    schema: z.object({
      tailoredResumeData: z
        .object({})
        .passthrough()
        .describe("Tailored resume JSON object"),
      template: z
        .string()
        .optional()
        .default(RESUME_PDF_TEMPLATES.MODERN)
        .describe("Resume PDF template choice"),
      userId: z
        .string()
        .optional()
        .describe("MongoDB User ID to enrich candidate profile if needed"),
    }),
  },
);
