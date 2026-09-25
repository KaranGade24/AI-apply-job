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
6. PAGE LENGTH & VOLUME OPTIMIZATION: Tailor the depth and count of bullet points so the text volume naturally populates the target page length without leaving large empty bottom gaps or spilling over into unwanted overflow pages.
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
Target Page Length: 1 Page (STRICT SINGLE PAGE FULL COVERAGE)
- Tailor the candidate's resume so the output content volume naturally fits on a full single A4 page.
- Professional Summary: Write a concise, high-impact 2-sentence overview highlighting relevant expertise for this job.
- Skills: Provide a focused, highly relevant list of technical skills categorized into 3-4 groups.
- Work Experience & Projects: Provide 2-3 concise, action-packed bullet points per key position/project. Focus on the MOST relevant accomplishments for this job.
- Content Management: If the candidate has extensive history, focus deeply on the most recent 2-3 roles and make older roles very brief (1 bullet point or just title/company/date) to ensure the total volume fits beautifully on one page without excessive font scaling.
- Preserve all project Live Demo & GitHub repository links!`;
  } else if (pageStr === "2") {
    pageLengthGuidance = `
Target Page Length: 2 Pages (TWO FULL PAGES COVERAGE)
- Tailor the candidate's resume to provide comprehensive, detailed coverage across 2 full A4 pages.
- Provide 4-6 detailed, metric-rich bullet points per work experience and project.
- Include all relevant skills, certifications, and technical accomplishments from the candidate's background.`;
  } else {
    pageLengthGuidance = `
Target Page Length: ${pageStr} Page(s)
- Tailor the volume, depth, and bullet points appropriately to fit and fill ${pageStr} page(s).`;
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
