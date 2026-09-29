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
      .map((b) => `${b.text} [Selector: ${b.selector || 'N/A'}]`)
      .slice(0, 25);

    const prompt = `You are an advanced AI Browser Automation & Semantic DOM Analysis Agent analyzing a rendered webpage during a job application workflow.

TARGET JOB SOUGHT BY CANDIDATE:
- Title: "${targetTitle}"
- Company: "${targetCompany}"

RENDERED DOM-TREE SEMANTIC BLUEPRINT:
- Current Page URL: ${extractedPageContent.url || 'N/A'}
- Page Title: "${extractedPageContent.title || 'N/A'}"
- Headings Hierarchy: ${JSON.stringify(extractedPageContent.headings || [])}
- Active Modal / Drawer State: ${JSON.stringify(extractedPageContent.modalState || { isOpen: false })}
- Multi-Step Workflow / Stepper State: ${JSON.stringify(extractedPageContent.stepperState || { hasStepper: false })}
- Form Sections & Input Hierarchy: ${JSON.stringify(extractedPageContent.formSections || [])}
- Candidate Auth / Gateway State: ${JSON.stringify(extractedPageContent.authGateway || { isAuthRequired: false })}
- Total Form Inputs: ${extractedPageContent.formFieldsCount || 0}
- File Dropzones / Upload Inputs: ${extractedPageContent.fileInputsCount || 0}
- Interactive Buttons / Action Links: ${JSON.stringify(buttonsList)}
- Detected Openings / Roles in page: ${JSON.stringify(openingsList)}
- Detected Emails: ${JSON.stringify(extractedPageContent.emails || [])}
- Detected Reference IDs / Req Codes: ${JSON.stringify(extractedPageContent.referenceIds || [])}
- Form Closed / Expired Alert: ${extractedPageContent.isFormClosed ? `YES - "${extractedPageContent.closedFormTitle}" (${extractedPageContent.closedFormMessage})` : 'NO'}
- Direct Email Application Instructions: ${JSON.stringify(extractedPageContent.emailInstructions || null)}
- Live Text Sample:
"""
${(extractedPageContent.textSnippet || '').slice(0, 3500)}
"""

SEMANTIC CLASSIFICATION RULES (DO NOT DEFAULT TO 'unknown' IF DOM CONTAINS ACTIONABLE CONTROLS):
1. Analyze the page structure and workflow stage:
   - "multi_step_wizard": The application is a multi-step workflow (stepper indicated, e.g. "Step 1: Contact Info -> Step 2: Experience -> Step 3: Questions").
   - "modal_application_form": An active modal, drawer, or dialog overlay contains application inputs or questionnaire.
   - "application_form": A standard application form on the page with input fields and submit controls.
   - "ats_account_gateway": Candidate sign-in or account creation is required before accessing the application form (e.g. Workday account login, password fields).
   - "external_ats": An enterprise ATS job details page (Workday, Greenhouse, Lever, SmartRecruiters, Taleo, etc.) with an Apply / Autofill trigger.
   - "job_description_page": A single job posting description with an Apply / Submit button.
   - "job_listings_accordion": A directory of multiple job openings with accordions or expandable cards.
   - "form_closed": An online form or job posting that is expired or no longer accepting responses. Direct email with Ref ID is recommended if an email exists.
   - "email_instructions": A page instructing candidates to email their resume directly with a reference code.

2. Extract Workflow & Match Details:
   - Match the target role "${targetTitle}" to the best opening on the page (Title, Req ID / Ref ID, Experience, Location).
   - Determine current step name and number if multi-step.
   - Identify the exact next target selector or button text to advance (e.g., [data-automation-id="apply-button"], "Apply Manually", "Next", "Save & Continue", "Submit").

RETURN STRICT JSON ONLY:
{
  "pageType": "multi_step_wizard" | "modal_application_form" | "application_form" | "ats_account_gateway" | "external_ats" | "job_description_page" | "job_listings_accordion" | "form_closed" | "email_instructions",
  "workflow": {
    "isMultiStep": boolean,
    "currentStep": number,
    "totalSteps": number,
    "currentStepName": string,
    "isModal": boolean
  },
  "isFormClosed": boolean,
  "closedFormTitle": string,
  "closedFormMessage": string,
  "summary": "Clear 1-2 sentence semantic summary of the current page status, workflow stage, company, and next action",
  "matchedRole": {
    "title": "Exact role title matched from the page",
    "referenceId": "Extracted reference ID or Req ID (e.g. JR100355, IN-NJ-01)",
    "experience": "Extracted experience requirement",
    "location": "Extracted location",
    "targetButtonText": "Apply",
    "targetSelector": "Selector if known (e.g. [data-automation-id='apply-button'])",
    "isAccordion": boolean
  },
  "detectedOpenings": ["List of all role names detected on page"],
  "emailContact": {
    "email": "careers email if available, else empty",
    "subject": "Suggested subject line including Reference ID if available",
    "referenceId": "Extracted reference ID"
  },
  "nextRecommendedAction": "fill_form" | "click_next_step" | "click_opening_apply" | "click_button" | "upload_resume" | "send_email" | "form_closed_fallback_email" | "human_review",
  "targetSelector": "Best selector to click or interact with next",
  "actionReason": "Clear semantic rationale explaining the decision"
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
      pageType: parsed.pageType || (extractedPageContent.isFormClosed ? PORTAL_PAGE_TYPES.FORM_CLOSED : PORTAL_PAGE_TYPES.EXTERNAL_ATS),
      workflow: parsed.workflow || {
        isMultiStep: Boolean(extractedPageContent.stepperState?.hasStepper),
        currentStep: extractedPageContent.stepperState?.currentStep || 1,
        totalSteps: extractedPageContent.stepperState?.totalSteps || 1,
        currentStepName: extractedPageContent.stepperState?.activeStepName || '',
        isModal: Boolean(extractedPageContent.modalState?.isOpen),
      },
      isFormClosed: parsed.isFormClosed !== undefined ? parsed.isFormClosed : extractedPageContent.isFormClosed,
      closedFormTitle: parsed.closedFormTitle || extractedPageContent.closedFormTitle || '',
      closedFormMessage: parsed.closedFormMessage || extractedPageContent.closedFormMessage || '',
      summary: parsed.summary || 'Rendered page analyzed.',
      matchedRole: parsed.matchedRole || {
        title: job.title || '',
        referenceId: extractedPageContent.referenceIds?.[0] || '',
        experience: '',
        location: '',
        targetButtonText: 'Apply',
        targetSelector: parsed.targetSelector || '',
        isAccordion: false,
      },
      targetSelector: parsed.targetSelector || parsed.matchedRole?.targetSelector || '',
      detectedOpenings: parsed.detectedOpenings || (extractedPageContent.openingsList || []).map((o) => o.title),
      openingsList: extractedPageContent.openingsList || [],
      emailContact: parsed.emailContact || {
        email: extractedPageContent.emails?.[0] || '',
        subject: `Application for ${job.title || 'Position'}`,
        referenceId: extractedPageContent.referenceIds?.[0] || '',
      },
      nextRecommendedAction: parsed.nextRecommendedAction || (extractedPageContent.isFormClosed ? 'send_email' : 'fill_form'),
      actionReason: parsed.actionReason || '',
    };
  } catch (error) {
    await logError('pageClassifierLlm.classifyPageWithLlm', error.message);

    // Fallback heuristic classification
    const isClosed = extractedPageContent.isFormClosed;
    const formFields = extractedPageContent.formFieldsCount || 0;
    const isForm = formFields >= 2;
    const isModal = Boolean(extractedPageContent.modalState?.isOpen);
    const isMultiStep = Boolean(extractedPageContent.stepperState?.hasStepper);
    const isAuthRequired = Boolean(extractedPageContent.authGateway?.isAuthRequired);
    const hasOpenings = (extractedPageContent.openingsList || extractedPageContent.openings || []).length > 0;
    const hasEmail = (extractedPageContent.emails || []).length > 0;
    const pageUrl = (extractedPageContent.url || '').toLowerCase();
    const hasApplyBtn = (extractedPageContent.buttons || []).some((b) => b.isApplyRelated || /apply/i.test(b.text));

    const isWorkdayOrAts =
      pageUrl.includes('myworkdayjobs.com') ||
      pageUrl.includes('greenhouse.io') ||
      pageUrl.includes('lever.co') ||
      pageUrl.includes('smartrecruiters.com') ||
      pageUrl.includes('taleo.net') ||
      pageUrl.includes('icims.com') ||
      pageUrl.includes('jobvite.com') ||
      pageUrl.includes('bamboohr.com') ||
      pageUrl.includes('careers') ||
      pageUrl.includes('/job/');

    let pageType = PORTAL_PAGE_TYPES.EXTERNAL_ATS;
    let nextAction = 'click_opening_apply';

    if (isClosed) {
      pageType = PORTAL_PAGE_TYPES.FORM_CLOSED;
      nextAction = hasEmail ? 'send_email' : 'human_review';
    } else if (isModal) {
      pageType = PORTAL_PAGE_TYPES.MODAL_APPLICATION_FORM;
      nextAction = 'fill_form';
    } else if (isMultiStep) {
      pageType = PORTAL_PAGE_TYPES.MULTI_STEP_WIZARD;
      nextAction = 'fill_form';
    } else if (isAuthRequired) {
      pageType = PORTAL_PAGE_TYPES.ATS_ACCOUNT_GATEWAY;
      nextAction = 'human_review';
    } else if (isForm) {
      pageType = PORTAL_PAGE_TYPES.APPLICATION_FORM;
      nextAction = 'fill_form';
    } else if (isWorkdayOrAts || hasApplyBtn) {
      pageType = PORTAL_PAGE_TYPES.EXTERNAL_ATS;
      nextAction = 'click_opening_apply';
    } else if (hasOpenings) {
      pageType = PORTAL_PAGE_TYPES.JOB_LISTINGS_ACCORDION;
      nextAction = 'click_opening_apply';
    } else if (hasEmail) {
      pageType = PORTAL_PAGE_TYPES.EMAIL_INSTRUCTIONS;
      nextAction = 'send_email';
    }

    return {
      pageType,
      workflow: {
        isMultiStep,
        currentStep: extractedPageContent.stepperState?.currentStep || 1,
        totalSteps: extractedPageContent.stepperState?.totalSteps || 1,
        currentStepName: extractedPageContent.stepperState?.activeStepName || '',
        isModal,
      },
      isFormClosed: isClosed,
      closedFormTitle: extractedPageContent.closedFormTitle || '',
      closedFormMessage: extractedPageContent.closedFormMessage || '',
      summary: isClosed
        ? `Application form is closed (${extractedPageContent.closedFormTitle || 'External Form'}). Direct email application recommended.`
        : isModal
        ? `Application modal active (${extractedPageContent.modalState?.title || 'Form dialog'}).`
        : isMultiStep
        ? `Multi-step application flow: Step ${extractedPageContent.stepperState?.currentStep} of ${extractedPageContent.stepperState?.totalSteps} (${extractedPageContent.stepperState?.activeStepName || 'Active'}).`
        : isWorkdayOrAts
        ? `External Career / ATS Portal detected for "${job.title || 'position'}". Ready for application.`
        : hasOpenings
        ? `Multiple job openings detected on careers page (${extractedPageContent.openingsList?.length || 0} roles).`
        : `Career portal active for "${job.title || 'Position'}".`,
      matchedRole: {
        title: job.title || '',
        referenceId: extractedPageContent.referenceIds?.[0] || '',
        experience: '',
        location: '',
        targetButtonText: 'Apply',
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
      actionReason: 'Intelligent semantic DOM fallback classification.',
    };
  }
};
