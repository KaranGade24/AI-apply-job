/**
 * Vision reinforcement policies.
 * Evaluates whether to activate the vision modality (screenshot) based on state characteristics.
 */

/**
 * Evaluates whether the current state triggers a vision/screenshot fallback decision.
 * @param {object} state - Consolidated BrowserState object
 * @param {object} [options] - Historical step metadata
 * @returns {{ useVision: boolean, reasons: string[] }}
 */
export const shouldUseVision = (state, options = {}) => {
  const elements = state.elements || [];

  // (a) Few/no interactive elements but a visible page
  const hasFewElements = elements.length <= 3;

  // (b) Unlabeled/icon controls
  const hasUnlabeledControls = elements.some(el => {
    const name = (el.accessibleName || '').trim();
    return name.length === 0 && ['button', 'a', 'input'].includes(el.tag);
  });

  // (c) The last 2 steps failed
  const consecutiveFailures = options.consecutiveFailures || 0;
  const lastStepsFailed = consecutiveFailures >= 2;

  // (d) The page changed with no new elements
  const pageChangedNoNewElements = options.pageChangedNoNewElements || false;

  // (e) Classifier confidence is low
  const classifierConfidence = options.classifierConfidence || 1.0;
  const confidenceIsLow = classifierConfidence < 0.6;

  // (f) The agent explicitly asks for it
  const agentRequested = options.agentRequested || false;

  const decision = {
    useVision: hasFewElements || hasUnlabeledControls || lastStepsFailed || pageChangedNoNewElements || confidenceIsLow || agentRequested,
    reasons: []
  };

  if (hasFewElements) decision.reasons.push('Few or no interactive elements found on the DOM');
  if (hasUnlabeledControls) decision.reasons.push('Detected unlabeled or icon controls');
  if (lastStepsFailed) decision.reasons.push('The last two step executions failed consecutively');
  if (pageChangedNoNewElements) decision.reasons.push('Page state transitioned with no new elements');
  if (confidenceIsLow) decision.reasons.push('Classifier confidence level fell below target threshold');
  if (agentRequested) decision.reasons.push('Agent requested screenshot validation');

  return decision;
};

export default {
  shouldUseVision
};
