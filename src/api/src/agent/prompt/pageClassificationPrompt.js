import { PERCEPTION_PAGE_TYPES } from '../../constant/agent.constant.js';

/**
 * Builds prompt for LLM page classification when deterministic heuristics yield low confidence.
 *
 * @param {object} params
 * @param {string} params.url
 * @param {string} params.title
 * @param {string} params.serializedElements
 * @param {string} params.textSnippet
 * @returns {string} Prompt string
 */
export const buildPageClassificationPrompt = ({ url, title, serializedElements, textSnippet }) => {
  const allowedTypes = Object.values(PERCEPTION_PAGE_TYPES).join(', ');

  return `You are an expert autonomous browser agent assisting a job candidate with job applications.
Analyze the provided web page observation and classify the page into exactly one of the supported page types.

Supported Page Types:
${allowedTypes}

Page Details:
URL: ${url || 'Unknown'}
Title: ${title || 'Untitled'}

Text Snippet from page:
${textSnippet || 'None'}

Interactive Elements on page:
${serializedElements || 'None'}

Instructions:
1. Carefully inspect the URL, title, headings, and interactive elements.
2. If CAPTCHA, Cloudflare challenge, or bot detection is present, output "CAPTCHA_OR_BLOCKED".
3. If an application confirmation or thank-you message is displayed, output "SUBMISSION_SUCCESS".
4. If a review/summary screen before final submit is displayed, output "REVIEW".
5. If file input for resume or CV is the primary focus, output "RESUME_UPLOAD".
6. If questionnaire/custom questions (radio groups, essay answers, work eligibility) are prominent, output "QUESTION_FORM".
7. If standard contact/profile form (name, email, phone, location) is shown, output "APPLICATION_FORM".
8. If login/sign-in credentials are required, output "LOGIN".
9. If creating a new user account is required, output "SIGNUP".
10. If this is a job description page with an "Apply" button, output "JOB_DETAIL" or "APPLICATION_START".
11. If this is an error/404/closed job page, output "ERROR".
12. If page redirected to an external ATS domain, output "EXTERNAL_REDIRECT".
13. Otherwise output "UNKNOWN".

Respond strictly conforming to the JSON schema.`;
};

export default buildPageClassificationPrompt;
