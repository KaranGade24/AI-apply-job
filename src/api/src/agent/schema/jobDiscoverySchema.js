import { z } from "zod";

/**
 * Zod validation schema for Job Discovery search configuration
 */
export const searchConfigSchema = z.preprocess(
  (input) => {
    if (typeof input === "object" && input !== null) {
      const methods =
        input.preferredApplicationMethods ||
        input.preferredMethods ||
        input.applicationMethods ||
        input.methods ||
        input.preferredApplicationMethod;
      if (methods) {
        return {
          ...input,
          preferredApplicationMethods: Array.isArray(methods) ? methods : [methods],
        };
      }
    }
    return input;
  },
  z.object({
    sources: z.array(z.string()).min(1).default(["jobViaReferral", "naukri"]),
    keywords: z.array(z.string()).default(["MERN Developer", "Node.js Developer", "Backend Developer"]),
    locations: z.array(z.string()).default(["Pune", "Remote"]),
    experience: z.object({
      min: z.number().default(0),
      max: z.number().default(2)
    }).default({ min: 0, max: 2 }),
    workMode: z.array(z.string()).default(["remote", "hybrid", "workFromOffice"]),
    employmentType: z.array(z.string()).default(["fullTime"]),
    preferredApplicationMethods: z.array(z.string()).default(["email", "googleForm", "websiteForm", "phone", "unknown"]),
    postedWithin: z.string().default("24h"),
    maxJobs: z.number().default(10),
    userId: z.string().optional()
  })
);

/**
 * Zod schema for LLM candidate-resume job match evaluation
 */
export const jobMatchResultSchema = z.object({
  isMatch: z.boolean().default(false),
  matchScore: z.number().min(0).max(100).default(0),
  matchReason: z.string().default(""),
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([])
});

/**
 * Initial state object for Job Discovery LangGraph execution
 */
export const initialJobDiscoveryState = Object.freeze({
  config: null,
  rawJobs: [],
  normalizedJobs: [],
  filteredJobs: [],
  matchedJobs: [],
  skippedJobs: [],
  currentSourceIndex: 0,
  attemptCount: 1,
  candidateResumeText: '',
  errors: []
});

export default {
  searchConfigSchema,
  jobMatchResultSchema,
  initialJobDiscoveryState
};
