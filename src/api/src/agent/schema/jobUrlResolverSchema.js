import { z } from "zod";

/**
 * Zod schema for LLM Job Search URL Resolution output
 */
export const jobUrlResolverResultSchema = z.object({
  resolvedUrls: z.array(
    z.object({
      url: z.string().describe("Complete target search or category URL on jobviareferral.com"),
      label: z.string().describe("Human readable label describing this search query or category"),
      priority: z.number().describe("Priority sequence order starting from 1")
    })
  ).describe("Ordered list of target URLs to search sequentially"),
  reasoning: z.string().describe("Brief explanation of why these target URLs were selected based on user criteria")
});

export default {
  jobUrlResolverResultSchema
};
