/**
 * Redesigns success detection into Evidence Levels.
 *
 * Evidence Levels:
 * LEVEL 0: URL changed only (No confirmation markers)
 * LEVEL 1: Recognized confirmation-like page URL patterns (e.g. url has confirmation/success/applied) but body text/title does not confirm. URL ALONE MUST NEVER PRODUCE APPLICATION_COMPLETED / SUCCESS.
 * LEVEL 2: Explicit application-success text (e.g. "thank you for applying", "application has been received").
 * LEVEL 3: Strong semantic confirmation (e.g. "application successfully submitted", "we have received your application", "you have successfully applied" plus title success indicators).
 * LEVEL 4: Confirmation/application ID or durable receipt (e.g. "confirmation code:", "reference number:").
 */

/**
 * Redesigned success detection with Evidence Levels.
 *
 * @param {string} [url='']
 * @param {string} [title='']
 * @param {string} [bodyText='']
 * @returns {{ isSuccess: boolean, level: number, details: string, confidence: number }}
 */
export const getSuccessEvidence = (url = '', title = '', bodyText = '') => {
  const normUrl = (url || '').toLowerCase();
  const normTitle = (title || '').toLowerCase();
  const normBody = (bodyText || '').toLowerCase();

  // 1. Guard against false positive context phrases
  const falsePositivePatterns = [
    /applications\s+are\s+not\s+currently\s+being\s+accepted/i,
    /not\s+accepting\s+applications/i,
    /previous\s+application\s+was\s+successfully\s+submitted/i,
    /your\s+previous\s+application/i,
    /already\s+applied\s+previously/i,
    /position\s+is\s+closed/i
  ];

  const hasFalsePositive = falsePositivePatterns.some(p => p.test(bodyText) || p.test(title));
  if (hasFalsePositive) {
    return {
      isSuccess: false,
      level: 0,
      details: 'Rejected: False positive phrase detected (e.g. "not accepting applications" or "previous application")',
      confidence: 0.0
    };
  }

  // LEVEL 4: Confirmation/application ID or durable receipt
  const receiptPatterns = [
    /(?:confirmation|application|reference|receipt|submission)\s*(?:code|id|number|#|no)?\s*(?:\s+is|\s+was)?\s*(?::|=|\s)\s*([a-zA-Z0-9-]{4,})/i,
    /your\s+confirmation\s+(?:id|number)?\s*(?:\s+is|\s+was)?\s*(?::|=|\s)\s*([a-zA-Z0-9-]{4,})/i,
    /reference\s+id\s*(?:\s+is|\s+was)?\s*(?::|=|\s)\s*([a-zA-Z0-9-]{4,})/i
  ];
  const hasReceipt = receiptPatterns.some(p => p.test(bodyText));
  const hasLevel2Text = [
    /thank\s+you\s+for\s+applying/i,
    /application\s+has\s+been\s+received/i,
    /your\s+application\s+has\s+been\s+received/i,
    /we\s+have\s+received\s+your\s+application/i,
    /thank\s+you\s+for\s+your\s+interest/i,
    /application\s+complete/i
  ].some(p => p.test(bodyText));

  if (hasReceipt && (hasLevel2Text || normUrl.includes('confirm') || normUrl.includes('success'))) {
    return {
      isSuccess: true,
      level: 4,
      details: 'Level 4 Verified: Confirmation/application ID or durable receipt located',
      confidence: 1.0
    };
  }

  // LEVEL 3: Strong semantic confirmation
  const strongSemanticPatterns = [
    /application.*successfully\s+submitted/i,
    /successfully\s+submitted.*application/i,
    /you\s+have\s+successfully\s+applied/i,
    /applied\s+successfully/i,
    /successfully\s+submitted\s+your\s+application/i
  ];
  const hasLevel3Text = strongSemanticPatterns.some(p => p.test(bodyText));
  if (hasLevel3Text) {
    return {
      isSuccess: true,
      level: 3,
      details: 'Level 3 Verified: Strong semantic submission confirmation text found',
      confidence: 0.95
    };
  }

  // LEVEL 2: Explicit application-success text
  if (hasLevel2Text) {
    return {
      isSuccess: true,
      level: 2,
      details: 'Level 2 Verified: Explicit application-success message detected',
      confidence: 0.85
    };
  }

  // LEVEL 1: Recognized confirmation-like page URL patterns (No explicit success text)
  const successUrlKeywords = ['confirmation', 'success', 'thank-you', 'thank_you', 'thankyou', 'applied'];
  const hasSuccessUrlKeyword = successUrlKeywords.some(keyword => normUrl.includes(keyword));

  if (hasSuccessUrlKeyword) {
    return {
      isSuccess: false, // Page URL alone must never produce APPLICATION_COMPLETED/success
      level: 1,
      details: 'Level 1 Detected: Confirmation-like URL pattern observed, but missing explicit body text confirmation',
      confidence: 0.3
    };
  }

  // LEVEL 0: Base / URL changed only
  return {
    isSuccess: false,
    level: 0,
    details: 'Level 0: Baseline page state. No success indicators present',
    confidence: 0.0
  };
};

/**
 * Checks if a given URL, page title, or body text indicates a successful application submission.
 * Preserves backward-compatibility by calling the newer getSuccessEvidence.
 *
 * @param {string} [url='']
 * @param {string} [title='']
 * @param {string} [bodyText='']
 * @returns {boolean}
 */
export const isSuccessPage = (url = '', title = '', bodyText = '') => {
  const evidence = getSuccessEvidence(url, title, bodyText);
  return evidence.isSuccess;
};

/**
 * Compares pre-action and post-action normalized page states to detect
 * what changed after a browser action was executed.
 *
 * This runs automatically after every browser action — verification is
 * a system guarantee, not an AI-requested action.
 *
 * @param {object} previousState - Normalized state before the action
 * @param {object} currentState - Normalized state after the action
 * @returns {object} State change detection result
 */
export const detectStateChange = (previousState = {}, currentState = {}) => {
  const prevUrl = previousState.url || '';
  const currUrl = currentState.url || '';
  const urlChanged = prevUrl !== currUrl;

  const prevModalOpen = previousState.modals?.isOpen || false;
  const currModalOpen = currentState.modals?.isOpen || false;
  const modalOpened = !prevModalOpen && currModalOpen;
  const modalClosed = prevModalOpen && !currModalOpen;

  const prevFormFields = previousState.formFieldsCount || 0;
  const currFormFields = currentState.formFieldsCount || 0;
  const formAppeared = prevFormFields < 2 && currFormFields >= 2;

  // Detect error messages in the post-action state
  const errorPatterns = [
    /error/i, /invalid/i, /required/i, /please\s+fill/i,
    /can'?t\s+be\s+blank/i, /must\s+be/i, /failed/i,
  ];
  const currText = (currentState.textSnippet || '').slice(0, 2000);
  const prevText = (previousState.textSnippet || '').slice(0, 2000);
  const errorAppeared = errorPatterns.some((p) =>
    p.test(currText) && !p.test(prevText)
  );
  const errorMessage = errorAppeared
    ? (currText.match(/(?:error|invalid|required|failed)[^.!?\n]{0,100}/i) || [''])[0].trim()
    : null;

  // Detect success page using unified helper
  const successDetected = isSuccessPage(currUrl, currentState.title || '', currText);

  // Detect stepper advancement
  const prevStep = previousState.stepper?.currentStep || 0;
  const currStep = currentState.stepper?.currentStep || 0;
  const stepAdvanced = currStep > prevStep;

  // Overall page changed check
  const pageChanged = urlChanged || modalOpened || modalClosed || formAppeared || stepAdvanced;

  return {
    urlChanged,
    modalOpened,
    modalClosed,
    formAppeared,
    errorAppeared,
    errorMessage,
    successDetected,
    stepAdvanced,
    pageChanged,
    pageUnchanged: !pageChanged,
    newUrl: currUrl,
    previousUrl: prevUrl,
  };
};
