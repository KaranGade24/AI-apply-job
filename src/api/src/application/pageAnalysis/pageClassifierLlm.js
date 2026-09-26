import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { PORTAL_PAGE_TYPES } from '../../constant/application.constant.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Uses Gemini AI LLM to analyze the rendered page content, classify the page structure,
 * identify matching positions, detect closed forms (e.g. Google Forms no longer accepting responses),
 * and formulate actionable next steps (direct email with Ref ID, browser apply, or form filling).
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

    const openingsList = (extractedPageContent.openingsList || extractedPageContent.openings || []).map((o) => {
      if (typeof o === 'string') return o;
      return `${o.title || o.text || 'Opening'} (Ref: ${o.referenceId || 'N/A'}, Exp: ${o.experience || 'N/A'}, Loc: ${o.location || 'N/A'})`;
    }).slice(0, 20);

    const buttonsList = (extractedPageContent.buttons || [])
      .map((b) => `${b.text} ${b.contextTitle ? `(under: ${b.contextTitle})` : ''}`)
      .slice(0, 15);

    const prompt = `You are an AI Browser Automation and Page Intelligence Agent analyzing a rendered webpage after clicking Apply on a job posting.

TARGET JOB SOUGHT BY CANDIDATE:
- Title: "${targetTitle}"
- Company: "${targetCompany}"

RENDERED PAGE DETAILS:
- Current Page URL: ${extractedPageContent.url || 'N/A'}
- Page Title: "${extractedPageContent.title || 'N/A'}"
- Headings: ${JSON.stringify(extractedPageContent.headings || [])}
- Detected Openings / Roles in page: ${JSON.stringify(openingsList)}
- Detected Buttons / Action Links: ${JSON.stringify(buttonsList)}
- Number of visible form fields: ${extractedPageContent.formFieldsCount || 0}
- Detected Emails: ${JSON.stringify(extractedPageContent.emails || [])}
- Detected Reference IDs / Job Codes: ${JSON.stringify(extractedPageContent.referenceIds || [])}
- Form Closed Status Detected: ${extractedPageContent.isFormClosed ? `YES - "${extractedPageContent.closedFormTitle}" (${extractedPageContent.closedFormMessage})` : 'NO'}
- Direct Email Instructions Detected: ${JSON.stringify(extractedPageContent.emailInstructions || null)}
- Page Text Sample:
"""
${(extractedPageContent.textSnippet || '').slice(0, 3000)}
"""

TASK:
1. Analyze the page type carefully:
   - "form_closed": An online form / Google Form (e.g. "RajYug_2025_Recruitment") is closed / expired / no longer accepting responses. In this case, if an email is available, recommend direct email application with the specific Ref ID.
   - "job_listings_accordion": Multi-role directory with accordions/cards (e.g. "Node JS Developer", "React JS Developer", "AI ML Developer", etc. with Ref IDs and individual Apply Now buttons).
   - "job_description_page": Single job description with an Apply button.
   - "application_form": Active application form with open inputs for candidate info or resume upload.
   - "email_instructions": Instructs candidate to email resume to a specific email with a Reference ID / Job Code.
   - "external_ats": External ATS (Workday, Greenhouse, Lever, etc.).
   - "unknown": Unclear structure.

2. Match the best opening for "${targetTitle}" and extract:
   - Exact title matched
   - Reference ID (e.g. "IN-NJ-01", "IN-AI-02")
   - Experience requirement
   - Location
   - Target button text

3. Extract email contact instructions:
   - Direct recruiter email (e.g. "Recruitment@Rajyugsolutions.com")
   - Recommended email subject with candidate name placeholder and Ref ID
   - Reference ID

RETURN STRICT JSON ONLY:
{
  "pageType": "form_closed" | "job_listings_accordion" | "job_description_page" | "application_form" | "email_instructions" | "external_ats" | "unknown",
  "isFormClosed": boolean,
  "closedFormTitle": string,
  "closedFormMessage": string,
  "summary": "Clear 1-2 sentence explanation of the page status and AI recommendation",
  "matchedRole": {
    "title": "Exact title matched from the page, or closest matching opening",
    "referenceId": "Extracted reference ID or job code if present (e.g. IN-NJ-01)",
    "experience": "Extracted experience if present",
    "location": "Extracted location if present",
    "targetButtonText": "Apply Now",
    "isAccordion": boolean
  },
  "detectedOpenings": ["List of all role names detected on page"],
  "emailContact": {
    "email": "careers email if available, else empty",
    "subject": "Suggested subject line including Reference ID if available",
    "referenceId": "Extracted reference ID"
  },
  "nextRecommendedAction": "send_email" | "click_opening_apply" | "fill_form" | "form_closed_fallback_email" | "human_review" | "unknown",
  "actionReason": "Clear rationale explaining why this action was decided"
}`;

    const model = await getGeminiModel(userId);
    const response = await model.invoke(prompt);
    const content = (response.content || '').trim();

    const cleaned = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    await logJobEvent(
      'pageClassifierLlm',
      'CLASSIFIED',
      `Page Type: ${parsed.pageType} | Form Closed: ${parsed.isFormClosed ? 'YES' : 'NO'} | Matched: "${parsed.matchedRole?.title || 'None'}" (Ref: ${parsed.matchedRole?.referenceId || 'N/A'}) | Action: ${parsed.nextRecommendedAction}`
    );

    return {
      pageType: parsed.pageType || (extractedPageContent.isFormClosed ? PORTAL_PAGE_TYPES.FORM_CLOSED : PORTAL_PAGE_TYPES.UNKNOWN),
      isFormClosed: parsed.isFormClosed !== undefined ? parsed.isFormClosed : extractedPageContent.isFormClosed,
      closedFormTitle: parsed.closedFormTitle || extractedPageContent.closedFormTitle || '',
      closedFormMessage: parsed.closedFormMessage || extractedPageContent.closedFormMessage || '',
      summary: parsed.summary || 'Rendered page analyzed.',
      matchedRole: parsed.matchedRole || {
        title: '',
        referenceId: '',
        experience: '',
        location: '',
        targetButtonText: 'Apply Now',
        isAccordion: false,
      },
      detectedOpenings: parsed.detectedOpenings || (extractedPageContent.openingsList || []).map((o) => o.title),
      openingsList: extractedPageContent.openingsList || [],
      emailContact: parsed.emailContact || {
        email: extractedPageContent.emails?.[0] || '',
        subject: `Application for ${job.title || 'Position'}`,
        referenceId: extractedPageContent.referenceIds?.[0] || '',
      },
      nextRecommendedAction: parsed.nextRecommendedAction || (extractedPageContent.isFormClosed ? 'send_email' : 'unknown'),
      actionReason: parsed.actionReason || '',
    };
  } catch (error) {
    await logError('pageClassifierLlm.classifyPageWithLlm', error.message);

    // Fallback heuristic classification
    const isClosed = extractedPageContent.isFormClosed;
    const formFields = extractedPageContent.formFieldsCount || 0;
    const isForm = formFields >= 2;
    const hasOpenings = (extractedPageContent.openingsList || extractedPageContent.openings || []).length > 0;
    const hasEmail = (extractedPageContent.emails || []).length > 0;

    let pageType = PORTAL_PAGE_TYPES.UNKNOWN;
    let nextAction = 'unknown';

    if (isClosed) {
      pageType = PORTAL_PAGE_TYPES.FORM_CLOSED;
      nextAction = hasEmail ? 'send_email' : 'human_review';
    } else if (hasOpenings) {
      pageType = PORTAL_PAGE_TYPES.JOB_LISTINGS_ACCORDION;
      nextAction = 'click_opening_apply';
    } else if (isForm) {
      pageType = PORTAL_PAGE_TYPES.APPLICATION_FORM;
      nextAction = 'fill_form';
    } else if (hasEmail) {
      pageType = PORTAL_PAGE_TYPES.EMAIL_INSTRUCTIONS;
      nextAction = 'send_email';
    }

    return {
      pageType,
      isFormClosed: isClosed,
      closedFormTitle: extractedPageContent.closedFormTitle || '',
      closedFormMessage: extractedPageContent.closedFormMessage || '',
      summary: isClosed
        ? `Application form is closed (${extractedPageContent.closedFormTitle || 'External Form'}). Direct email application recommended.`
        : hasOpenings
        ? `Multiple job openings detected on careers page (${extractedPageContent.openingsList?.length || 0} roles).`
        : 'Rendered page analyzed.',
      matchedRole: {
        title: job.title || '',
        referenceId: extractedPageContent.referenceIds?.[0] || '',
        experience: '',
        location: '',
        targetButtonText: 'Apply Now',
        isAccordion: hasOpenings,
      },
      detectedOpenings: (extractedPageContent.openingsList || extractedPageContent.openings || []).map((o) => o.title || o),
      openingsList: extractedPageContent.openingsList || [],
      emailContact: {
        email: extractedPageContent.emails?.[0] || '',
        subject: `Application for ${job.title || 'Position'} - Ref ID: ${extractedPageContent.referenceIds?.[0] || ''}`,
        referenceId: extractedPageContent.referenceIds?.[0] || '',
      },
      nextRecommendedAction: nextAction,
      actionReason: 'Fallback heuristic classification.',
    };
  }
};
