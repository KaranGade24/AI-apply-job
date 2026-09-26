import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { PORTAL_PAGE_TYPES } from '../../constant/application.constant.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Uses Gemini AI LLM to analyze the rendered page content, classify the page structure,
 * identify the matching position from openings/accordions, and decide the next action.
 *
 * @param {object} extractedPageContent - Output from pageContentExtractor
 * @param {object} job - Target Job details ({ title, company, description, requirements })
 * @param {string} [userId]
 * @returns {Promise<object>} Structured AI classification and action plan
 */
export const classifyPageWithLlm = async (extractedPageContent, job = {}, userId = null) => {
  try {
    const targetTitle = job.title || 'Software Developer';
    const targetCompany = job.company || 'Company';

    const openingsList = (extractedPageContent.openings || []).map((o) => o.title).slice(0, 15);
    const buttonsList = (extractedPageContent.buttons || [])
      .map((b) => `${b.text} ${b.contextTitle ? `(under: ${b.contextTitle})` : ''}`)
      .slice(0, 15);

    const prompt = `You are an AI Browser Automation Agent analyzing a rendered webpage after clicking Apply on a job board (like Naukri or Company Career site).

TARGET JOB SOUGHT BY CANDIDATE:
- Title: "${targetTitle}"
- Company: "${targetCompany}"

RENDERED PAGE DETAILS:
- Current Page URL: ${extractedPageContent.url || 'N/A'}
- Page Title: "${extractedPageContent.title || 'N/A'}"
- Headings: ${JSON.stringify(extractedPageContent.headings || [])}
- Detected Openings / Roles in page: ${JSON.stringify(openingsList)}
- Detected Buttons / Action Links: ${JSON.stringify(buttonsList)}
- Number of visible form fields (inputs/selects/textareas): ${extractedPageContent.formFieldsCount || 0}
- Detected Emails: ${JSON.stringify(extractedPageContent.emails || [])}
- Detected Reference IDs / Job Codes: ${JSON.stringify(extractedPageContent.referenceIds || [])}
- Page Text Sample:
"""
${(extractedPageContent.textSnippet || '').slice(0, 2500)}
"""

TASK:
Analyze the page content carefully. In many company career portals (e.g. accordion lists like "India Openings" containing roles like "Node JS Developer", "React JS Developer", "AI ML Developer" with "Apply Now" buttons), the page renders a directory of openings instead of an immediate form.

Classify the page into ONE of these types:
1. "job_listings_accordion": The page lists multiple job openings or accordion sections (e.g. "Node JS Developer", "React JS Developer", "MERN Stack Developer" with Reference IDs, experience, and specific "Apply Now" buttons).
2. "job_description_page": A single job posting page with an inner "Apply" or "Apply Now" or "Apply for this position" button.
3. "application_form": An active form is present with inputs for candidate details, resume upload, or questionnaires.
4. "email_instructions": The page directs applicants to email their resume to an email address (with a reference ID or subject format).
5. "external_ats": Redirected to an external ATS (Workday, Greenhouse, Lever, etc.).
6. "login_required": Requires employer account sign-in/registration.
7. "already_applied": Shows confirmation that this job is already applied.
8. "unknown": Page structure is unclear.

Determine the exact matching role for "${targetTitle}".
If found, extract its exact title, Reference ID (e.g. "IN-NJ-01"), Experience (e.g. "1-3 Years"), Location (e.g. "Pune"), and the exact button text (e.g. "Apply Now").

RETURN STRICT JSON ONLY:
{
  "pageType": "job_listings_accordion" | "job_description_page" | "application_form" | "email_instructions" | "external_ats" | "login_required" | "already_applied" | "unknown",
  "summary": "Brief 1-2 sentence explanation of what is rendered on this page",
  "matchedRole": {
    "title": "Exact title matched from the page, or closest matching opening",
    "referenceId": "Extracted reference ID or job code if present (e.g. IN-NJ-01), else empty string",
    "experience": "Extracted experience requirement if present, else empty string",
    "location": "Extracted location if present, else empty string",
    "targetButtonText": "Apply Now",
    "isAccordion": true or false
  },
  "detectedOpenings": ["List of role names detected on page"],
  "emailContact": {
    "email": "careers email if email application is specified, else empty",
    "subject": "Suggested subject line including Reference ID if available",
    "referenceId": "Extracted reference ID"
  },
  "nextRecommendedAction": "click_opening_apply" | "fill_form" | "send_email" | "human_login" | "unknown",
  "actionReason": "Clear reason explaining why this action was decided"
}`;

    const model = await getGeminiModel(userId);
    const response = await model.invoke(prompt);
    const content = (response.content || '').trim();

    // Clean JSON markdown code blocks
    const cleaned = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    await logJobEvent(
      'pageClassifierLlm',
      'CLASSIFIED',
      `Page Type: ${parsed.pageType} | Matched: "${parsed.matchedRole?.title || 'None'}" (Ref: ${parsed.matchedRole?.referenceId || 'N/A'}) | Action: ${parsed.nextRecommendedAction}`
    );

    return {
      pageType: parsed.pageType || PORTAL_PAGE_TYPES.UNKNOWN,
      summary: parsed.summary || 'Rendered page analyzed.',
      matchedRole: parsed.matchedRole || {
        title: '',
        referenceId: '',
        experience: '',
        location: '',
        targetButtonText: 'Apply Now',
        isAccordion: false,
      },
      detectedOpenings: parsed.detectedOpenings || openingsList,
      emailContact: parsed.emailContact || { email: '', subject: '', referenceId: '' },
      nextRecommendedAction: parsed.nextRecommendedAction || 'unknown',
      actionReason: parsed.actionReason || '',
    };
  } catch (error) {
    await logError('pageClassifierLlm.classifyPageWithLlm', error.message);

    // Fallback heuristic classification
    const formFields = extractedPageContent.formFieldsCount || 0;
    const isForm = formFields >= 2;
    const hasOpenings = (extractedPageContent.openings || []).length > 0;

    return {
      pageType: isForm
        ? PORTAL_PAGE_TYPES.APPLICATION_FORM
        : hasOpenings
        ? PORTAL_PAGE_TYPES.JOB_LISTINGS_ACCORDION
        : PORTAL_PAGE_TYPES.UNKNOWN,
      summary: isForm ? 'Form fields detected on page.' : 'Multiple job openings detected on careers page.',
      matchedRole: {
        title: job.title || '',
        referenceId: extractedPageContent.referenceIds?.[0] || '',
        experience: '',
        location: '',
        targetButtonText: 'Apply Now',
        isAccordion: hasOpenings,
      },
      detectedOpenings: (extractedPageContent.openings || []).map((o) => o.title),
      emailContact: {
        email: extractedPageContent.emails?.[0] || '',
        subject: `Application for ${job.title || 'Position'}`,
        referenceId: extractedPageContent.referenceIds?.[0] || '',
      },
      nextRecommendedAction: isForm ? 'fill_form' : hasOpenings ? 'click_opening_apply' : 'unknown',
      actionReason: 'Fallback heuristic classification based on DOM elements.',
    };
  }
};
