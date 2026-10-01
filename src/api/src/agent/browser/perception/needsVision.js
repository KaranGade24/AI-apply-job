/**
 * Evaluates whether vision (screenshot capture + multimodal analysis) is required for the current step.
 * Screenshots are expensive in latency and token usage, so they are only captured when necessary.
 *
 * @param {object} params
 * @param {object} params.observation - The current page observation
 * @param {number} [params.consecutiveFailures=0] - Number of consecutive action failures on this page
 * @param {boolean} [params.forceVision=false] - Explicit flag to force vision
 * @param {string} [params.pageType] - Classified page type
 * @returns {{ required: boolean, reason: string }}
 */
export const needsVision = ({
  observation,
  consecutiveFailures = 0,
  forceVision = false,
  pageType = '',
} = {}) => {
  if (forceVision) {
    return { required: true, reason: 'explicitly_forced' };
  }

  if (!observation) {
    return { required: false, reason: 'no_observation' };
  }

  const { elements = [], visibleTextTrimmed = '' } = observation;

  // 1. Repeated consecutive action failures on the current page
  if (consecutiveFailures >= 2) {
    return {
      required: true,
      reason: `repeated_action_failures (${consecutiveFailures} failures)`,
    };
  }

  // 2. Very few or zero interactive elements detected on a page with visual content
  if (elements.length === 0 && visibleTextTrimmed.length > 50) {
    return {
      required: true,
      reason: 'zero_elements_extracted_on_non_empty_page',
    };
  }

  // 3. High proportion of unlabeled or icon-only controls
  const buttonsAndLinks = elements.filter(
    (e) => e.tag === 'button' || e.role === 'button' || e.tag === 'a'
  );

  if (buttonsAndLinks.length >= 3) {
    const unlabeledCount = buttonsAndLinks.filter(
      (e) => !e.label && !e.text && !e.placeholder && !e.name
    ).length;

    if (unlabeledCount / buttonsAndLinks.length > 0.6) {
      return {
        required: true,
        reason: 'majority_unlabeled_controls_detected',
      };
    }
  }

  // 4. Verification of complex visual states
  if (pageType === 'CAPTCHA_OR_BLOCKED') {
    return {
      required: true,
      reason: 'captcha_security_visual_confirmation',
    };
  }

  return {
    required: false,
    reason: 'dom_metadata_sufficient',
  };
};

export default needsVision;
