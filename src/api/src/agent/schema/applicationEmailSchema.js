import { z } from "zod";

export const applicationEmailSchema = z.object({
  recipient: z
    .string()
    .describe("Extracted HR or recruiter email address from job description, or 'unknown' if not specified"),
  subject: z
    .string()
    .describe("Professional email subject line (e.g. Application for MERN Stack Developer - Candidate Name)"),
  body: z
    .string()
    .describe("Complete, polite, compelling application cover letter email body text"),
});
