import { QUESTION_CLASSIFICATIONS } from "../../constant/application.constant.js";

/**
 * Sensitive question keywords requiring explicit user configuration or human clarification.
 * The system MUST NEVER hallucinate or invent answers for these fields.
 */
const SENSITIVE_KEYWORDS = [
  "sponsorship",
  "visa",
  "authorized to work",
  "legal authorization",
  "citizenship",
  "security clearance",
  "disability",
  "veteran",
  "ethnicity",
  "race",
  "gender",
  "criminal",
  "convicted",
  "salary expectation",
  "desired salary",
  "minimum compensation",
];

/**
 * Inspects a field/question to ensure no sensitive or unprovenanced data is automatically hallucinated
 *
 * @param {object} question - Extracted field/question
 * @param {object} candidateProfile - Resolved user profile and settings
 * @returns {{ isSensitive: boolean, canAutoResolve: boolean, reason: string }}
 */
export const guardSensitiveQuestion = (question, candidateProfile = {}) => {
  const text = `${question.questionText || ""} ${question.label || ""} ${question.name || ""}`.toLowerCase();

  const matchedKeyword = SENSITIVE_KEYWORDS.find((kw) => text.includes(kw));

  if (matchedKeyword) {
    // Check if the user has explicitly configured this in preferences
    const hasExplicitAnswer =
      candidateProfile?.preferences?.[matchedKeyword] ||
      candidateProfile?.workAuthorization?.[matchedKeyword];

    if (!hasExplicitAnswer) {
      return {
        isSensitive: true,
        canAutoResolve: false,
        classification: QUESTION_CLASSIFICATIONS.LEGAL_SENSITIVE,
        reason: `Sensitive / legal question detected ("${matchedKeyword}"). No pre-configured answer found; human clarification required.`,
      };
    }
  }

  return {
    isSensitive: !!matchedKeyword,
    canAutoResolve: true,
    classification: QUESTION_CLASSIFICATIONS.PROFILE_DERIVED,
    reason: "Safe to auto-resolve from verified candidate profile",
  };
};
