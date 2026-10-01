import crypto from 'crypto';
import { logJobEvent } from '../../utils/logger.js';
import { waitForSettled } from '../../browser/session/sessionRegistry.js';

/**
 * Computes a secure SHA-256 signature over the planned fields and answers
 * to ensure consistency during the final human approval phase.
 */
export const generateReviewHash = (fields = []) => {
  const sorted = [...fields].sort((a, b) => a.question.localeCompare(b.question));
  const normalized = sorted.map(f => `${f.question.trim()}:${String(f.answer ?? '').trim()}`).join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
};

/**
 * Parses and verifies whether the active webpage displays direct confirmation evidence.
 */
export const verifySubmission = async (page) => {
  try {
    await waitForSettled(page);
    const url = page.url();
    const text = await page.innerText('body').catch(() => '');

    const confirmationKeywords = [
      'thank you for applying',
      'application submitted',
      'submitted successfully',
      'submission received',
      'thank you for your interest',
      'confirmation number',
      'reference number',
      'your application has been received'
    ];

    const matchedKeyword = confirmationKeywords.find(keyword => text.toLowerCase().includes(keyword));
    const hasError = text.toLowerCase().includes('error') && (text.toLowerCase().includes('invalid') || text.toLowerCase().includes('failed'));

    if (matchedKeyword && !hasError) {
      // Success! Extract surrounding confirmation details safely
      const idx = text.toLowerCase().indexOf(matchedKeyword);
      const confirmationText = text.substring(Math.max(0, idx - 50), Math.min(text.length, idx + 200)).replace(/\s+/g, ' ').trim();

      return {
        success: true,
        outcome: 'SUBMITTED',
        confirmationText,
        finalUrl: url
      };
    }

    if (hasError) {
      return {
        success: false,
        outcome: 'FAILED',
        confirmationText: 'Submission failed on validation errors after click.',
        finalUrl: url
      };
    }

    return {
      success: false,
      outcome: 'UNVERIFIED',
      confirmationText: 'Could not programmatically confirm submission status.',
      finalUrl: url
    };
  } catch (err) {
    return {
      success: false,
      outcome: 'FAILED',
      confirmationText: `Verification failed: ${err.message}`,
      finalUrl: page ? page.url() : ''
    };
  }
};

export default {
  generateReviewHash,
  verifySubmission
};
