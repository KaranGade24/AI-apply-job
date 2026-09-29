import { logJobEvent } from '../../utils/logger.js';

/**
 * Normalizes raw page content extracted by pageContentExtractor into a clean,
 * structured world-state that the AI decision engine can consume.
 *
 * This is the bridge between raw DOM extraction and AI reasoning.
 * No raw HTML is ever sent to the LLM — only this normalized representation.
 *
 * @param {object} rawExtracted - Output from pageContentExtractor.extractPageContent()
 * @returns {object} Normalized page state
 */
export const normalizePage = (rawExtracted = {}) => {
  // Normalize buttons into a clean structure
  const buttons = (rawExtracted.buttons || []).map((b) => ({
    text: (b.text || '').trim(),
    selector: b.selector || '',
    isApplyRelated: b.isApplyRelated || false,
    href: b.href || '',
  }));

  // Normalize form sections
  const forms = (rawExtracted.formSections || []).map((s) => ({
    sectionTitle: s.title || '',
    fieldsCount: s.fieldsCount || 0,
    fields: (s.fields || []).map((f) => ({
      name: f.name || '',
      label: f.label || '',
      type: f.type || 'text',
      required: Boolean(f.required),
    })),
  }));

  // Normalize modal state
  const modals = {
    isOpen: rawExtracted.modalState?.isOpen || false,
    title: rawExtracted.modalState?.title || '',
    inputCount: rawExtracted.modalState?.inputCount || 0,
    buttonCount: rawExtracted.modalState?.buttonCount || 0,
    selector: rawExtracted.modalState?.selector || '',
  };

  // Normalize auth/gateway state
  const authState = {
    loginRequired: rawExtracted.authGateway?.isAuthRequired || false,
    hasApplyButton: rawExtracted.authGateway?.hasApplyButton || false,
    hasAutofillWithResume: rawExtracted.authGateway?.hasAutofillWithResume || false,
    hasApplyManually: rawExtracted.authGateway?.hasApplyManually || false,
    hasSocialApply: rawExtracted.authGateway?.hasSocialApply || false,
  };

  // Normalize stepper state
  const stepper = {
    hasStepper: rawExtracted.stepperState?.hasStepper || false,
    currentStep: rawExtracted.stepperState?.currentStep || 1,
    totalSteps: rawExtracted.stepperState?.totalSteps || 1,
    steps: rawExtracted.stepperState?.steps || [],
    activeStepName: rawExtracted.stepperState?.activeStepName || '',
  };

  // Normalize job context from openings
  const openingsList = rawExtracted.openingsList || [];
  const jobContext = {
    openingsCount: openingsList.length,
    openings: openingsList.slice(0, 15).map((o) => ({
      title: o.title || '',
      referenceId: o.referenceId || '',
      experience: o.experience || '',
      location: o.location || '',
      hasApplyBtn: o.hasApplyBtn || false,
      buttonText: o.buttonText || '',
    })),
  };

  return {
    url: rawExtracted.url || '',
    title: rawExtracted.title || '',
    headings: (rawExtracted.headings || []).slice(0, 15),
    buttons,
    forms,
    formFieldsCount: rawExtracted.formFieldsCount || 0,
    fileInputsCount: rawExtracted.fileInputsCount || 0,
    modals,
    authState,
    stepper,
    jobContext,
    emails: rawExtracted.emails || [],
    referenceIds: rawExtracted.referenceIds || [],
    isFormClosed: rawExtracted.isFormClosed || false,
    closedFormTitle: rawExtracted.closedFormTitle || '',
    closedFormMessage: rawExtracted.closedFormMessage || '',
    emailInstructions: rawExtracted.emailInstructions || null,
    textSnippet: (rawExtracted.textSnippet || '').slice(0, 5000),
  };
};
