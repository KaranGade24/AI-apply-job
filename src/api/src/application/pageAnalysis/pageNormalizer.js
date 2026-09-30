import { logJobEvent } from '../../utils/logger.js';

/**
 * Normalizes detailed page snapshot attributes extracted by pageContentExtractor
 * into a clean, structured world state for the classifier and action planner.
 *
 * Ensures no raw, noisy DOM strings or messy HTML leakage goes to the LLM.
 *
 * @param {object} raw - Output from pageContentExtractor.extractPageContent()
 * @returns {object} Highly normalized, clean page model
 */
export const normalizePage = (raw = {}) => {
  const normalizedButtons = (raw.buttons || []).map(b => ({
    elementId: b.elementId || null,
    elementFingerprint: b.elementFingerprint || null,
    role: b.role || 'button',
    accessibleName: b.accessibleName || b.label || '',
    label: b.label || '',
    state: b.state || { visible: true, enabled: true },
    isApplyRelated: b.isApplyRelated || false,
    selector: b.selector || ''
  }));

  const normalizedForms = (raw.forms || []).map(f => ({
    sectionTitle: f.title || '',
    fieldsCount: f.fieldsCount || 0,
    fields: (f.fields || []).map(field => ({
      id: field.id || '',
      name: field.name || '',
      label: field.label || '',
      type: field.type || 'text',
      required: Boolean(field.required)
    }))
  }));

  return {
    url: raw.url || '',
    title: raw.title || '',
    headings: (raw.headings || []).slice(0, 15),
    buttons: normalizedButtons,
    forms: normalizedForms,
    formFieldsCount: raw.formFieldsCount || 0,
    fileInputsCount: raw.fileInputsCount || 0,
    accessibilityInfo: raw.accessibilityInfo || { hasAriaModal: false, mainRole: 'none' },
    modal: {
      isOpen: raw.modalState?.isOpen || false,
      title: raw.modalState?.title || '',
      inputCount: raw.modalState?.inputCount || 0,
      selector: raw.modalState?.selector || ''
    },
    stepper: {
      hasStepper: raw.stepperState?.hasStepper || false,
      currentStep: raw.stepperState?.currentStep || 1,
      totalSteps: raw.stepperState?.totalSteps || 1,
      activeStepName: raw.stepperState?.activeStepName || ''
    },
    validationErrors: raw.validationErrors || [],
    loading: raw.loadingState || { isLoading: false },
    successEvidence: raw.successEvidence || { level: 0, confirmationId: null },
    isFormClosed: raw.isFormClosed || false,
    textSnippet: (raw.textSnippet || '').slice(0, 3500)
  };
};
