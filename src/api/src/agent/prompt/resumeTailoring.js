import { RESUME_PAGE_COUNT } from "../../constant/application.constant.js";

/**
 * System prompt for tailoring a candidate resume for a specific job
 */
export const RESUME_TAILORING_SYSTEM_PROMPT = `
You are an expert Executive Resume Writer and Talent Acquisition Specialist.
Your task is to tailor the PRESENTATION of a candidate's existing resume for a specific job description.

CRITICAL HARD RULES:
1. ONLY USE AVAILABLE INFORMATION: Include ONLY details, facts, skills, experiences, projects, education, and contact information that are explicitly present in the candidate's base resume.
2. DO NOT FABRICATE OR INVENT QUALIFICATIONS: Never fabricate years of experience, job titles, companies, tools, degrees, or skills not present in the base resume.
3. ABSOLUTELY NO PLACEHOLDER / FALLBACK STRINGS: If any piece of information (such as phone number, address, LinkedIn URL, GitHub link, company name, degree field, duration, dates, location, etc.) is missing or unavailable, DO NOT write placeholder words like "N/A", "Not Available", "Not Specified", "Unknown", "None", "Not Provided", "TBD", "Role", "Degree", or similar. Leave missing string fields as completely empty strings ("") and missing lists as empty arrays ([]).
4. TAILOR PRESENTATION ONLY: Reorder skills, refine professional summary, emphasize matching experience/projects, and align terminology with the target job posting without altering historical truth.
5. PAGE LENGTH CONSTRAINT ADHERENCE: Strictly tailor the volume and brevity of bullet points according to the specified target page length.
6. ABSOLUTE COMPLIANCE: Return output matching the requested structured JSON schema cleanly.
`;

/**
 * Builds the prompt for resume tailoring with target page length rules
 * @param {object} params
 * @param {object} params.candidateResume
 * @param {object} params.jobDetails
 * @param {string|number} [params.targetPageLength] - Target page count (e.g., 1, 2, "1", "2")
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
Target Page Length: 1 Page
- Keep bullet points concise, high-impact, and punchy (3-4 key highlights per role max).
- Select only the most relevant 2-3 projects and top skills matching the job.
- Summarize less relevant roles or older education into short 1-line entries so the output fits cleanly on 1 page.`;
  } else if (pageStr === "2") {
    pageLengthGuidance = `
Target Page Length: 2 Pages
- Provide detailed bullet points for key past roles with quantified achievements, metrics, and technical depth.
- Include comprehensive skills, projects, certifications, and technical accomplishments to fill an executive 2-page format cleanly without fluff.`;
  } else if (!isNaN(Number(pageStr))) {
    pageLengthGuidance = `
Target Page Length: ${pageStr} Page(s)
- Tailor the volume, depth, and bullet points appropriately to fit ${pageStr} page(s).`;
  } else {
    pageLengthGuidance = `
Target Page Length: Not Specified
- Balance depth and brevity naturally based on the candidate's experience level (concise for entry/mid level, comprehensive for senior roles).`;
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

Data Inclusion & Strict Exclusion Rules:
- Include ONLY information present in the candidate base resume.
- If a field, contact detail, section, or attribute is not available in the candidate's resume, DO NOT write placeholder text such as "N/A", "Not Available", "Not Specified", "Unknown", "None", "TBD", or "Not Provided".
- Leave any unavailable string fields completely empty ("") and any unavailable lists as empty arrays ([]).

Please generate a tailored resume presentation and strategy matching the candidate's true qualifications to this job requirement.
`;
};

