import { z } from "zod";

const personalInfoSchema = z.object({
  fullName: z.string().default(""),
  email: z.string().default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  linkedin: z.string().default(""),
  github: z.string().default(""),
  website: z.string().default(""),
});

const workExperienceSchema = z.object({
  jobTitle: z.string().default(""),
  company: z.string().default(""),
  location: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  description: z.array(z.string()).default([]),
});

const educationSchema = z.object({
  degree: z.string().default(""),
  fieldOfStudy: z.string().default(""),
  institution: z.string().default(""),
  location: z.string().default(""),
  graduationYear: z.string().default(""),
});

const projectSchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),
  technologies: z.array(z.string()).default([]),
  links: z.object({
    liveDemo: z.string().default(""),
    github: z.string().default(""),
  }),
});

const skillsSchema = z.object({
  technicalSkills: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
});

export const resumeSchema = z.object({
  personalInfo: personalInfoSchema,
  summary: z.string().default(""),
  skills: skillsSchema,
  workExperience: z.array(workExperienceSchema).default([]),
  education: z.array(educationSchema).default([]),
  projects: z.array(projectSchema).default([]),
  certifications: z.array(z.string()).default([]),
});

export default resumeSchema;
