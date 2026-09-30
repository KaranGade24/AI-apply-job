import crypto from 'crypto';
import { logJobEvent, logError } from '../../utils/logger.js';
import { extractPageContent } from '../../application/pageAnalysis/pageContentExtractor.js';
import { normalizePage } from '../../application/pageAnalysis/pageNormalizer.js';
import { inspectForm } from '../../application/form/formInspector.js';

/**
 * Creates a deterministic, stable snapshot hash representing the full state of the form before review.
 *
 * @param {import('playwright').Page} page
 * @param {object} context
 * @returns {Promise<{ snapshot: object, hash: string }>}
 */
export const createFormSnapshot = async (page, context = {}) => {
  try {
    const url = page.url();
    const rawContent = await extractPageContent(page);
    const normalized = normalizePage(rawContent);
    const formInspection = await inspectForm(page);

    const fields = formInspection.fields || [];
    
    // Gather all fields, options, and required statuses deterministically
    const formFingerprintData = fields.map(f => ({
      fieldId: f.fieldId || '',
      type: f.type || '',
      required: Boolean(f.required),
      options: (f.options || []).sort(),
      label: f.label || ''
    })).sort((a, b) => (a.fieldId || a.label).localeCompare(b.fieldId || b.label));

    // Compile the comprehensive deterministic snapshot structure
    const snapshot = {
      url,
      pageTitle: normalized.title || '',
      formFieldsCount: fields.length,
      formFingerprint: formFingerprintData,
      answers: context.answers || [],
      checkboxStates: context.checkboxStates || [],
      uploadedResume: context.uploadedResumeId || null,
      coverLetter: context.coverLetter || '',
      unresolvedCount: (context.missingQuestions || []).length,
      submitButtonSelector: formInspection.submitButtonSelector || '[type="submit"]',
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(snapshot))
      .digest('hex');

    await logJobEvent(
      'submissionSafetyManager',
      'SNAPSHOT_CREATED',
      `Snapshot created. Hash: [${hash.slice(0, 16)}] | URL: ${url} | Fields: ${fields.length}`
    );

    return { snapshot, hash };
  } catch (error) {
    await logError('submissionSafetyManager.createFormSnapshot', error.message);
    throw error;
  }
};

/**
 * Validates current browser form state against a previously reviewed snapshot hash.
 * If material changes are detected, block the submission for safety.
 *
 * @param {string} reviewedHash - Pre-submission snapshot hash confirmed by the candidate
 * @param {import('playwright').Page} page
 * @param {object} context - Context containing inputs, answers, and states
 * @returns {Promise<{ safe: boolean, reason?: string, currentHash: string }>}
 */
export const verifySubmissionSafety = async (reviewedHash, page, context = {}) => {
  try {
    await logJobEvent('submissionSafetyManager', 'SAFETY_AUDIT_START', 'Recalculating browser state-drift snapshot...');

    const { snapshot, hash } = await createFormSnapshot(page, context);

    if (hash !== reviewedHash) {
      // Analyze exactly what changed
      let diffReason = 'Unknown structural drift.';
      if (page.url() !== context.previousUrl) {
        diffReason = `URL changed from ${context.previousUrl} to ${page.url()} (Navigation occurred post-review).`;
      } else {
        diffReason = `DOM structural change detected! The fields, options, or required validations have drifted since review.`;
      }

      await logJobEvent(
        'submissionSafetyManager',
        'SUBMISSION_BLOCKED',
        `SAFETY WATCHDOG: Blocked submission! Drift detected. Hash [${hash.slice(0, 16)}] !== [${reviewedHash?.slice(0, 16)}]`
      );

      return {
        safe: false,
        reason: diffReason,
        currentHash: hash
      };
    }

    await logJobEvent('submissionSafetyManager', 'SAFETY_AUDIT_PASSED', 'Form layout confirmed stable. Safe to proceed with submission.');
    return {
      safe: true,
      currentHash: hash
    };
  } catch (error) {
    await logError('submissionSafetyManager.verifySubmissionSafety', error.message);
    return { safe: false, reason: `Safety validation error: ${error.message}`, currentHash: '' };
  }
};
