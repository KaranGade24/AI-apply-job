import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { logJobEvent, logError } from '../../utils/logger.js';

// Explicit application page states
export const PAGE_STATES = {
  JOB_PAGE: 'JOB_PAGE',
  APPLICATION_ENTRY: 'APPLICATION_ENTRY',
  APPLICATION_FORM: 'APPLICATION_FORM',
  FORM_STEP: 'FORM_STEP',
  REVIEW: 'REVIEW',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  OTP_REQUIRED: 'OTP_REQUIRED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Stage 1 AI Classifier: Analyzes normalized state to classify exactly which page/state the browser is on.
 * Strictly answers: "What page/state is this?".
 * Does NOT formulate actions or next steps.
 *
 * @param {object} normalizedState
 * @param {string} [userId]
 * @param {string} [screenshotBase64]
 * @returns {Promise<{ state: string, confidence: number, hasStepper: boolean, currentStep: number, totalSteps: number, activeStepName: string, isFormClosed: boolean, reason: string }>}
 */
export const classifyPageStateLlm = async (normalizedState, userId = null, screenshotBase64 = null) => {
  try {
    const prompt = `You are a Stage 1 Semantic Browser State Classifier.
Analyze the following normalized browser state and determine which EXPLICIT PAGE STATE best matches this page.
${screenshotBase64 ? 'Inspect the attached visual screenshot of the page to verify layout, headings, buttons, and state indicators with high precision.' : ''}

EXPLICIT PAGE STATES:
- "JOB_PAGE": A job posting, job description, or list of jobs.
- "APPLICATION_ENTRY": The entry gateway or landing page of an application (e.g. contains "Apply Now", "Apply Manually", "Autofill with Resume" buttons).
- "APPLICATION_FORM": A single-page job application form containing text inputs, textareas, file uploads, etc.
- "FORM_STEP": One specific page/step of a multi-step wizard form (e.g. contact info, questions, resume upload).
- "REVIEW": A summary or review page of the form fields filled so far before hitting submit.
- "LOGIN_REQUIRED": A user credentials form, username/password fields, or sign-in buttons blocking entry.
- "OTP_REQUIRED": One-Time Pin / Code entry form fields.
- "MFA_REQUIRED": Multi-Factor Authentication gate screen (security questions, code app verification).
- "CAPTCHA_REQUIRED": Active CAPTCHA challenges, bot protection grids, or click-shields.
- "SUCCESS": An explicit submission confirmation page (Level 2, 3, or 4 success markers like thank you message, receipt, or submission confirmation).
- "ERROR": The page indicates a fatal or operational error blocking normal application progress.
- "UNKNOWN": Cannot be identified from active indicators.

NORMALIZED STATE BLUEPRINT:
- URL: ${normalizedState.url}
- Title: "${normalizedState.title}"
- Headings: ${JSON.stringify(normalizedState.headings || [])}
- Forms Present: ${JSON.stringify(normalizedState.forms || [])}
- Active Modal: ${JSON.stringify(normalizedState.modal || { isOpen: false })}
- Stepper: ${JSON.stringify(normalizedState.stepper || { hasStepper: false })}
- Validation Errors Visible: ${JSON.stringify(normalizedState.validationErrors || [])}
- Loading: ${JSON.stringify(normalizedState.loading || { isLoading: false })}
- Success Evidence: ${JSON.stringify(normalizedState.successEvidence || { level: 0 })}
- Is Form Closed: ${normalizedState.isFormClosed ? 'YES' : 'NO'}
- Text Snippet:
"""
${(normalizedState.textSnippet || '').slice(0, 2000)}
"""

RETURN STRICT JSON ONLY MATCHING THE FOLLOWING SCHEMA. Do NOT include markdown blocks, notes, or explanations outside the JSON block.

{
  "state": "JOB_PAGE | APPLICATION_ENTRY | APPLICATION_FORM | FORM_STEP | REVIEW | LOGIN_REQUIRED | OTP_REQUIRED | MFA_REQUIRED | CAPTCHA_REQUIRED | SUCCESS | ERROR | UNKNOWN",
  "confidence": <float between 0.0 and 1.0>,
  "hasStepper": <boolean>,
  "currentStep": <number>,
  "totalSteps": <number>,
  "activeStepName": "<string>",
  "isFormClosed": <boolean>,
  "reason": "<clear semantic reasoning of your state selection>"
}`;

    const model = await getGeminiModel(userId);
    const userContent = screenshotBase64
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: `data:image/png;base64,${screenshotBase64}` },
        ]
      : prompt;

    const response = await model.invoke(userContent);
    const content = (response.content || '').trim();

    const cleaned = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    const mappedState = PAGE_STATES[parsed.state] ? parsed.state : PAGE_STATES.UNKNOWN;

    await logJobEvent(
      'pageClassifierLlm',
      'STATE_CLASSIFIED',
      `State: ${mappedState} | Confidence: ${parsed.confidence} | Has Stepper: ${parsed.hasStepper} | Step: ${parsed.currentStep}/${parsed.totalSteps}`
    );

    return {
      state: mappedState,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      hasStepper: Boolean(parsed.hasStepper || normalizedState.stepper?.hasStepper),
      currentStep: parsed.currentStep || normalizedState.stepper?.currentStep || 1,
      totalSteps: parsed.totalSteps || normalizedState.stepper?.totalSteps || 1,
      activeStepName: parsed.activeStepName || normalizedState.stepper?.activeStepName || '',
      isFormClosed: parsed.isFormClosed !== undefined ? parsed.isFormClosed : normalizedState.isFormClosed,
      reason: parsed.reason || 'AI Page State classification.'
    };

  } catch (error) {
    await logError('pageClassifierLlm.classifyPageStateLlm', error.message);
    return {
      state: PAGE_STATES.UNKNOWN,
      confidence: 0.0,
      hasStepper: false,
      currentStep: 1,
      totalSteps: 1,
      activeStepName: '',
      isFormClosed: false,
      reason: `Classification Exception: ${error.message}`
    };
  }
};

/**
 * Backward-compatible page classifier wrapper.
 * Integrates internal classifyPageStateLlm to preserve compatibility across legacy systems (e.g., Naukri scripts).
 *
 * @param {object} extractedPageContent - Output from pageContentExtractor
 * @param {object} job - Target Job details
 * @param {string} [userId]
 * @param {string} [screenshotBase64] - Viewport screenshot for visual classification
 * @returns {Promise<object>} Legacy formatted classification details
 */
export const classifyPageWithLlm = async (extractedPageContent, job = {}, userId = null, screenshotBase64 = null) => {
  const normalized = {
    url: extractedPageContent.url || '',
    title: extractedPageContent.title || '',
    headings: extractedPageContent.headings || [],
    forms: extractedPageContent.formSections || [],
    formFieldsCount: extractedPageContent.formFieldsCount || 0,
    fileInputsCount: extractedPageContent.fileInputsCount || 0,
    modal: {
      isOpen: extractedPageContent.modalState?.isOpen || false,
      title: extractedPageContent.modalState?.title || '',
      inputCount: extractedPageContent.modalState?.inputCount || 0
    },
    stepper: {
      hasStepper: extractedPageContent.stepperState?.hasStepper || false,
      currentStep: extractedPageContent.stepperState?.currentStep || 1,
      totalSteps: extractedPageContent.stepperState?.totalSteps || 1,
      activeStepName: extractedPageContent.stepperState?.activeStepName || ''
    },
    validationErrors: extractedPageContent.validationErrors || [],
    loading: extractedPageContent.loadingState || { isLoading: false },
    successEvidence: extractedPageContent.successEvidence || { level: 0 },
    isFormClosed: extractedPageContent.isFormClosed || false,
    textSnippet: extractedPageContent.textSnippet || ''
  };

  const pageStateResult = await classifyPageStateLlm(normalized, userId, screenshotBase64);

  // Map explicit states back to raw legacy strings
  let legacyPageType = 'external_ats';
  let legacyNextRecommendedAction = 'fill_form';

  switch (pageStateResult.state) {
    case PAGE_STATES.JOB_PAGE:
      legacyPageType = 'job_description_page';
      legacyNextRecommendedAction = 'click_opening_apply';
      break;
    case PAGE_STATES.APPLICATION_ENTRY:
      legacyPageType = 'external_ats';
      legacyNextRecommendedAction = 'click_opening_apply';
      break;
    case PAGE_STATES.APPLICATION_FORM:
    case PAGE_STATES.FORM_STEP:
      legacyPageType = 'application_form';
      legacyNextRecommendedAction = 'fill_form';
      break;
    case PAGE_STATES.REVIEW:
      legacyPageType = 'application_form';
      legacyNextRecommendedAction = 'fill_form';
      break;
    case PAGE_STATES.LOGIN_REQUIRED:
      legacyPageType = 'ats_account_gateway';
      legacyNextRecommendedAction = 'human_review';
      break;
    case PAGE_STATES.SUCCESS:
      legacyPageType = 'external_ats';
      legacyNextRecommendedAction = 'human_review';
      break;
    default:
      legacyPageType = 'external_ats';
      legacyNextRecommendedAction = 'fill_form';
      break;
  }

  if (pageStateResult.isFormClosed) {
    legacyPageType = 'form_closed';
    legacyNextRecommendedAction = 'form_closed_fallback_email';
  }

  return {
    pageType: legacyPageType,
    workflow: {
      isMultiStep: pageStateResult.hasStepper,
      currentStep: pageStateResult.currentStep,
      totalSteps: pageStateResult.totalSteps,
      currentStepName: pageStateResult.activeStepName,
      isModal: Boolean(extractedPageContent.modalState?.isOpen)
    },
    isFormClosed: pageStateResult.isFormClosed,
    closedFormTitle: extractedPageContent.closedFormTitle || '',
    closedFormMessage: extractedPageContent.closedFormMessage || '',
    summary: pageStateResult.reason,
    matchedRole: {
      title: job.title || '',
      referenceId: extractedPageContent.referenceIds?.[0] || '',
      experience: '',
      location: '',
      targetButtonText: 'Apply',
      targetSelector: '',
      isAccordion: false
    },
    detectedOpenings: (extractedPageContent.openingsList || []).map(o => o.title),
    openingsList: extractedPageContent.openingsList || [],
    emailContact: {
      email: extractedPageContent.emails?.[0] || '',
      subject: `Application for ${job.title || 'Position'}`,
      referenceId: extractedPageContent.referenceIds?.[0] || ''
    },
    nextRecommendedAction: legacyNextRecommendedAction,
    targetSelector: '',
    actionReason: pageStateResult.reason
  };
};
