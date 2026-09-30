import { VERIFICATION_LEVELS } from "../../constant/application.constant.js";
import { logJobEvent } from "../../utils/logger.js";

/**
 * Independently verifies whether a job application was actually submitted.
 *
 * CRITICAL RULE:
 * Never mark submission complete solely because the submit button was clicked or the URL changed.
 * Final submission requires Level 3 (semantic success message) or Level 4 (confirmation ID).
 *
 * @param {import('playwright').Page} page
 * @param {object} previousObservation - Observation before submit click
 * @param {object} currentObservation - Observation after submit click
 * @returns {Promise<object>} Submission verification result
 */
export const verifySubmission = async (page, previousObservation, currentObservation) => {
  const visibleText = (currentObservation.visibleSnippet || "").toLowerCase();
  const headings = (currentObservation.headings || []).map((h) => h.toLowerCase());

  // 1. Check for failure or error banners first
  const validationErrors = currentObservation.validationMessages || [];
  const failureKeywords = [
    "something went wrong",
    "submission failed",
    "unable to submit",
    "error occurred while submitting",
    "please fix the errors",
    "application was not submitted",
  ];

  const detectedFailure = failureKeywords.find((kw) => visibleText.includes(kw));
  if (detectedFailure || validationErrors.length > 0) {
    return {
      verified: false,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_1,
      isExplicitFailure: true,
      confirmationId: null,
      evidence: {
        detectedFailure: detectedFailure || validationErrors[0],
        validationErrors,
      },
      confidence: 0.95,
      reason: `Submission failed on page: ${detectedFailure || validationErrors.join("; ")}`,
    };
  }

  // 2. Look for strong confirmation IDs / receipt codes
  // e.g. "Confirmation #12345", "Application ID: ABC-789", "Reference: 98765"
  let confirmationId = null;
  const idRegex = /(?:confirmation|application|reference|submission)\s*(?:#|id|number|code)?\s*[:#]?\s*([a-zA-Z0-9\-_]{4,24})/i;
  const idMatch = currentObservation.visibleSnippet?.match(idRegex);
  if (idMatch && idMatch[1] && !["number", "code", "id"].includes(idMatch[1].toLowerCase())) {
    confirmationId = idMatch[1];
  }

  // 3. Look for explicit success headlines & text
  const successTerms = [
    "application submitted",
    "thank you for applying",
    "application received",
    "your application has been submitted",
    "successfully applied",
    "we have received your application",
    "application complete",
    "thanks for your interest",
  ];

  const matchedTerms = successTerms.filter(
    (term) => visibleText.includes(term) || headings.some((h) => h.includes(term))
  );

  // 4. Check for submit button disappearance
  const prevSubmitExists = (previousObservation.buttons || []).some(
    (b) => (b.text || "").toLowerCase().includes("submit") || (b.text || "").toLowerCase().includes("apply")
  );
  const currSubmitExists = (currentObservation.buttons || []).some(
    (b) => (b.text || "").toLowerCase().includes("submit") || (b.text || "").toLowerCase().includes("apply")
  );
  const submitButtonDisappeared = prevSubmitExists && !currSubmitExists;

  // 5. Determine Verification Level & Outcome
  if (confirmationId && matchedTerms.length > 0) {
    return {
      verified: true,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_4,
      confirmationId,
      evidence: {
        matchedTerms,
        confirmationId,
        submitButtonDisappeared,
        url: currentObservation.url,
      },
      confidence: 0.99,
      reason: `Application submission verified with confirmation ID (${confirmationId}) and success message`,
    };
  }

  if (matchedTerms.length > 0) {
    return {
      verified: true,
      verificationLevel: VERIFICATION_LEVELS.LEVEL_3,
      confirmationId: null,
      evidence: {
        matchedTerms,
        submitButtonDisappeared,
        url: currentObservation.url,
      },
      confidence: 0.94,
      reason: `Application submission verified via semantic success message: "${matchedTerms[0]}"`,
    };
  }

  // If URL changed but no explicit success message exists, it is AMBIGUOUS
  const urlChanged = previousObservation.url !== currentObservation.url;
  return {
    verified: false,
    verificationLevel: urlChanged ? VERIFICATION_LEVELS.LEVEL_1 : VERIFICATION_LEVELS.LEVEL_0,
    isAmbiguous: true,
    confirmationId: null,
    evidence: {
      urlChanged,
      prevUrl: previousObservation.url,
      currUrl: currentObservation.url,
      matchedTerms: [],
    },
    confidence: 0.5,
    reason: "Submission outcome is ambiguous. No clear confirmation message or ID detected.",
  };
};
