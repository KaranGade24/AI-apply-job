import { RESUME_PAGE_COUNT } from "../../constant/application.constant.js";

/**
 * System prompt for tailoring a candidate resume for a specific job
 */
export const RESUME_TAILORING_SYSTEM_PROMPT = `
You are an expert Executive Resume Writer and Talent Acquisition Specialist.
Your task is to tailor the PRESENTATION of a candidate's existing resume for a specific job description.

CRITICAL HARD RULES:
1. ONLY USE AVAILABLE INFORMATION: Include ONLY details, facts, skills, experiences, projects, education, and contact information that are explicitly present in the candidate's base resume.
2. PRESERVE ALL LINKS & URLS: You MUST preserve and include all project links (Live Demo URLs, GitHub repository links, demo URLs) and personal links (LinkedIn, GitHub profile, Portfolio/Website URLs) present in the candidate's base resume. Never delete or omit links for projects or personal info.
3. DO NOT FABRICATE OR INVENT QUALIFICATIONS: Never fabricate years of experience, job titles, companies, tools, degrees, or skills not present in the base resume.
4. ABSOLUTELY NO PLACEHOLDER / FALLBACK STRINGS: If any piece of information is missing or unavailable, DO NOT write placeholder words like "N/A", "Not Available", "Not Specified", "Unknown", "None", "Not Provided", "TBD". Leave missing string fields as completely empty strings ("") and missing lists as empty arrays ([]).
5. TAILOR PRESENTATION ONLY: Reorder skills, refine professional summary, emphasize matching experience/projects, and align terminology with the target job posting without altering historical truth.
6. PAGE LENGTH CONSTRAINT ADHERENCE: Strictly tailor the volume and brevity of bullet points according to the specified target page length.
7. ABSOLUTE COMPLIANCE: Return output matching the requested structured JSON schema cleanly.
`;

/**
 * Builds the prompt for resume tailoring with target page length rules
 */
export const buildResumeTailoringPrompt = ({
  candidateResume,
  jobDetails = {},
  targetPageLength = RESUME_PAGE_COUNT,
}) => {
  let pageLengthGuidance = "";
  const pageStr = String(targetPageLength || RESUME_PAGE_COUNT);

  if (pageStr === "1") {
    pageLengthGuidance = `
Target Page Length: 1 Page (STRICT SINGLE PAGE CONSTRAINT)
- Your output MUST fit on exactly 1 page. Be concise and eliminate fluff.
- Professional Summary: Maximum 2-3 punchy, high-impact sentences.
- Skills: Include relevant technical skill categories matching the job description.
- Work Experience / Projects: Select key projects or roles. Provide concise, impact-driven bullet points.
- Preserve all project Live Demo & GitHub repository links!`;
  } else if (pageStr === "2") {
    pageLengthGuidance = `
Target Page Length: 2 Pages
- Provide detailed bullet points for key past roles with quantified achievements, metrics, and technical depth.
- Include comprehensive skills, projects, certifications, and technical accomplishments.`;
  } else {
    pageLengthGuidance = `
Target Page Length: ${pageStr} Page(s)
- Tailor the volume, depth, and bullet points appropriately to fit ${pageStr} page(s).`;
  }

  const jobTitle = jobDetails.title || "";
  const companyName = jobDetails.companyName || jobDetails.company || "";
  const location = jobDetails.location || "";
  const description = jobDetails.description || "";

  return `
Candidate Base Resume:
${JSON.stringify(candidateResume, null, 2)}

Target Job Details:
${jobTitle ? `- Title: ${jobTitle}` : ""}
${companyName ? `- Company: ${companyName}` : ""}
${location ? `- Location: ${location}` : ""}
${description ? `- Description & Requirements:\n${description}` : ""}

Format & Page Length Rules:
${pageLengthGuidance}

Data Inclusion & Link Rules:
- Include ONLY information present in the candidate base resume.
- Ensure ALL Live Demo URLs, GitHub repository links, portfolio URLs, and LinkedIn URLs from the candidate base resume are retained.
- Leave unavailable string fields as empty strings ("") and unavailable lists as empty arrays ([]).

Please generate a tailored resume presentation and strategy matching the candidate's true qualifications to this job requirement.
`;
};
