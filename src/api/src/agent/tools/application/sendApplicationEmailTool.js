import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { sendApplicationEmail } from "../../../integrations/email/emailService.js";
import { logError } from "../../../utils/logger.js";

export const sendApplicationEmailTool = tool(
  async ({ recipient, subject, body, pdfPath }) => {
    try {
      const result = await sendApplicationEmail({
        recipient,
        subject,
        body,
        pdfPath,
      });

      return JSON.stringify(result);
    } catch (error) {
      await logError("sendApplicationEmailTool", error.message);
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "sendApplicationEmailTool",
    description: "Sends job application email with tailored resume PDF attachment to recipient HR/recruiter",
    schema: z.object({
      recipient: z.string().describe("Target email address"),
      subject: z.string().describe("Email subject line"),
      body: z.string().describe("Email body text"),
      pdfPath: z.string().optional().describe("Path to tailored resume PDF attachment"),
    }),
  }
);
