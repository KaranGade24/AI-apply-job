import { getSuccessEvidence } from '../../application/pageAnalysis/pageStateDetector.js';
import { logJobEvent, logError } from '../../utils/logger.js';

export const VERIFICATION_STATUS = {
  APPLICATION_COMPLETED: 'APPLICATION_COMPLETED',
  APPLICATION_REQUIRES_HUMAN: 'APPLICATION_REQUIRES_HUMAN'
};

/**
 * High-reliability end-to-end submission verification process.
 * Evaluates whether an application has been successfully submitted or needs manual human review.
 *
 * @param {import('playwright').Page} page - Playwright page instance
 * @param {object} preSubmitState - Captured page state/observation before click
 * @returns {Promise<{ status: string, level: number, details: string, confidence: number, evidence: object }>}
 */
export async function verifySubmission(page, preSubmitState = {}) {
  const startedAt = new Date();
  
  try {
    // 1. Capture resulting URL, page title, and headings/body text
    const resultingUrl = page.url();
    const title = await page.title().catch(() => '');
    const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    
    const headings = await page.evaluate(() => {
      const tags = ['h1', 'h2', 'h3', 'h4'];
      return tags.flatMap(tag => Array.from(document.querySelectorAll(tag)).map(el => el.innerText.trim()));
    }).catch(() => []);

    // 2. Perform Zod-based/regex evidence mapping
    const evidence = getSuccessEvidence(resultingUrl, title, bodyText);

    // 3. Compare against the pre-submit state to detect simple URL-only transitions
    const preUrl = preSubmitState?.url || '';
    const urlChanged = preUrl !== resultingUrl;

    // 4. Capture any visible form validation error messages
    const errorAlertPatterns = [
      /error/i, /invalid/i, /required/i, /please\s+fill/i,
      /can'?t\s+be\s+blank/i, /must\s+be/i, /failed/i
    ];
    const hasPostErrors = errorAlertPatterns.some(p => p.test(bodyText));

    const analysisDetails = {
      preUrl,
      resultingUrl,
      urlChanged,
      title,
      headings: headings.slice(0, 10),
      evidenceLevel: evidence.level,
      hasPostErrors,
      detectionDetails: evidence.details
    };

    // Strict gate requirements:
    // Only accept APPLICATION_COMPLETED if evidence level is >= 2 (Level 2, 3 or 4) AND no error alerts are present
    const isStrongSuccess = evidence.isSuccess && (evidence.level >= 2) && !hasPostErrors;

    if (isStrongSuccess) {
      await logJobEvent(
        'submissionVerifier',
        'VERIFIED_SUCCESS',
        `Submission confirmed at Level ${evidence.level}: ${evidence.details}`
      );

      return {
        status: VERIFICATION_STATUS.APPLICATION_COMPLETED,
        level: evidence.level,
        details: evidence.details,
        confidence: evidence.confidence,
        evidence: analysisDetails
      };
    }

    // Default to human intervention for safety when indicators are weak or ambiguous
    await logJobEvent(
      'submissionVerifier',
      'REQUIRES_HUMAN',
      `Ambiguous or low-confidence submission state (Level ${evidence.level}). Transferring to human verification.`
    );

    return {
      status: VERIFICATION_STATUS.APPLICATION_REQUIRES_HUMAN,
      level: evidence.level,
      details: hasPostErrors
        ? 'Application contains validation errors/warnings on screen.'
        : `Ambiguous evidence level (${evidence.level}). ${evidence.details}`,
      confidence: hasPostErrors ? 0.0 : evidence.confidence,
      evidence: analysisDetails
    };

  } catch (err) {
    await logError('submissionVerifier.verifySubmission', err.message);
    return {
      status: VERIFICATION_STATUS.APPLICATION_REQUIRES_HUMAN,
      level: 0,
      details: `Exception occurred during verification: ${err.message}`,
      confidence: 0.0,
      evidence: {}
    };
  }
}
