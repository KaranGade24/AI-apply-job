import crypto from "crypto";

/**
 * Computes a deterministic SHA-256 fingerprint of the current page observation and form state
 *
 * @param {object} observation - PageObservation
 * @param {number} [step=1] - Current form step
 * @returns {string} Hex hash fingerprint
 */
export const computeStateFingerprint = (observation = {}, step = 1) => {
  const url = observation.url || "";
  const headings = (observation.headings || []).join("|");
  const validationErrors = (observation.validationMessages || []).join("|");
  const interactiveCount = observation.interactiveElements?.length || 0;
  const dialogCount = observation.dialogs?.length || 0;

  const raw = `${url}::step_${step}::headings_${headings}::errs_${validationErrors}::count_${interactiveCount}::dialogs_${dialogCount}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
};

/**
 * Checks if the agent is stuck in an execution loop
 *
 * @param {Array<{ fingerprint: string, actionId?: string, actionType?: string }>} history
 * @param {number} [threshold=3] - Maximum identical repeated states
 * @returns {{ isLoop: boolean, occurrences: number, reason?: string }}
 */
export const detectExecutionLoop = (history = [], threshold = 3) => {
  if (!Array.isArray(history) || history.length < threshold) {
    return { isLoop: false, occurrences: 0 };
  }

  const latest = history[history.length - 1];
  if (!latest || !latest.fingerprint) {
    return { isLoop: false, occurrences: 0 };
  }

  // Count identical consecutive fingerprints
  let consecutiveMatches = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].fingerprint === latest.fingerprint) {
      consecutiveMatches += 1;
    } else {
      break;
    }
  }

  if (consecutiveMatches >= threshold) {
    return {
      isLoop: true,
      occurrences: consecutiveMatches,
      reason: `Page state (${latest.fingerprint}) remained unchanged across ${consecutiveMatches} consecutive actions`,
    };
  }

  return { isLoop: false, occurrences: consecutiveMatches };
};
