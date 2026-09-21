/**
 * Prompt builder for generating tailored application cover emails
 */

export const APPLICATION_EMAIL_SYSTEM_PROMPT = `
You are an Executive Career Advisor and Professional Business Communicator.
Your task is to write a highly articulate, professional, beautifully formatted job application cover email for a candidate.

STRICT FORMATTING & SPACING RULES (CRITICAL):
1. SALUTATION: Always start with "Dear Hiring Team," or "Dear Hiring Manager," followed by EXACTLY TWO newlines (\n\n).
2. PARAGRAPHS: Write 3 clean, distinct, well-spaced paragraphs separated by EXACTLY TWO newlines (\n\n):
   - Paragraph 1: Express strong, professional interest in the [Job Title] role at [Company Name].
   - Paragraph 2: Highlight 2-3 key technical skills, experience, and relevant accomplishments matching the job description.
   - Paragraph 3: Reiterate enthusiasm, state that your resume is attached for review, and express eagerness to discuss the role in an interview.
3. SIGN-OFF: Close with "Sincerely," followed by TWO newlines (\n\n) and then the candidate's full name.
4. NO MISSING SPACES: Always include a space after every comma, period, or punctuation mark. Never attach words directly to punctuation without a space.
5. NO JOB PORTAL OR WEBSITE MENTIONS: DO NOT mention "jobviareferral.com", "advertised on...", "job board", or any referral platform names in the email body.
6. NO AI JARGON: NEVER use the phrase "tailored resume" or "my tailored resume". Refer to it simply as "my resume" (e.g. "My resume is attached for your review.").
7. TONE: Confident, polished, respectful, and articulate.
`;

export const buildApplicationEmailPrompt = ({ candidateName, jobDetails, tailoredResume }) => {
  return `
Candidate Name: ${candidateName || "Candidate"}
Target Job Title: ${jobDetails?.title || "Job Opening"}
Target Company: ${jobDetails?.companyName || "Company"}

Job Description:
${jobDetails?.description || "N/A"}

Candidate Experience & Resume Highlights:
${tailoredResume?.summary || "Experienced professional"}

Key Skills:
${Array.isArray(tailoredResume?.skills) ? tailoredResume.skills.join(", ") : JSON.stringify(tailoredResume?.skills || {})}

Generate a structured application email object containing recipient (HR email if found, or 'unknown'), subject, and body formatted with double newlines (\n\n) between every paragraph and sign-off.
`;
};

/**
 * Utility to clean, fix spacing, strip job board mentions, and format email bodies into clean paragraphs
 * @param {string} rawBody
 * @param {string} [candidateName]
 * @returns {string}
 */
export const formatAndCleanEmailBody = (rawBody = "", candidateName = "") => {
  if (!rawBody || typeof rawBody !== "string") return "";

  let cleaned = rawBody;

  // 1. Strip job board / website referral references
  cleaned = cleaned.replace(/,\s*as\s+advertised\s+on\s+[a-z0-9.-]+\.[a-z]{2,}/gi, "");
  cleaned = cleaned.replace(/\s*as\s+advertised\s+on\s+[a-z0-9.-]+\.[a-z]{2,}/gi, "");
  cleaned = cleaned.replace(/,\s*advertised\s+on\s+[a-z0-9.-]+\.[a-z]{2,}/gi, "");
  cleaned = cleaned.replace(/\s*advertised\s+on\s+[a-z0-9.-]+\.[a-z]{2,}/gi, "");
  cleaned = cleaned.replace(/\s*on\s+jobviareferral\.com/gi, "");
  cleaned = cleaned.replace(/\s*via\s+jobviareferral\.com/gi, "");

  // 2. Strip AI jargon ("my tailored resume" -> "my resume")
  cleaned = cleaned.replace(/my\s+tailored\s+resume/gi, "my resume");
  cleaned = cleaned.replace(/tailored\s+resume/gi, "resume");

  // 3. Fix missing space after punctuation
  cleaned = cleaned.replace(/([a-z0-9]),([a-zA-Z])/g, "$1, $2");
  cleaned = cleaned.replace(/([a-z0-9])\.([A-Z])/g, "$1. $2");

  // 4. Collapse multiple spaces
  cleaned = cleaned.replace(/ +/g, " ");

  // 5. Standardize Salutation and Sign-off formatting
  cleaned = cleaned.replace(/^(Dear\s+[^\n,]+,)\s*/i, "$1\n\n");

  // Format sign-off (Sincerely, / Best regards, / Regards,)
  if (/Sincerely|Best regards|Kind regards|Regards|Thanks and regards/i.test(cleaned)) {
    cleaned = cleaned.replace(/\s*(Sincerely|Best regards|Kind regards|Regards|Thanks and regards),?\s*(.*)$/i, (match, p1, p2) => {
      const name = p2.trim() || candidateName || "";
      return `\n\n${p1},\n\n${name}`;
    });
  }

  // Split into clean paragraphs and join with double newlines
  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  return paragraphs.join("\n\n");
};
