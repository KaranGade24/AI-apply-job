/**
 * Checks if a given URL, page title, or body text indicates a successful application submission.
 *
 * @param {string} [url='']
 * @param {string} [title='']
 * @param {string} [bodyText='']
 * @returns {boolean}
 */
export const isSuccessPage = (url = '', title = '', bodyText = '') => {
  const successPatterns = [
    /application\s+submitted/i,
    /thank\s+you\s+for\s+applying/i,
    /your\s+application\s+has\s+been\s+received/i,
    /application\s+successfully\s+submitted/i,
    /we\s+have\s+received\s+your\s+application/i,
    /thank\s+you\s+for\s+your\s+interest/i,
    /application\s+complete/i,
    /you\s+have\s+successfully\s+applied/i,
    /applied\s+successfully/i,
  ];

  const textToScan = `${title} ${bodyText}`.slice(0, 5000);
  const successByText = successPatterns.some((p) => p.test(textToScan));
  const successByUrl = /(?:confirmation|success|thank[-_]?you|applied)/i.test(url);

  return successByText || successByUrl;
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
