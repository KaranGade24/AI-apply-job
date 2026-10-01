import { logJobEvent } from '../../utils/logger.js';
import { classifyPageWithLlm } from './pageClassifierLlm.js';

/**
 * Deterministically classifies the page context using simple signals,
 * falling back to the LLM classifier with high-precision compact states when confidence is low.
 */
export const classifyPageDeterministic = async (browserState, jobDetails = {}, userId = null) => {
  const url = (browserState.url || '').toLowerCase();
  const title = (browserState.title || '').toLowerCase();
  const elements = browserState.elements || [];

  // Rule 1: Captcha / Blocked Checks
  if (browserState.hasCaptchaSignals) {
    return {
      pageType: 'captcha',
      confidence: 1.0,
      nextRecommendedAction: 'human_review',
      actionReason: 'Captcha challenge or bot protection screen detected.'
    };
  }

  // Rule 2: Login / Signup Checks
  if (browserState.hasLoginSignals) {
    return {
      pageType: 'login_signup',
      confidence: 1.0,
      nextRecommendedAction: 'human_review',
      actionReason: 'Candidate login or signup gate detected on portal.'
    };
  }

  // Rule 2.5: Sensitive Field checks (passwords, OTPs, cookies, tokens)
  if (browserState.hasSensitiveSignals) {
    return {
      pageType: 'sensitive_fields',
      confidence: 1.0,
      nextRecommendedAction: 'human_review',
      actionReason: browserState.sensitiveReason || 'Sensitive credential input fields detected.'
    };
  }

  // Rule 3: Success / Confirmation checks
  const confirmationWords = ['thank you for applying', 'application submitted', 'submitted successfully', 'submission received', 'thank you for your interest'];
  const hasConfirmationText = elements.some(el => {
    const text = (el.accessibleName || '').toLowerCase();
    return confirmationWords.some(w => text.includes(w));
  });
  if (hasConfirmationText || confirmationWords.some(w => title.includes(w))) {
    return {
      pageType: 'success_confirmation',
      confidence: 1.0,
      nextRecommendedAction: 'finish',
      actionReason: 'Application success or completion notice detected.'
    };
  }

  // Rule 4: Closed / Expired form checks
  const closedWords = ['no longer accepting responses', 'this form is closed', 'job is closed', 'position is filled', 'application closed'];
  const hasClosedText = elements.some(el => {
    const text = (el.accessibleName || '').toLowerCase();
    return closedWords.some(w => text.includes(w));
  });
  if (hasClosedText || closedWords.some(w => title.includes(w))) {
    return {
      pageType: 'closed_expired',
      confidence: 1.0,
      nextRecommendedAction: 'human_review',
      actionReason: 'Target position or online form is officially closed.'
    };
  }

  // Rule 5: External ATS matching
  const atsDomains = ['workday', 'greenhouse', 'lever.co', 'bamboohr', 'icims', 'smartrecruiters', 'jobvite'];
  if (atsDomains.some(d => url.includes(d))) {
    return {
      pageType: 'external_ats',
      confidence: 0.9,
      nextRecommendedAction: 'fill_form',
      actionReason: 'Identified major external Applicant Tracking System.'
    };
  }

  // Rule 6: Low-confidence/Fallback -> Run existing LLM classifier
  await logJobEvent('deterministicClassifier', 'LOW_CONFIDENCE', 'Low confidence on deterministic rules. Invoking LLM Page Classifier...');

  // Map BrowserState format to match extractedPageContent format for the LLM classifier
  const extractedAdapter = {
    url: browserState.url,
    title: browserState.title,
    headings: [],
    emails: [],
    referenceIds: [],
    formFieldsCount: elements.filter(el => el.tag === 'input' || el.tag === 'select').length,
    openingsList: [],
    textSnippet: elements.slice(0, 30).map(el => `${el.tag}: ${el.accessibleName || ''}`).join('\n') // compact state feed
  };

  const llmResult = await classifyPageWithLlm(extractedAdapter, jobDetails, userId);
  return {
    ...llmResult,
    confidence: 0.7
  };
};

export default {
  classifyPageDeterministic
};
