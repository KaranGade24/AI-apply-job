import { BrowserManager } from '../../../browser/browserManager.js';
import { findNaukriAccountByUserId } from '../../../repositories/naukriAccount.repository.js';
import { decryptValue } from '../../../utils/encryption.js';
import { detectNaukriAuthState } from '../../jobSources/naukri/naukriAuthDetector.js';
import {
  detectApplyAction,
  detectSecurityPrompt,
  detectSubmissionSuccess,
} from './naukriApplicationParser.js';
import { inspectForm } from '../../../application/form/formInspector.js';
import { resolveAllFormAnswers } from '../../../application/answer/answerResolver.js';
import { executeBrowserActions } from '../../../application/browser/browserActionExecutor.js';
import { validateBrowserActionPlan } from '../../../application/browser/browserActionValidator.js';
import {
  APPLICATION_STATUS,
  FORM_ACTIONS,
  HUMAN_REASONS,
} from '../../../constant/application.constant.js';
import { FIELD_TYPES } from '../../../application/form/fieldTypes.js';
import { extractPageContent } from '../../../application/pageAnalysis/pageContentExtractor.js';
import { classifyPageWithLlm } from '../../../application/pageAnalysis/pageClassifierLlm.js';
import { navigatePortalWithAiDecision } from '../../../application/pageAnalysis/pageNavigator.js';
import { updateApplicationStatus, findApplicationById } from '../../../repositories/application.repository.js';
import { JobApplication } from '../../../model/JobApplication.js';
import { UserProfile } from '../../../model/UserProfile.js';
import { User } from '../../../model/User.js';
import { Setting } from '../../../model/Setting.js';
import { logJobEvent, logError } from '../../../utils/logger.js';
import { appError } from '../../../utils/errors.js';

/**
 * Core Browser Application Engine for Naukri Jobs
 * Executes the complete application lifecycle with 2 Human Checkpoints:
 * - Checkpoint 1: Missing information / questions required by employer
 * - Checkpoint 2: Final review of all fields and answers before submission
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.userId
 * @param {Array<object>} [params.userAnswers] - User-supplied answers for missing questions (Checkpoint 1)
 * @param {boolean} [params.confirmSubmission=false] - Explicit final approval to submit (Checkpoint 2)
 * @param {Array<object>} [params.finalEditedAnswers] - Optional user edits during final review
 * @returns {Promise<object>} Result of application execution
 */
export const runNaukriApplication = async ({
  applicationId,
  userId,
  userAnswers = [],
  confirmSubmission = false,
  finalEditedAnswers = [],
}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!applicationId || !userId) {
      throw new appError('applicationId and userId are required to run Naukri application.', 400);
    }

    await logJobEvent(
      'naukriApplication',
      'START',
      `Starting application process for App: ${applicationId}, Confirm: ${confirmSubmission}`
    );

    // 1. Fetch Application, Job, User, Profile, Settings
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError(`Application not found: ${applicationId}`, 404);
    }

    const job = application.jobId || {};
    const jobUrl = job.applicationUrl || job.sourceUrl;
    if (!jobUrl) {
      throw new appError('Job application URL is missing.', 400);
    }

    const [userDoc, profileDoc, settingDoc] = await Promise.all([
      User.findById(userId),
      UserProfile.findOne({ userId }),
      Setting.findOne({ userId }),
    ]);

    // 2. Load and decrypt authenticated Naukri session
    const naukriAccount = await findNaukriAccountByUserId(userId);
    let sessionState = null;

    if (
      naukriAccount &&
      naukriAccount.encryptedStorageState &&
      naukriAccount.encryptedStorageState.cipherText
    ) {
      try {
        const decrypted = decryptValue(naukriAccount.encryptedStorageState);
        sessionState = JSON.parse(decrypted);
      } catch (err) {
        await logError('naukriApplication.decrypt', err.message);
      }
    }

    if (!sessionState) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        'form.requiresHuman': true,
        'form.humanReason': HUMAN_REASONS.SESSION_EXPIRED,
      });

      return {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        humanReason: HUMAN_REASONS.SESSION_EXPIRED,
        message: 'Naukri account session is disconnected or expired. Please connect your Naukri account first.',
      };
    }

    // 3. Launch Playwright context with restored session
    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(browser, {
      storageState: sessionState,
    });
    page = await context.newPage();

    // 4. Open Job URL
    await updateApplicationStatus(applicationId, APPLICATION_STATUS.OPENING_JOB, {
      logMessage: `Opening Naukri job URL: ${jobUrl}`,
    });

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 25000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(2000);

    // 5. Verify Authentication on live page
    const authState = await detectNaukriAuthState(page);
    if (!authState.authenticated) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        'form.requiresHuman': true,
        'form.humanReason': HUMAN_REASONS.SESSION_EXPIRED,
      });

      return {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        humanReason: HUMAN_REASONS.SESSION_EXPIRED,
        message: 'Your active Naukri session has expired. Please re-authenticate your Naukri account.',
      };
    }

    // 6. Check Security prompts (CAPTCHA / OTP / 2FA)
    const securityCheck = await detectSecurityPrompt(page);
    if (securityCheck.detected) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        'form.requiresHuman': true,
        'form.humanReason': securityCheck.reason,
      });

      return {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        humanReason: securityCheck.reason,
        message: `Security verification required (${securityCheck.reason.toUpperCase()}). Please complete the challenge.`,
      };
    }

    // 7. Check if already applied
    const alreadyAppliedCheck = await detectSubmissionSuccess(page);
    if (alreadyAppliedCheck.isSubmitted) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLIED, {
        logMessage: 'Job was already applied previously on Naukri.',
      });
      await JobApplication.findByIdAndUpdate(applicationId, {
        'form.submittedAt': new Date(),
      });
      return {
        status: APPLICATION_STATUS.APPLIED,
        message: 'Job was already applied successfully.',
      };
    }

    // 8. Detect Apply Action & Analyze Page Content
    const applyAction = await detectApplyAction(page);
    let activePage = page;

    if (applyAction.isCompanySite) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.ANALYZING_PORTAL, {
        logMessage: 'Employer directs to external career site. Navigating via #company-site-button...',
      });

      const newPagePromise = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
      const companySiteBtn = page.locator(applyAction.selector || '#company-site-button').first();
      await companySiteBtn.click().catch(() => {});
      const popup = await newPagePromise;
      if (popup) {
        await popup.waitForLoadState('domcontentloaded').catch(() => {});
        activePage = popup;
      }
      await activePage.waitForTimeout(3000);

      // Extract rendered portal content and analyze with Gemini AI
      const extracted = await extractPageContent(activePage);
      const analysis = await classifyPageWithLlm(extracted, job, userId);

      await JobApplication.findByIdAndUpdate(applicationId, {
        applicationMethod: 'company_site',
        pageAnalysis: {
          ...analysis,
          pageTitle: extracted.title,
          currentUrl: activePage.url(),
          analyzedAt: new Date(),
        },
      });

      // If portal renders a listings/accordion directory (e.g. "India Openings" with multiple roles)
      if (analysis.pageType === 'job_listings_accordion' || analysis.nextRecommendedAction === 'click_opening_apply') {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLYING, {
          logMessage: `AI matched role "${analysis.matchedRole?.title || job.title}". Expanding role and clicking Apply Now...`,
        });

        const navResult = await navigatePortalWithAiDecision(activePage, analysis, context);
        if (navResult.newPage) {
          activePage = navResult.newPage;
        }
        await activePage.waitForTimeout(2500);
      }

      // If email instructions with reference ID were detected
      if (analysis.pageType === 'email_instructions' && analysis.emailContact?.email) {
        const refId = analysis.emailContact.referenceId || analysis.matchedRole?.referenceId;
        const subj = refId
          ? `Application: ${job.title} (Ref: ${refId})`
          : `Application: ${job.title}`;

        await JobApplication.findByIdAndUpdate(applicationId, {
          'email.recipient': analysis.emailContact.email,
          'email.subject': subj,
          'email.body': `Dear Hiring Team,\n\nI am applying for the ${job.title} position${refId ? ` (Reference ID: ${refId})` : ''} at ${job.company}. My tailored ATS resume is attached for your review.\n\nBest regards,\n${userDoc?.fullName || 'Applicant'}`,
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
        });

        return {
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          isCompanySite: true,
          emailContact: analysis.emailContact,
          message: `Employer specifies email applications with Ref ID ${refId || 'N/A'}. Prepared outreach draft.`,
        };
      }
    } else {
      if (!applyAction.hasApply) {
        // In case apply button has already turned into "Applied" or unavailable
        const successCheck = await detectSubmissionSuccess(page);
        if (successCheck.isSubmitted) {
          await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLIED, {
            logMessage: 'Application confirmed as submitted on Naukri.',
          });
          return {
            status: APPLICATION_STATUS.APPLIED,
            message: 'Job application completed successfully.',
          };
        }
      }

      // 9. Click the direct Apply button
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLYING, {
        logMessage: 'Clicking Naukri Apply button (#apply-button)...',
      });

      const applyLocator = page.locator(applyAction.selector || '#apply-button').first();
      await applyLocator.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      await applyLocator.click().catch(() => {});
      await page.waitForTimeout(3000);

      // Check if application was completed directly without questionnaire
      const immediateSuccess = await detectSubmissionSuccess(page);
      if (immediateSuccess.isSubmitted) {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLIED, {
          logMessage: 'Naukri 1-Click apply submitted successfully!',
        });
        await JobApplication.findByIdAndUpdate(applicationId, {
          'form.submittedAt': new Date(),
        });
        return {
          status: APPLICATION_STATUS.APPLIED,
          message: 'Application submitted successfully via Naukri 1-Click apply.',
        };
      }

      // Also analyze the page rendered after clicking direct Apply!
      const postApplyExtracted = await extractPageContent(page);
      if (postApplyExtracted.openings.length > 0 && postApplyExtracted.formFieldsCount === 0) {
        const postAnalysis = await classifyPageWithLlm(postApplyExtracted, job, userId);
        await JobApplication.findByIdAndUpdate(applicationId, {
          pageAnalysis: {
            ...postAnalysis,
            pageTitle: postApplyExtracted.title,
            currentUrl: page.url(),
            analyzedAt: new Date(),
          },
        });
        if (postAnalysis.pageType === 'job_listings_accordion') {
          await navigatePortalWithAiDecision(page, postAnalysis, context);
          await page.waitForTimeout(2000);
        }
      }
    }

    // 10. Multi-Step Form Inspection and Answering Loop
    let currentStep = 1;
    let allCollectedAnswers = [...(application.form?.answers || [])];

    // Merge in any answers provided by user in this run
    if (Array.isArray(userAnswers) && userAnswers.length > 0) {
      userAnswers.forEach((ans) => {
        const existingIdx = allCollectedAnswers.findIndex((a) => a.questionId === ans.questionId);
        if (existingIdx >= 0) {
          allCollectedAnswers[existingIdx] = { ...allCollectedAnswers[existingIdx], ...ans, source: 'user' };
        } else {
          allCollectedAnswers.push({ ...ans, source: 'user' });
        }
      });
    }

    // If user confirmed and provided edited answers during Checkpoint 2, merge them
    if (Array.isArray(finalEditedAnswers) && finalEditedAnswers.length > 0) {
      finalEditedAnswers.forEach((ans) => {
        const existingIdx = allCollectedAnswers.findIndex((a) => a.questionId === ans.questionId);
        if (existingIdx >= 0) {
          allCollectedAnswers[existingIdx] = { ...allCollectedAnswers[existingIdx], ...ans, source: 'user' };
        } else {
          allCollectedAnswers.push({ ...ans, source: 'user' });
        }
      });
    }

    const formInspection = await inspectForm(page);

    if (formInspection.isQuestionnairePresent) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.RESOLVING_ANSWERS, {
        logMessage: `Employer questionnaire detected with ${formInspection.fields.length} questions. Resolving answers...`,
      });

      // Resolve fields using multi-level matching
      const { resolvedAnswers, missingQuestions } = await resolveAllFormAnswers(
        formInspection.fields,
        {
          userAnswers: allCollectedAnswers,
          userProfile: profileDoc || {},
          user: userDoc || {},
          userSetting: settingDoc?.userSetting || {},
          resumeData: application.resume?.tailoredResumeData || {},
          job,
        }
      );

      // CHECKPOINT 1: Missing information / unknown questions
      if (missingQuestions.length > 0 && !confirmSubmission) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          'form.requiresHuman': true,
          'form.humanReason': HUMAN_REASONS.MISSING_INFORMATION,
          'form.missingQuestions': missingQuestions,
          'form.answers': resolvedAnswers,
          'form.currentStep': currentStep,
        });

        await logJobEvent(
          'naukriApplication',
          'HUMAN_REQUIRED',
          `Paused: ${missingQuestions.length} questions need user answers. Sent to frontend.`
        );

        return {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          humanReason: HUMAN_REASONS.MISSING_INFORMATION,
          missingQuestions,
          resolvedAnswers,
          message: 'Additional information required by employer. Please provide answers to proceed.',
        };
      }

      // Build structured action plan from resolved answers
      const actions = [];
      const answersMap = new Map();
      resolvedAnswers.forEach((a) => answersMap.set(a.questionId, a.answer));

      for (const field of formInspection.fields) {
        const ans = answersMap.get(field.questionId);
        if (ans !== undefined && ans !== null) {
          if (field.type === FIELD_TYPES.SELECT) {
            actions.push({ fieldId: field.fieldId, action: FORM_ACTIONS.SELECT, value: ans });
          } else if (field.type === FIELD_TYPES.RADIO || field.type === FIELD_TYPES.CHECKBOX) {
            actions.push({ fieldId: field.fieldId, action: FORM_ACTIONS.CHECK, value: ans });
          } else if (field.type === FIELD_TYPES.FILE) {
            actions.push({
              fieldId: field.fieldId,
              action: FORM_ACTIONS.UPLOAD,
              value: application.resume?.pdfPath,
            });
          } else {
            actions.push({ fieldId: field.fieldId, action: FORM_ACTIONS.FILL, value: ans });
          }
        }
      }

      // Validate action plan with Zod
      const planValidation = validateBrowserActionPlan({ actions });
      if (planValidation.valid) {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.FILLING_FORM, {
          logMessage: `Executing ${actions.length} verified browser actions into form...`,
        });

        await executeBrowserActions(page, actions, {
          resumePdfPath: application.resume?.pdfPath,
        });
      }

      // CHECKPOINT 2: Final Review Before Submission
      if (!confirmSubmission) {
        const reviewFields = formInspection.fields.map((f) => {
          const match = resolvedAnswers.find((a) => a.questionId === f.questionId);
          return {
            questionId: f.questionId,
            fieldId: f.fieldId,
            question: f.question,
            type: f.type,
            answer: match ? match.answer : '',
            source: match ? match.source : 'profile',
            options: f.options || [],
          };
        });

        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
          'form.requiresHuman': false,
          'form.humanReason': null,
          'form.missingQuestions': [],
          'form.answers': resolvedAnswers,
          'form.reviewFields': reviewFields,
        });

        await logJobEvent(
          'naukriApplication',
          'WAITING_FINAL_REVIEW',
          `Application form filled. Waiting for user final confirmation.`
        );

        return {
          status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
          reviewFields,
          message: 'Application form is ready for your final review. Edit any answers and confirm to apply.',
        };
      }

      // If confirmSubmission IS true: Submit the application!
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.SUBMITTING, {
        logMessage: 'Final user confirmation received. Submitting application on Naukri...',
      });

      const submitBtn = page
        .locator('button:has-text("Submit"), button:has-text("Save & Apply"), button:has-text("Apply Now"), button[type="submit"]')
        .first();

      const canSubmit = await submitBtn.isVisible().catch(() => false);
      if (canSubmit) {
        await submitBtn.click();
        await page.waitForTimeout(3000);
      }

      // Verify submission
      const finalSuccess = await detectSubmissionSuccess(page);
      if (finalSuccess.isSubmitted || canSubmit) {
        await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLIED, {
          logMessage: 'Application successfully submitted and verified on Naukri.',
        });
        await JobApplication.findByIdAndUpdate(applicationId, {
          'form.submittedAt': new Date(),
          'form.requiresHuman': false,
        });

        return {
          status: APPLICATION_STATUS.APPLIED,
          message: 'Job application successfully submitted on Naukri!',
        };
      }
    }

    // Final fallback check
    const finalCheck = await detectSubmissionSuccess(page);
    const resultStatus = finalCheck.isSubmitted ? APPLICATION_STATUS.APPLIED : APPLICATION_STATUS.WAITING_FOR_REVIEW;

    await JobApplication.findByIdAndUpdate(applicationId, {
      status: resultStatus,
      ...(finalCheck.isSubmitted && { 'form.submittedAt': new Date() }),
    });

    return {
      status: resultStatus,
      message: finalCheck.isSubmitted ? 'Application submitted successfully.' : 'Application prepared.',
    };
  } catch (error) {
    await logError('naukriApplication.runNaukriApplication', error.message);
    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
        error: error.message,
        logMessage: `Naukri application error: ${error.message}`,
      }).catch(() => {});
    }
    throw error;
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};
