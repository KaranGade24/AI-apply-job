import { z } from "zod";

export const tailoredResumeSchema = z.object({
  resumeStrategy: z.object({
    summary: z.string().describe("1-2 sentence strategy explaining how presentation was tailored"),
    skillsToEmphasize: z.array(z.string()).describe("List of existing skills prioritized for this job"),
    projectsToEmphasize: z.array(z.string()).describe("List of candidate projects relevant to job"),
    experienceToEmphasize: z.array(z.string()).describe("Key past experience bullet points emphasized"),
  }),
  tailoredResume: z.object({
    personalInfo: z.object({
      fullName: z.string(),
      email: z.string(),
      phone: z.string().optional().default(""),
      location: z.string().optional().default(""),
      linkedin: z.string().optional().default(""),
      github: z.string().optional().default(""),
    }),
    summary: z.string().describe("Tailored professional summary matching job context without inventing facts"),
    skills: z.object({
      technicalSkills: z.array(z.string()),
      softSkills: z.array(z.string()).optional().default([]),
      toolsAndFrameworks: z.array(z.string()).optional().default([]),
    }),
    experience: z.array(
      z.object({
        title: z.string(),
        company: z.string().optional().default(""),
        duration: z.string().optional().default(""),
        location: z.string().optional().default(""),
        highlights: z.array(z.string()),
      })
    ).optional().default([]),
    projects: z.array(
      z.object({
        title: z.string(),
        description: z.string().optional().default(""),
        technologies: z.array(z.string()).optional().default([]),
        highlights: z.array(z.string()).optional().default([]),
      })
    ).optional().default([]),
    education: z.array(
      z.object({
        degree: z.string(),
        fieldOfStudy: z.string().optional().default(""),
        institution: z.string().optional().default(""),
        graduationYear: z.string().optional().default(""),
      })
    ).optional().default([]),
  }),
});
