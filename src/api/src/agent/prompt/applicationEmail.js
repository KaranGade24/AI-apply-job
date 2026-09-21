/**
 * Prompt builder for generating tailored application cover emails
 */

export const APPLICATION_EMAIL_SYSTEM_PROMPT = `
You are a professional Career Coach and Executive Communicator.
Your task is to write a highly compelling, professional, concise job application email for a candidate.

Guidelines:
1. Recipient Extraction: Inspect the job description for any recruiter or HR email address (e.g. hr@company.com, careers@company.com). If found, return it as 'recipient'. Otherwise, return 'unknown'.
2. Subject Line: Craft a clear, concise subject line, e.g., "Application for [Job Title] - [Candidate Name]".
3. Email Body: Write a 3-paragraph email:
   - Paragraph 1: Express interest in the specific position at the target company.
   - Paragraph 2: Highlight 2-3 core matching qualifications and key projects from candidate's tailored resume.
   - Paragraph 3: Professional closing with reference to attached tailored resume and call to action.
4. Tone: Confident, respectful, articulate, and professional.
`;

export const buildApplicationEmailPrompt = ({ candidateName, jobDetails, tailoredResume }) => {
  return `
Candidate Name: ${candidateName || "Candidate"}
Target Job Title: ${jobDetails.title || "Job Opening"}
Target Company: ${jobDetails.companyName || "Company"}
Job Source URL: ${jobDetails.sourceUrl || "N/A"}

Job Description:
${jobDetails.description || "N/A"}

Candidate Tailored Resume Summary:
${tailoredResume?.summary || "Experienced professional"}

Key Skills:
${JSON.stringify(tailoredResume?.skills || {})}

Generate a structured application email object containing recipient, subject, and body.
`;
};
