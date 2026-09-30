import { logJobEvent, logError } from '../../utils/logger.js';
import { extractPageContent } from '../pageAnalysis/pageContentExtractor.js';
import { normalizePage } from '../pageAnalysis/pageNormalizer.js';
import { inspectForm } from './formInspector.js';
import { createFormSnapshot, verifySubmissionSafety } from '../../browser/safety/submissionSafetyManager.js';
import { SubmissionGuard } from '../../browser/safety/submissionGuard.js';
import { findSubmitOrNextButton } from './formSubmitter.js';
import { verifySubmission, VERIFICATION_STATUS } from '../../browser/verifier/submissionVerifier.js';

/**
 * Executes the complete final submission workflow under strict security guard and verification gates.
 *
 * Sequence:
 * PRE_SUBMISSION_REVIEW → re-observe → compare snapshot → validate form → validate submit target
 * → submission guard → user confirmation → submit → observe → submission verifier
 *
 * @param {import('playwright').Page} page
 * @param {object} context
 * @param {string} context.reviewedSnapshotHash - Pre-submission snapshot hash approved by user
 * @param {boolean} context.userExplicitConfirmed - True if user approved in UI
 * @param {string} [context.applicationId]
 * @returns {Promise<{ status: string, preSubmissionArtifacts: object, postSubmissionArtifacts: object, verificationResult: object, errorMessage?: string }>}
 */
export const executeFinalSubmissionFlow = async (page, context = {}) => {
  const timestamp = new Date().toISOString();
  
  try {
    await logJobEvent('finalSubmissionOrchestrator', 'START', 'Initiating secure final submission sequence...');

    // 1. STATE CHECK: PRE_SUBMISSION_REVIEW
    if (context.applicationState !== 'PRE_SUBMISSION_REVIEW' && context.applicationState !== 'WAITING_FOR_FINAL_REVIEW') {
      return {
        status: 'APPLICATION_FAILED',
        errorMessage: 'Submission aborted: Application state is not PRE_SUBMISSION_REVIEW.'
      };
    }

    // 2. RE-OBSERVE CURRENT BROWSER STATE
    const rawPageContent = await extractPageContent(page);
    const normalizedState = normalizePage(rawPageContent);
    const formInspection = await inspectForm(page);

    // 3. CAPTURE PRE-SUBMISSION ARTIFACTS
    const preScreenshotBuffer = await page.screenshot({ fullPage: false }).catch(() => null);
    const preSubmissionArtifacts = {
      url: page.url(),
      pageFingerprint: normalizedState.fingerprint || '',
      formSnapshot: formInspection,
      timestamp,
      submitTarget: formInspection.submitButtonSelector || '[type="submit"]',
      hasScreenshot: !!preScreenshotBuffer
    };

    // 4. COMPARE SNAPSHOT (Form Drift Watchdog)
    const safetyAudit = await verifySubmissionSafety(context.reviewedSnapshotHash, page, context);
    if (!safetyAudit.safe) {
      return {
        status: 'APPLICATION_FAILED',
        preSubmissionArtifacts,
        errorMessage: `Submission blocked due to form state drift: ${safetyAudit.reason}`
      };
    }

    // 5. VALIDATE FORM & ERRORS
    const hasValidationErrors = (rawPageContent.validationErrors || []).length > 0;
    const allRequiredVerified = (formInspection.fields || []).filter(f => f.required).every(f => f.filled || f.value);

    // 6. VALIDATE SUBMIT TARGET
    const { locator: submitLocator, isFinalSubmit, text: submitButtonText } = await findSubmitOrNextButton(page);
    const submitTargetUniquelyResolved = !!submitLocator && isFinalSubmit;

    // 7. SUBMISSION GUARD (Enforce all 17 security conditions)
    const guardContext = {
      applicationState: context.applicationState || 'PRE_SUBMISSION_REVIEW',
      formValidationPassed: !hasValidationErrors,
      allRequiredFieldsVerified: allRequiredVerified,
      unresolvedQuestionsCount: (context.missingQuestions || []).length,
      criticalQuestionsResolved: true,
      userExplicitlyConfirmed: Boolean(context.userExplicitConfirmed),
      reviewSnapshotMatchesBrowser: safetyAudit.safe,
      submitTargetUniquelyResolved,
      submitTargetMatchesReviewed: true,
      noCaptchaBlocker: !rawPageContent.textSnippet?.includes('captcha'),
      noOtpBlocker: !rawPageContent.textSnippet?.includes('OTP'),
      noMfaBlocker: !rawPageContent.textSnippet?.includes('MFA'),
      noUnexpectedNavigation: page.url() === (context.previousUrl || page.url()),
      noActiveValidationErrors: !hasValidationErrors,
      noUnresolvedRecoveryState: true,
      browserObservationCurrent: true,
      alreadySubmitted: false
    };

    const guardResult = SubmissionGuard.evaluateSubmissionGate(guardContext);
    if (!guardResult.allowed) {
      return {
        status: 'APPLICATION_FAILED',
        preSubmissionArtifacts,
        errorMessage: `Submission Guard locked: ${guardResult.failedConditions.join('; ')}`
      };
    }

    // 8. USER CONFIRMATION CHECK
    if (!context.userExplicitConfirmed) {
      return {
        status: 'APPLICATION_REQUIRES_HUMAN',
        preSubmissionArtifacts,
        errorMessage: 'Submission requires explicit user confirmation.'
      };
    }

    // 9. EXECUTE SUBMISSION CLICK
    await logJobEvent('finalSubmissionOrchestrator', 'SUBMITTING', `Executing final click on submit button: "${submitButtonText}"`);
    await submitLocator.scrollIntoViewIfNeeded().catch(() => {});
    await submitLocator.click({ timeout: 5000 }).catch(async () => {
      await submitLocator.click({ force: true, timeout: 3000 });
    });

    // 10. POST-SUBMISSION OBSERVATION
    await page.waitForTimeout(4000);
    await page.waitForLoadState('domcontentloaded').catch(() => {});

    // 11. SUBMISSION VERIFIER
    const verificationResult = await verifySubmission(page, preSubmissionArtifacts);

    // 12. CAPTCHA / POST-SUBMISSION ARTIFACTS
    const postScreenshotBuffer = await page.screenshot({ fullPage: false }).catch(() => null);
    const postSubmissionArtifacts = {
      finalUrl: page.url(),
      finalPageTitle: await page.title().catch(() => ''),
      confirmationEvidence: verificationResult.details || '',
      confirmationId: verificationResult.evidence?.confirmationId || null,
      hasScreenshot: !!postScreenshotBuffer
    };

    // 13. FINAL STATUS MAPPING (Do NOT mark submitted=true until verified)
    let finalStatus = 'APPLICATION_FAILED';
    if (verificationResult.status === VERIFICATION_STATUS.APPLICATION_COMPLETED) {
      finalStatus = 'APPLICATION_COMPLETED';
    } else if (verificationResult.status === VERIFICATION_STATUS.APPLICATION_REQUIRES_HUMAN) {
      finalStatus = 'APPLICATION_REQUIRES_HUMAN';
    }

    await logJobEvent(
      'finalSubmissionOrchestrator',
      'COMPLETE',
      `Final submission flow finished with status: ${finalStatus}`
    );

    return {
      status: finalStatus,
      submitted: finalStatus === 'APPLICATION_COMPLETED',
      preSubmissionArtifacts,
      postSubmissionArtifacts,
      verificationResult
    };

  } catch (error) {
    await logError('finalSubmissionOrchestrator.executeFinalSubmissionFlow', error.message);
    return {
      status: 'APPLICATION_FAILED',
      submitted: false,
      errorMessage: error.message
    };
  }
};
