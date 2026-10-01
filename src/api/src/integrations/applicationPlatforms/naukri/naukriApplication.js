import { BrowserManager } from "../../../browser/browserManager.js";
import { findNaukriAccountByUserId } from "../../../repositories/naukriAccount.repository.js";
import { BrowserSessionRepository } from "../../../repositories/browserSession.repository.js";
import { decryptValue } from "../../../utils/encryption.js";
import { detectNaukriAuthState } from "../../jobSources/naukri/naukriAuthDetector.js";
import {
  detectApplyAction,
  detectSecurityPrompt,
  detectSubmissionSuccess,
} from "./naukriApplicationParser.js";
import { inspectForm } from "../../../application/form/formInspector.js";
import { resolveAllFormAnswers } from "../../../application/answer/answerResolver.js";
import { executeBrowserActions } from "../../../browser/browserActionExecutor.js";
import { fillFormFields } from "../../../application/form/formFiller.js";
import { verifyFilledFields } from "../../../application/form/formVerifier.js";
import { validateBrowserActionPlan } from "../../../browser/browserActionValidator.js";
import {
  APPLICATION_STATUS,
  FORM_ACTIONS,
  HUMAN_REASONS,
} from "../../../constant/application.constant.js";
import { FIELD_TYPES } from "../../../application/form/fieldTypes.js";
import { extractPageContent } from "../../../application/pageAnalysis/pageContentExtractor.js";
import { classifyPageWithLlm } from "../../../application/pageAnalysis/pageClassifierLlm.js";
import { navigatePortalWithAiDecision } from "../../../application/pageAnalysis/pageNavigator.js";
import {
  updateApplicationStatus,
  findApplicationById,
} from "../../../repositories/application.repository.js";
import { JobApplication } from "../../../model/JobApplication.js";
import { UserProfile } from "../../../model/UserProfile.js";
import { Resume } from "../../../model/Resume.js";
import { User } from "../../../model/User.js";
import { Setting } from "../../../model/Setting.js";
import { logJobEvent, logError } from "../../../utils/logger.js";
import { appError } from "../../../utils/errors.js";
import {
  injectGoogleSessionIntoContext,
  detectGoogleAuthState,
  getDecryptedGoogleSession,
} from "../../../services/googleSession.service.js";
import { handleGoogleFormApplication } from "../../../application/methods/googleFormApplicationMethod.js";

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
      throw new appError(
        "applicationId and userId are required to run Naukri application.",
        400,
      );
    }

    await logJobEvent(
      "naukriApplication",
      "START",
      `Starting application process for App: ${applicationId}, Confirm: ${confirmSubmission}`,
    );

    // 1. Fetch Application, Job, User, Profile, Settings
    const application = await findApplicationById(applicationId);
    if (!application) {
      throw new appError(`Application not found: ${applicationId}`, 404);
    }

    const job = application.jobId || {};
    const jobUrl = job.applicationUrl || job.sourceUrl;
    if (!jobUrl) {
      throw new appError("Job application URL is missing.", 400);
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
        await logError("naukriApplication.decrypt", err.message);
      }
    }

    if (!sessionState) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        "form.requiresHuman": true,
        "form.humanReason": HUMAN_REASONS.SESSION_EXPIRED,
      });

      return {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        humanReason: HUMAN_REASONS.SESSION_EXPIRED,
        message:
          "Naukri account session is disconnected or expired. Please connect your Naukri account first.",
      };
    }

    // 3. Launch Playwright context with restored session (combining Naukri & Google sessions)
    const googleSession = await getDecryptedGoogleSession(userId);
    let combinedStorageState = sessionState;
    if (googleSession?.cookies?.length > 0) {
      combinedStorageState = {
        cookies: [
          ...(sessionState?.cookies || []),
          ...(googleSession.cookies || []),
        ],
        origins: [
          ...(sessionState?.origins || []),
          ...(googleSession.origins || []),
        ],
      };
    }

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(browser, {
      storageState: combinedStorageState,
    });

    // Automatically inject authenticated Google session into context as backup
    await injectGoogleSessionIntoContext(context, userId);

    page = await context.newPage();

    // 4. Open Job URL
    await updateApplicationStatus(
      applicationId,
      APPLICATION_STATUS.OPENING_JOB,
      {
        logMessage: `Opening Naukri job URL: ${jobUrl}`,
      },
    );

    await page
      .goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 25000 })
      .catch(async () => {
        await page.evaluate(() => window.stop()).catch(() => {});
      });
    await page.waitForTimeout(2000);

    // 5. Verify Authentication on live page
    const authState = await detectNaukriAuthState(page);
    if (!authState.authenticated) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        "form.requiresHuman": true,
        "form.humanReason": HUMAN_REASONS.SESSION_EXPIRED,
      });

      return {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        humanReason: HUMAN_REASONS.SESSION_EXPIRED,
        message:
          "Your active Naukri session has expired. Please re-authenticate your Naukri account.",
      };
    }

    // 6. Check Security prompts (CAPTCHA / OTP / 2FA)
    const securityCheck = await detectSecurityPrompt(page);
    if (securityCheck.detected) {
      await JobApplication.findByIdAndUpdate(applicationId, {
        status: APPLICATION_STATUS.HUMAN_REQUIRED,
        "form.requiresHuman": true,
        "form.humanReason": securityCheck.reason,
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
        logMessage: "Job was already applied previously on Naukri.",
      });
      await JobApplication.findByIdAndUpdate(applicationId, {
        "form.submittedAt": new Date(),
      });
      return {
        status: APPLICATION_STATUS.APPLIED,
        message: "Job was already applied successfully.",
      };
    }

    // 8. Detect Apply Action & Analyze Page Content
    const applyAction = await detectApplyAction(page);
    let activePage = page;

    if (applyAction.isCompanySite) {
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.ANALYZING_PORTAL,
        {
          logMessage:
            "Employer directs to external career site. Navigating via #company-site-button...",
        },
      );

      const newPagePromise = context
        .waitForEvent("page", { timeout: 6000 })
        .catch(() => null);
      const companySiteBtn = page
        .locator(applyAction.selector || "#company-site-button")
        .first();
      await companySiteBtn.click().catch(() => {});
      const popup = await newPagePromise;
      if (popup) {
        await popup.waitForLoadState("domcontentloaded").catch(() => {});
        activePage = popup;
      }
      await activePage.waitForTimeout(3000);

      // Extract rendered portal content and analyze with Gemini AI
      const extracted = await extractPageContent(activePage);
      const analysis = await classifyPageWithLlm(extracted, job, userId);

      await JobApplication.findByIdAndUpdate(applicationId, {
        applicationMethod: "company_site",
        pageAnalysis: {
          ...analysis,
          pageTitle: extracted.title,
          currentUrl: activePage.url(),
          analyzedAt: new Date(),
        },
      });

      // Execute multi-step autonomous portal loop (handling modals like "Start Your Application", "Autofill with Resume", "Apply Manually", opening cards, and forms)
      for (let loopStep = 0; loopStep < 4; loopStep++) {
        const currentExtracted = await extractPageContent(activePage);
        const currentAnalysis = await classifyPageWithLlm(
          currentExtracted,
          job,
          userId,
        );

        await JobApplication.findByIdAndUpdate(applicationId, {
          applicationMethod: "company_site",
          pageAnalysis: {
            ...currentAnalysis,
            pageTitle: currentExtracted.title,
            currentUrl: activePage.url(),
            analyzedAt: new Date(),
          },
        });

        // Check if pure email instructions or closed form fallback (ONLY if no interactive openings/buttons)
        const hasInteractiveOpenings =
          (currentExtracted.openingsList &&
            currentExtracted.openingsList.length > 0) ||
          (currentExtracted.buttons && currentExtracted.buttons.length > 0);

        const isPureEmailOnly =
          currentAnalysis.pageType === "form_closed" ||
          currentAnalysis.nextRecommendedAction ===
            "form_closed_fallback_email" ||
          (currentAnalysis.pageType === "email_instructions" &&
            !hasInteractiveOpenings);

        if (isPureEmailOnly && currentAnalysis.emailContact?.email) {
          const refId =
            currentAnalysis.emailContact.referenceId ||
            currentAnalysis.matchedRole?.referenceId;
          const subj = refId
            ? `Application: ${job.title} (Ref: ${refId})`
            : `Application: ${job.title}`;

          await JobApplication.findByIdAndUpdate(applicationId, {
            applicationMethod: "email",
            "email.recipient": currentAnalysis.emailContact.email,
            "email.subject": subj,
            "email.body": `Dear Hiring Team,\n\nI am applying for the ${job.title} position${refId ? ` (Reference ID: ${refId})` : ""} at ${job.company}. My tailored ATS resume is attached for your review.\n\nBest regards,\n${userDoc?.fullName || "Applicant"}`,
            status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          });

          return {
            status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
            isCompanySite: true,
            emailContact: currentAnalysis.emailContact,
            message: `Employer specifies email applications with Ref ID ${refId || "N/A"}. Prepared outreach draft.`,
          };
        }

        // Check if application form / modal is reached with input fields
        const isFormReady =
          currentExtracted.formFieldsCount > 0 ||
          currentAnalysis.pageType === "modal_application_form" ||
          currentAnalysis.pageType === "application_form" ||
          currentAnalysis.pageType === "multi_step_wizard" ||
          currentAnalysis.nextRecommendedAction === "fill_form";

        if (isFormReady) {
          await activePage.waitForTimeout(1000);
          const formInspection = await inspectForm(activePage);
          if (formInspection.fields && formInspection.fields.length > 0) {
            const userResumeDoc = await Resume.findOne({ userId })
              .sort({ createdAt: -1 })
              .catch(() => null);
            const candidateResume =
              application.resume?.tailoredResumeData ||
              userResumeDoc?.parsedData ||
              {};
            const userProfile = await UserProfile.findOne({ userId }).catch(
              () => null,
            );

            const { resolvedAnswers, missingQuestions } =
              await resolveAllFormAnswers(formInspection.fields, {
                userAnswers: application.form?.answers || [],
                userProfile: userProfile || {},
                user: {
                  username: userProfile?.fullName,
                  email: userProfile?.email,
                },
                resumeData: candidateResume || {},
                job,
                applicationId,
              });

            await fillFormFields(
              activePage,
              formInspection.fields,
              resolvedAnswers,
              {
                resumePdfPath: application.resume?.pdfPath,
              },
            );
            await verifyFilledFields(activePage, resolvedAnswers);

            const reviewFields = formInspection.fields.map((f) => {
              const match = resolvedAnswers.find(
                (a) => a.questionId === f.questionId || a.fieldId === f.fieldId,
              );
              return {
                questionId: f.questionId,
                fieldId: f.fieldId,
                question: f.question,
                type: f.type,
                answer: match ? match.answer : "",
                source: match ? match.source : "profile",
                options: f.options || [],
                required: Boolean(f.required),
                isTermsAgreement: Boolean(f.isTermsAgreement),
              };
            });

            const currentStorageState =
              await BrowserManager.captureStorageState(context).catch(
                () => null,
              );

            await JobApplication.findByIdAndUpdate(applicationId, {
              status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
              "form.fields": formInspection.fields,
              "form.answers": resolvedAnswers,
              "form.reviewFields": reviewFields,
              "form.missingQuestions": missingQuestions,
              "form.isAccountCreation": Boolean(
                formInspection.isAccountCreation,
              ),
              "workflow.agentState.pendingHumanAction": {
                reason: "Review filled form before final submission",
                savedUrl: activePage.url(),
                savedStorageState:
                  BrowserSessionRepository.encryptStorageState(
                    currentStorageState,
                  ),
              },
            });

            await updateApplicationStatus(
              applicationId,
              APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
              {
                logMessage: `Employer application form loaded with ${formInspection.fields.length} fields. Verified via DOM check. Ready for candidate review.`,
              },
            );

            return {
              status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
              message: `Employer application form filled and verified on ${activePage.url()}. Ready for candidate review.`,
              pageAnalysis: currentAnalysis,
            };
          }
        }

        // Check if candidate auth gateway / account creation is required
        if (
          currentAnalysis.pageType === "ats_account_gateway" ||
          currentExtracted.authGateway?.isAuthRequired
        ) {
          await updateApplicationStatus(
            applicationId,
            APPLICATION_STATUS.WAITING_FOR_REVIEW,
            {
              logMessage: `Employer requires candidate account sign-in on ${activePage.url()}`,
            },
          );
          return {
            status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
            message: `Employer portal requires candidate account creation/login. Direct portal link and tailored profile ready.`,
            pageAnalysis: currentAnalysis,
          };
        }

        // Navigate / Click modal action or apply trigger
        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.APPLYING,
          {
            logMessage: `AI advancing ${currentAnalysis.pageType} (Action: ${currentAnalysis.nextRecommendedAction || "navigate"})...`,
          },
        );

        const navResult = await navigatePortalWithAiDecision(
          activePage,
          currentAnalysis,
          context,
        );
        if (navResult.newPage) {
          activePage = navResult.newPage;
        }
        await activePage.waitForTimeout(2500);

        // Check if popup/redirect tab opened
        if (context) {
          const allPages = context.pages();
          if (allPages.length > 1) {
            const extPage = allPages.find((p) => {
              const u = (p.url() || "").toLowerCase();
              return (
                !u.includes("naukri.com") &&
                !u.includes("about:blank") &&
                u !== activePage.url().toLowerCase()
              );
            });
            if (extPage) {
              activePage = extPage;
              await activePage
                .waitForLoadState("domcontentloaded")
                .catch(() => {});
            }
          }
        }

        if (!navResult.navigated) {
          break;
        }
      }

      // Return final portal state gracefully
      const finalExt = await extractPageContent(activePage);
      const finalAnalysis = await classifyPageWithLlm(finalExt, job, userId);
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.WAITING_FOR_REVIEW,
        {
          logMessage: `Employer portal active: ${finalAnalysis.summary || activePage.url()}`,
        },
      );
      return {
        status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
        message:
          finalAnalysis.summary ||
          "Employer career portal reached. Ready to proceed.",
        pageAnalysis: finalAnalysis,
      };
    } else {
      if (!applyAction.hasApply) {
        // In case apply button has already turned into "Applied" or unavailable
        const successCheck = await detectSubmissionSuccess(page);
        if (successCheck.isSubmitted) {
          await updateApplicationStatus(
            applicationId,
            APPLICATION_STATUS.APPLIED,
            {
              logMessage: "Application confirmed as submitted on Naukri.",
            },
          );
          return {
            status: APPLICATION_STATUS.APPLIED,
            message: "Job application completed successfully.",
          };
        }
      }

      // 9. Click the direct Apply button
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.APPLYING,
        {
          logMessage: "Clicking Naukri Apply button (#apply-button)...",
        },
      );

      const applyLocator = page
        .locator(applyAction.selector || "#apply-button")
        .first();
      await applyLocator
        .waitFor({ state: "visible", timeout: 5000 })
        .catch(() => {});
      await applyLocator.click().catch(() => {});
      await page.waitForTimeout(3000);

      // Check if application was completed directly without questionnaire
      const immediateSuccess = await detectSubmissionSuccess(page);
      if (immediateSuccess.isSubmitted) {
        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.APPLIED,
          {
            logMessage: "Naukri 1-Click apply submitted successfully!",
          },
        );
        await JobApplication.findByIdAndUpdate(applicationId, {
          "form.submittedAt": new Date(),
        });
        return {
          status: APPLICATION_STATUS.APPLIED,
          message:
            "Application submitted successfully via Naukri 1-Click apply.",
        };
      }

      // Also analyze the page rendered after clicking direct Apply!
      const postApplyExtracted = await extractPageContent(page);
      const postApplyOpenings =
        postApplyExtracted.openings || postApplyExtracted.openingsList || [];
      if (
        postApplyOpenings.length > 0 &&
        postApplyExtracted.formFieldsCount === 0
      ) {
        const postAnalysis = await classifyPageWithLlm(
          postApplyExtracted,
          job,
          userId,
        );
        await JobApplication.findByIdAndUpdate(applicationId, {
          pageAnalysis: {
            ...postAnalysis,
            pageTitle: postApplyExtracted.title,
            currentUrl: page.url(),
            analyzedAt: new Date(),
          },
        });
        if (postAnalysis.pageType === "job_listings_accordion") {
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
        const existingIdx = allCollectedAnswers.findIndex(
          (a) => a.questionId === ans.questionId,
        );
        if (existingIdx >= 0) {
          allCollectedAnswers[existingIdx] = {
            ...allCollectedAnswers[existingIdx],
            ...ans,
            source: "user",
          };
        } else {
          allCollectedAnswers.push({ ...ans, source: "user" });
        }
      });
    }

    // If user confirmed and provided edited answers during Checkpoint 2, merge them
    if (Array.isArray(finalEditedAnswers) && finalEditedAnswers.length > 0) {
      finalEditedAnswers.forEach((ans) => {
        const existingIdx = allCollectedAnswers.findIndex(
          (a) => a.questionId === ans.questionId,
        );
        if (existingIdx >= 0) {
          allCollectedAnswers[existingIdx] = {
            ...allCollectedAnswers[existingIdx],
            ...ans,
            source: "user",
          };
        } else {
          allCollectedAnswers.push({ ...ans, source: "user" });
        }
      });
    }

    // Check if activePage or portal redirect leads to a Google Form or Google Auth
    const currentActiveUrl = (activePage.url() || "").toLowerCase();
    const isGoogleFormRedirect =
      currentActiveUrl.includes("docs.google.com/forms") ||
      currentActiveUrl.includes("forms.gle") ||
      (currentActiveUrl.includes("accounts.google.com") &&
        currentActiveUrl.includes("form"));

    if (isGoogleFormRedirect) {
      const formUrl = activePage.url();
      await logJobEvent(
        "naukriApplication",
        "GOOGLE_FORM_DETECTED",
        `Employer portal redirected to Google Form: ${formUrl}`,
      );

      // Check if sign-in is required
      const googleAuth = await detectGoogleAuthState(activePage);
      if (googleAuth.isSignInRequired) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          applicationMethod: "googleForm",
          status: APPLICATION_STATUS.GOOGLE_LOGIN_REQUIRED,
          "form.requiresHuman": true,
          "form.humanReason": "google_login_required",
          googleFormResult: {
            googleFormUrl: formUrl,
            loginRequired: true,
            loginUrl: googleAuth.currentUrl || formUrl,
            submitted: false,
            formClosed: false,
          },
        });

        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.GOOGLE_LOGIN_REQUIRED,
          {
            logMessage:
              "Google Sign-In required to access employer Google Form. Please connect Google session in the modal or sign in.",
          },
        );

        throw new appError(
          "Google Sign-In is required to access the employer application form. Please connect your Google session in the modal or sign in, then retry.",
          401,
        );
      }

      // Close current Naukri browser context before handing off
      await BrowserManager.closeSafely({ page: activePage, context, browser });

      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.GOOGLE_FORM_FILLING,
        {
          logMessage: `Redirected to Google Form: ${formUrl}. Filling with AI engine...`,
        },
      );

      const gfResult = await handleGoogleFormApplication({
        applicationId,
        jobId: job._id,
        userId,
        googleFormUrl: formUrl,
      });

      if (gfResult.submitted) {
        return {
          status: APPLICATION_STATUS.APPLIED,
          message: "Application submitted successfully via Google Form!",
          data: gfResult,
        };
      } else if (gfResult.loginRequired) {
        throw new appError(
          "Google Sign-In is required to access or submit this form.",
          401,
        );
      } else {
        throw new appError(
          gfResult.message || "Google Form could not be submitted.",
          400,
        );
      }
    }

    let formInspection = await inspectForm(activePage);

    // If input fields do not exist or less than 3 exist (< 3):
    // Run multi-step autonomous loop (handling Apply button, modals like "Start Your Application", "Autofill with Resume", "Apply Manually", and forms)
    if (
      !formInspection.isQuestionnairePresent ||
      (formInspection.fields && formInspection.fields.length < 3)
    ) {
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.ANALYZING_PORTAL,
        {
          logMessage: `Analyzing rendered page with AI LLM to advance application...`,
        },
      );

      for (let loopStep = 1; loopStep <= 4; loopStep++) {
        const extracted = await extractPageContent(activePage);
        const analysis = await classifyPageWithLlm(extracted, job, userId);

        await JobApplication.findByIdAndUpdate(applicationId, {
          pageAnalysis: {
            ...analysis,
            pageTitle: extracted.title,
            currentUrl: activePage.url(),
            analyzedAt: new Date(),
          },
        });

        await logJobEvent(
          "naukriApplication",
          "LLM_PAGE_ANALYSIS",
          `Loop step ${loopStep}: Page classified as "${analysis.pageType}". Recommended action: "${analysis.nextRecommendedAction}" - ${analysis.summary}`,
        );

        // Branch 1: Direct Email Instructions with Reference ID or fallback email
        if (
          (analysis.pageType === "email_instructions" ||
            analysis.pageType === "form_closed" ||
            analysis.nextRecommendedAction === "send_email" ||
            analysis.nextRecommendedAction === "form_closed_fallback_email") &&
          analysis.emailContact?.email
        ) {
          const refId =
            analysis.emailContact.referenceId ||
            analysis.matchedRole?.referenceId;
          const subj = refId
            ? `Application: ${job.title} (Ref: ${refId})`
            : `Application: ${job.title}`;

          await JobApplication.findByIdAndUpdate(applicationId, {
            applicationMethod: "email",
            "email.recipient": analysis.emailContact.email,
            "email.subject": subj,
            "email.body": `Dear Hiring Team,\n\nI am applying for the ${job.title} position${refId ? ` (Reference ID: ${refId})` : ""} at ${job.company}. My tailored ATS resume is attached for your review.\n\nBest regards,\n${userDoc?.fullName || "Applicant"}`,
            status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          });

          return {
            status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
            isCompanySite: true,
            emailContact: analysis.emailContact,
            message: `Employer specifies direct email applications${refId ? ` with Ref ID ${refId}` : ""}. Outreach draft prepared for your review.`,
          };
        }

        // Branch 2: Check if active page has questionnaire fields
        formInspection = await inspectForm(activePage);
        if (
          formInspection.isQuestionnairePresent &&
          formInspection.fields &&
          formInspection.fields.length >= 2
        ) {
          await JobApplication.findByIdAndUpdate(applicationId, {
            "form.fields": formInspection.fields,
          });
          break; // proceed to questionnaire answering
        }

        // Branch 3: Advance portal navigation (Click Apply, Modal "Autofill with Resume" / "Apply Manually", Stepper "Next")
        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.APPLYING,
          {
            logMessage: `AI advancing ${analysis.pageType} (Action: ${analysis.nextRecommendedAction || "click_button"})...`,
          },
        );

        const navResult = await navigatePortalWithAiDecision(
          activePage,
          analysis,
          context,
        );
        if (navResult.newPage) {
          activePage = navResult.newPage;
        }
        await activePage.waitForTimeout(2500);

        // Check if navigation opened a new tab/popup
        if (context) {
          const allPages = context.pages();
          if (allPages.length > 1) {
            const externalOrGooglePage = allPages.find((p) => {
              const u = (p.url() || "").toLowerCase();
              return (
                !u.includes("naukri.com") &&
                !u.includes("about:blank") &&
                u !== activePage.url().toLowerCase()
              );
            });
            if (externalOrGooglePage) {
              activePage = externalOrGooglePage;
              await activePage
                .waitForLoadState("domcontentloaded")
                .catch(() => {});
            }
          }
        }

        if (!navResult.navigated) {
          break;
        }
      }

      // Re-inspect form after the navigation loop
      formInspection = await inspectForm(activePage);

      // If still no questionnaire fields on the final page, return the analyzed portal state gracefully (never throw 400)
      if (
        !formInspection.isQuestionnairePresent ||
        !formInspection.fields ||
        formInspection.fields.length === 0
      ) {
        const finalExtracted = await extractPageContent(activePage);
        const finalAnalysis = await classifyPageWithLlm(
          finalExtracted,
          job,
          userId,
        );

        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.WAITING_FOR_REVIEW,
          {
            logMessage: `Employer portal active: ${finalAnalysis.summary || activePage.url()}`,
          },
        );

        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          pageAnalysis: {
            ...finalAnalysis,
            pageTitle: finalExtracted.title,
            currentUrl: activePage.url(),
            analyzedAt: new Date(),
          },
        });

        return {
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          message:
            finalAnalysis.summary ||
            "Employer career portal reached. Ready to proceed.",
          pageAnalysis: finalAnalysis,
        };
      }
    }

    if (formInspection.isQuestionnairePresent) {
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.RESOLVING_ANSWERS,
        {
          logMessage: `Employer questionnaire detected with ${formInspection.fields.length} questions. Resolving answers...`,
        },
      );

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
        },
      );

      // CHECKPOINT 1: Missing information / unknown questions
      if (
        missingQuestions.length > 0 &&
        (!Array.isArray(finalEditedAnswers) || finalEditedAnswers.length === 0)
      ) {
        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          "form.requiresHuman": true,
          "form.humanReason": HUMAN_REASONS.MISSING_INFORMATION,
          "form.missingQuestions": missingQuestions,
          "form.answers": resolvedAnswers,
          "form.currentStep": currentStep,
        });

        await logJobEvent(
          "naukriApplication",
          "HUMAN_REQUIRED",
          `Paused: ${missingQuestions.length} questions need user answers. Sent to frontend.`,
        );

        return {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          humanReason: HUMAN_REASONS.MISSING_INFORMATION,
          missingQuestions,
          resolvedAnswers,
          message:
            "Additional information required by employer. Please provide answers to proceed.",
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
            actions.push({
              fieldId: field.fieldId,
              action: FORM_ACTIONS.SELECT,
              value: ans,
            });
          } else if (
            field.type === FIELD_TYPES.RADIO ||
            field.type === FIELD_TYPES.CHECKBOX
          ) {
            actions.push({
              fieldId: field.fieldId,
              action: FORM_ACTIONS.CHECK,
              value: ans,
            });
          } else if (field.type === FIELD_TYPES.FILE) {
            actions.push({
              fieldId: field.fieldId,
              action: FORM_ACTIONS.UPLOAD,
              value: application.resume?.pdfPath,
            });
          } else {
            actions.push({
              fieldId: field.fieldId,
              action: FORM_ACTIONS.FILL,
              value: ans,
            });
          }
        }
      }

      // Validate action plan with Zod
      const planValidation = validateBrowserActionPlan({ actions });
      if (planValidation.valid) {
        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.FILLING_FORM,
          {
            logMessage: `Executing ${actions.length} verified browser actions into form...`,
          },
        );

        await executeBrowserActions(activePage, actions, {
          resumePdfPath: application.resume?.pdfPath,
        });

        // Verify ALL fields filled via DOM check (NO LLM)
        const verification = await verifyFilledFields(
          activePage,
          resolvedAnswers,
        );
        await logJobEvent(
          "naukriApplication",
          "DOM_VERIFIED",
          `Verification: ${verification.filledCount}/${formInspection.fields.length} fields filled via DOM check (zero LLM calls). Empty: ${verification.emptyFields.length}`,
        );
      }

      // CHECKPOINT 2: Final Review Before Submission
      // If user has not yet reviewed/confirmed these specific fields in the frontend modal, pause and send to user
      const userHasConfirmedForm =
        Array.isArray(finalEditedAnswers) &&
        finalEditedAnswers.length > 0 &&
        finalEditedAnswers.some((a) =>
          formInspection.fields.some(
            (f) => f.questionId === a.questionId || f.fieldId === a.fieldId,
          ),
        );

      if (!userHasConfirmedForm) {
        const reviewFields = formInspection.fields.map((f) => {
          const match = resolvedAnswers.find(
            (a) => a.questionId === f.questionId || a.fieldId === f.fieldId,
          );
          return {
            questionId: f.questionId,
            fieldId: f.fieldId,
            question: f.question,
            type: f.type,
            answer: match ? match.answer : "",
            source: match ? match.source : "profile",
            options: f.options || [],
            required: Boolean(f.required),
            isTermsAgreement: Boolean(f.isTermsAgreement),
          };
        });

        const storageState = await BrowserManager.captureStorageState(
          context,
        ).catch(() => null);

        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
          "form.requiresHuman": false,
          "form.humanReason": null,
          "form.missingQuestions": [],
          "form.answers": resolvedAnswers,
          "form.reviewFields": reviewFields,
          "form.fields": formInspection.fields,
          "form.currentStep": formInspection.stepperState?.currentStep || 1,
          "form.totalSteps": formInspection.stepperState?.totalSteps || 1,
          "form.isAccountCreation": Boolean(formInspection.isAccountCreation),
          "form.portalUrl": activePage.url(),
          "workflow.agentState.pendingHumanAction": {
            reason: formInspection.isAccountCreation
              ? "Review candidate account credentials and submit"
              : "Review filled application form before submission",
            savedUrl: activePage.url(),
            savedStorageState:
              BrowserSessionRepository.encryptStorageState(storageState),
          },
        });

        await logJobEvent(
          "naukriApplication",
          "WAITING_FINAL_REVIEW",
          `Application form filled and verified via DOM check. Sent to frontend for candidate verification.`,
        );

        return {
          status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
          reviewFields,
          message:
            "Application form is ready for your final review. Edit any answers and confirm to apply.",
        };
      }

      // If confirmSubmission IS true: Submit or progress the application!
      await updateApplicationStatus(
        applicationId,
        APPLICATION_STATUS.SUBMITTING,
        {
          logMessage:
            "Final user confirmation received. Advancing application on portal...",
        },
      );

      const submitBtn = activePage
        .locator(
          'button:has-text("Create Account"), [data-automation-id="createAccountSubmitButton"], button:has-text("Sign In"), [data-automation-id="signInSubmitButton"], button:has-text("Next"), button:has-text("Continue"), [data-automation-id="bottom-navigation-next-button"], button:has-text("Submit"), button:has-text("Save & Apply"), button:has-text("Apply Now"), button:has-text("Apply on company site"), #company-site-button, button[type="submit"]',
        )
        .first();

      const canSubmit = await submitBtn.isVisible().catch(() => false);
      if (canSubmit) {
        await submitBtn.click().catch(() => {});
        await activePage.waitForTimeout(3000);
      }

      // Check if clicking submit opened an external company site, forwarder, or popup
      if (context) {
        // Give popup/redirect up to 5 seconds to initiate
        await activePage.waitForTimeout(2000);
        const allPages = context.pages();
        if (allPages.length > 1) {
          const externalOrGooglePage = allPages.find((p) => {
            const u = (p.url() || "").toLowerCase();
            return (
              u.includes("docs.google.com/forms") ||
              u.includes("forms.gle") ||
              u.includes("accounts.google.com") ||
              (!u.includes("naukri.com") &&
                !u.includes("about:blank") &&
                u !== activePage.url().toLowerCase())
            );
          });
          if (externalOrGooglePage) {
            activePage = externalOrGooglePage;
            await activePage
              .waitForLoadState("domcontentloaded")
              .catch(() => {});
          }
        }
      }

      // Handle intermediate forwarders (e.g. naukri.com/myapply/showAcp)
      let currentUrlAfterSubmit = (activePage.url() || "").toLowerCase();
      if (
        currentUrlAfterSubmit.includes("showacp") ||
        currentUrlAfterSubmit.includes("myapply")
      ) {
        await logJobEvent(
          "naukriApplication",
          "FORWARDER_DETECTED",
          `Intermediate forwarder URL: ${activePage.url()}`,
        );
        await activePage.waitForTimeout(3000);

        // Check if a new tab was created during forwarder wait
        if (context) {
          const pagesNow = context.pages();
          const extPage = pagesNow.find((p) => {
            const u = (p.url() || "").toLowerCase();
            return !u.includes("naukri.com") && !u.includes("about:blank");
          });
          if (extPage) {
            activePage = extPage;
            await activePage
              .waitForLoadState("domcontentloaded")
              .catch(() => {});
          }
        }

        currentUrlAfterSubmit = (activePage.url() || "").toLowerCase();
        // If still on showAcp, check for any redirect links inside the page
        if (currentUrlAfterSubmit.includes("showacp")) {
          const destUrl = await activePage
            .evaluate(() => {
              const link = document.querySelector(
                'a[href*="http"]:not([href*="naukri.com"])',
              );
              if (link) return link.href;
              const iframe = document.querySelector(
                'iframe[src*="http"]:not([src*="naukri.com"])',
              );
              if (iframe) return iframe.src;
              return null;
            })
            .catch(() => null);

          if (destUrl) {
            await activePage
              .goto(destUrl, { waitUntil: "domcontentloaded", timeout: 15000 })
              .catch(() => {});
            await activePage.waitForTimeout(3000);
            currentUrlAfterSubmit = (activePage.url() || "").toLowerCase();
          }
        }
      }

      // If activePage has navigated to an external company site or Google Form
      const isExternalAfterSubmit =
        currentUrlAfterSubmit.includes("docs.google.com/forms") ||
        currentUrlAfterSubmit.includes("forms.gle") ||
        currentUrlAfterSubmit.includes("accounts.google.com") ||
        (!currentUrlAfterSubmit.includes("naukri.com") &&
          !currentUrlAfterSubmit.includes("about:blank"));

      if (isExternalAfterSubmit) {
        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.ANALYZING_PORTAL,
          {
            logMessage: `Redirected to company site: ${activePage.url()}. Analyzing with Gemini AI...`,
          },
        );

        // If it's a Google Form
        if (
          currentUrlAfterSubmit.includes("docs.google.com/forms") ||
          currentUrlAfterSubmit.includes("forms.gle") ||
          currentUrlAfterSubmit.includes("accounts.google.com")
        ) {
          const googleAuth = await detectGoogleAuthState(activePage);
          if (googleAuth.isSignInRequired) {
            await JobApplication.findByIdAndUpdate(applicationId, {
              applicationMethod: "googleForm",
              status: APPLICATION_STATUS.GOOGLE_LOGIN_REQUIRED,
              "form.requiresHuman": true,
              "form.humanReason": "google_login_required",
            });
            throw new appError(
              "Google Sign-In is required to access the employer application form.",
              401,
            );
          }

          const gfResult = await handleGoogleFormApplication({
            applicationId,
            jobId: job._id,
            userId,
            googleFormUrl: activePage.url(),
          });

          return {
            status: gfResult.submitted
              ? APPLICATION_STATUS.APPLIED
              : APPLICATION_STATUS.WAITING_FOR_REVIEW,
            message: gfResult.message,
            data: gfResult,
          };
        }

        // Run multi-step autonomous loop on the external company site / Workday
        for (let loopStep = 0; loopStep < 6; loopStep++) {
          await activePage.waitForLoadState("domcontentloaded").catch(() => {});

          // Check if submission already succeeded
          const checkSuccess = await detectSubmissionSuccess(activePage);
          if (checkSuccess.isSubmitted) {
            await updateApplicationStatus(
              applicationId,
              APPLICATION_STATUS.APPLIED,
              {
                logMessage:
                  "Application successfully submitted and confirmed on employer portal!",
              },
            );
            await JobApplication.findByIdAndUpdate(applicationId, {
              status: APPLICATION_STATUS.APPLIED,
              "form.submittedAt": new Date(),
            });
            return {
              status: APPLICATION_STATUS.APPLIED,
              message: "Application successfully submitted on employer portal!",
            };
          }

          // 1. inspectForm() ONCE to get ALL fields on current page
          const stepInspection = await inspectForm(activePage);

          // If form fields exist (Account Creation, Resume Upload, Questionnaire, or Application Form):
          if (
            stepInspection.isQuestionnairePresent &&
            stepInspection.fields &&
            stepInspection.fields.length > 0
          ) {
            await logJobEvent(
              "naukriApplication",
              "PORTAL_FORM_STEP",
              `Loop step ${loopStep}: ${stepInspection.fields.length} fields detected (AccountCreation: ${stepInspection.isAccountCreation}, Stepper: ${stepInspection.stepperState?.hasStepper ? `Step ${stepInspection.stepperState.currentStep}/${stepInspection.stepperState.totalSteps}` : "none"})`,
            );

            // 2. Resolve ALL answers: deterministic profile + resume + password/terms + ONE batch LLM call for subjective
            const { resolvedAnswers } = await resolveAllFormAnswers(
              stepInspection.fields,
              {
                userAnswers: allCollectedAnswers,
                userProfile: profileDoc || {},
                user: userDoc || {},
                userSetting: settingDoc?.userSetting || {},
                resumeData: application.resume?.tailoredResumeData || {},
                job,
              },
            );

            // 3. Batch fill ALL fields via Playwright
            await fillFormFields(
              activePage,
              stepInspection.fields,
              resolvedAnswers,
              {
                resumePdfPath: application.resume?.pdfPath,
              },
            );

            // 4. Verify ALL fields filled via DOM check (NO LLM)
            const verification = await verifyFilledFields(
              activePage,
              resolvedAnswers,
            );
            await logJobEvent(
              "naukriApplication",
              "DOM_VERIFIED",
              `Step ${loopStep} DOM check: ${verification.filledCount}/${stepInspection.fields.length} fields filled (Zero LLM).`,
            );

            // 5. If a file upload input exists on this step, attach the tailored resume PDF!
            const fileInput = activePage.locator('input[type="file"]').first();
            const hasFileInput = await fileInput
              .isVisible({ timeout: 1500 })
              .catch(() => false);
            if (hasFileInput && application.resume?.pdfPath) {
              await fileInput
                .setInputFiles(application.resume.pdfPath)
                .catch(() => {});
              await logJobEvent(
                "naukriApplication",
                "RESUME_ATTACHED",
                "Tailored resume attached to portal file input",
              );
              await activePage.waitForTimeout(2000);
            }

            // Check if user has confirmed this specific step from frontend
            const userHasConfirmedStep =
              Array.isArray(finalEditedAnswers) &&
              finalEditedAnswers.length > 0 &&
              finalEditedAnswers.some((a) =>
                stepInspection.fields.some(
                  (f) =>
                    f.questionId === a.questionId || f.fieldId === a.fieldId,
                ),
              );

            if (!userHasConfirmedStep) {
              const stepReviewFields = stepInspection.fields.map((f) => {
                const match = resolvedAnswers.find(
                  (a) =>
                    a.questionId === f.questionId || a.fieldId === f.fieldId,
                );
                return {
                  questionId: f.questionId,
                  fieldId: f.fieldId,
                  question: f.question,
                  type: f.type,
                  answer: match ? match.answer : "",
                  source: match ? match.source : "profile",
                  options: f.options || [],
                  required: Boolean(f.required),
                  isTermsAgreement: Boolean(f.isTermsAgreement),
                };
              });

              const storageState = await BrowserManager.captureStorageState(
                context,
              ).catch(() => null);

              await JobApplication.findByIdAndUpdate(applicationId, {
                status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
                "form.fields": stepInspection.fields,
                "form.answers": resolvedAnswers,
                "form.reviewFields": stepReviewFields,
                "form.missingQuestions": [],
                "form.currentStep":
                  stepInspection.stepperState?.currentStep || loopStep + 1,
                "form.totalSteps": stepInspection.stepperState?.totalSteps || 2,
                "form.isAccountCreation": Boolean(
                  stepInspection.isAccountCreation,
                ),
                "form.portalUrl": activePage.url(),
                "workflow.agentState.pendingHumanAction": {
                  reason: stepInspection.isAccountCreation
                    ? "Review candidate account credentials and submit"
                    : `Review filled fields for step ${stepInspection.stepperState?.currentStep || loopStep + 1}`,
                  savedUrl: activePage.url(),
                  savedStorageState:
                    BrowserSessionRepository.encryptStorageState(storageState),
                },
              });

              await updateApplicationStatus(
                applicationId,
                APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
                {
                  logMessage: stepInspection.isAccountCreation
                    ? "Candidate account creation form filled and verified. Sent to frontend for review."
                    : `Step ${stepInspection.stepperState?.currentStep || loopStep + 1} filled and verified via DOM check. Sent to frontend for review.`,
                },
              );

              await logJobEvent(
                "naukriApplication",
                "STEP_FILLED_AWAITING_REVIEW",
                `Step ${stepInspection.stepperState?.currentStep || loopStep + 1}: ${stepReviewFields.length} fields filled and verified via DOM check. Sent to frontend for candidate verification.`,
              );

              return {
                status: APPLICATION_STATUS.WAITING_FOR_FINAL_REVIEW,
                reviewFields: stepReviewFields,
                message: stepInspection.isAccountCreation
                  ? "Candidate account creation form ready for your review. Confirm to proceed."
                  : `Application step ${stepInspection.stepperState?.currentStep || loopStep + 1} ready for your review. Confirm to proceed.`,
              };
            }

            // 6. User confirmed! Click progression button (Create Account -> Next/Continue -> Submit)
            const stepButtons = stepInspection.buttons || [];
            const createAccBtn =
              stepButtons.find((b) => b.type === "create_account") ||
              (stepInspection.isAccountCreation
                ? {
                    selector:
                      'button:has-text("Create Account"), [data-automation-id="createAccountSubmitButton"]',
                    text: "Create Account",
                  }
                : null);
            const nextBtn = stepButtons.find((b) => b.type === "next") || {
              selector:
                'button:has-text("Next"), button:has-text("Continue"), button:has-text("Save & Continue"), [data-automation-id="bottom-navigation-next-button"]',
              text: "Next",
            };
            const submitBtn = stepButtons.find((b) => b.type === "submit");

            const targetBtn = createAccBtn || nextBtn || submitBtn;

            if (targetBtn) {
              await logJobEvent(
                "naukriApplication",
                "PORTAL_CLICK_ACTION",
                `Clicking ${targetBtn.text || "action"}...`,
              );
              const btnLocator = activePage
                .locator(
                  targetBtn.selector || `button:has-text("${targetBtn.text}")`,
                )
                .first();
              const canClick = await btnLocator.isVisible().catch(() => false);
              if (canClick) {
                await btnLocator.click({ timeout: 5000 }).catch(async () => {
                  await btnLocator.click({ force: true, timeout: 3000 });
                });
                await activePage
                  .waitForLoadState("domcontentloaded")
                  .catch(() => {});
                await activePage.waitForTimeout(3000);
                // Clear confirmed answers for the subsequent step
                finalEditedAnswers = [];
                continue; // Advance loop to next step!
              }
            }
          }

          // If no form fields, inspect page content and navigate modals/apply buttons
          const extractedExt = await extractPageContent(activePage);
          const analysisExt = await classifyPageWithLlm(
            extractedExt,
            job,
            userId,
          );

          await JobApplication.findByIdAndUpdate(applicationId, {
            applicationMethod: "company_site",
            pageAnalysis: {
              ...analysisExt,
              pageTitle: extractedExt.title,
              currentUrl: activePage.url(),
              analyzedAt: new Date(),
            },
          });

          // Check if email instructions detected
          if (
            (analysisExt.pageType === "email_instructions" ||
              analysisExt.pageType === "form_closed" ||
              analysisExt.nextRecommendedAction === "send_email" ||
              analysisExt.nextRecommendedAction ===
                "form_closed_fallback_email") &&
            analysisExt.emailContact?.email
          ) {
            const refId =
              analysisExt.emailContact.referenceId ||
              analysisExt.matchedRole?.referenceId;
            await JobApplication.findByIdAndUpdate(applicationId, {
              applicationMethod: "email",
              "email.recipient": analysisExt.emailContact.email,
              "email.subject": `Application: ${job.title}${refId ? ` (Ref: ${refId})` : ""}`,
              "email.body": `Dear Hiring Team,\n\nI am applying for the ${job.title} position at ${job.company}.${refId ? ` (Reference ID: ${refId})` : ""}\n\nBest regards,\n${userDoc?.fullName || "Applicant"}`,
              status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
            });
            return {
              status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
              message: `Employer specifies direct email application. Draft ready for review.`,
              pageAnalysis: analysisExt,
            };
          }

          // Modal "Autofill with Resume" / "Apply Manually"
          const autofillResumeBtn = activePage
            .locator(
              '[data-automation-id="autofill-with-resume"], button:has-text("Autofill with Resume")',
            )
            .first();
          if (await autofillResumeBtn.isVisible().catch(() => false)) {
            await logJobEvent(
              "naukriApplication",
              "CLICK_AUTOFILL_RESUME",
              'Clicking "Autofill with Resume" modal option',
            );
            await autofillResumeBtn.click().catch(() => {});
            await activePage
              .waitForLoadState("domcontentloaded")
              .catch(() => {});
            await activePage.waitForTimeout(2500);
            continue;
          }

          // Job details "Apply" button
          const applyBtn = activePage
            .locator(
              '[data-automation-id="apply-button"], button:has-text("Apply"), a:has-text("Apply")',
            )
            .first();
          if (await applyBtn.isVisible().catch(() => false)) {
            await logJobEvent(
              "naukriApplication",
              "CLICK_APPLY_BTN",
              "Clicking Apply button on portal",
            );
            await applyBtn.click().catch(() => {});
            await activePage
              .waitForLoadState("domcontentloaded")
              .catch(() => {});
            await activePage.waitForTimeout(2500);
            continue;
          }

          // If navigation needed via pageNavigator
          const navResult = await navigatePortalWithAiDecision(
            activePage,
            analysisExt,
            context,
          );
          if (navResult.newPage) {
            activePage = navResult.newPage;
          }
          await activePage.waitForTimeout(2500);

          if (!navResult.navigated) {
            break;
          }
        }

        // Return gracefully with the final analyzed company portal state
        const finalExtAfterLoop = await extractPageContent(activePage);
        const finalAnalysisAfterLoop = await classifyPageWithLlm(
          finalExtAfterLoop,
          job,
          userId,
        );
        const finalInspectionAfterLoop = await inspectForm(activePage);

        await JobApplication.findByIdAndUpdate(applicationId, {
          "form.fields": finalInspectionAfterLoop.fields || [],
          pageAnalysis: {
            ...finalAnalysisAfterLoop,
            pageTitle: finalExtAfterLoop.title,
            currentUrl: activePage.url(),
            analyzedAt: new Date(),
          },
        });

        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.WAITING_FOR_REVIEW,
          {
            logMessage: `Employer portal active: ${finalAnalysisAfterLoop.summary || activePage.url()}`,
          },
        );
        return {
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          message:
            finalAnalysisAfterLoop.summary ||
            "Employer career portal reached. Ready to proceed.",
          pageAnalysis: finalAnalysisAfterLoop,
        };
      }

      // Verify submission
      const finalSuccess = await detectSubmissionSuccess(activePage);
      if (finalSuccess.isSubmitted) {
        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.APPLIED,
          {
            logMessage:
              "Application successfully submitted and verified on portal.",
          },
        );
        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.APPLIED,
          "form.submittedAt": new Date(),
          "form.requiresHuman": false,
        });

        return {
          status: APPLICATION_STATUS.APPLIED,
          message: "Job application successfully submitted!",
        };
      } else {
        // Run AI page inspection to see if it was submitted or needs human review
        const postSubmitExtracted = await extractPageContent(activePage);
        const postSubmitAnalysis = await classifyPageWithLlm(
          postSubmitExtracted,
          job,
          userId,
        );

        if (postSubmitAnalysis.pageType === "already_applied") {
          await updateApplicationStatus(
            applicationId,
            APPLICATION_STATUS.APPLIED,
            {
              logMessage: "AI verified application was submitted successfully.",
            },
          );
          await JobApplication.findByIdAndUpdate(applicationId, {
            status: APPLICATION_STATUS.APPLIED,
            "form.submittedAt": new Date(),
          });
          return {
            status: APPLICATION_STATUS.APPLIED,
            message: "Job application confirmed as applied.",
          };
        }

        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.HUMAN_REQUIRED,
          {
            logMessage: `Submit clicked. Status: ${postSubmitAnalysis.summary || "Confirmation pending portal response"}`,
          },
        );
        await JobApplication.findByIdAndUpdate(applicationId, {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          "form.requiresHuman": true,
          "form.humanReason": "verification_pending",
          "form.humanMessage":
            postSubmitAnalysis.summary ||
            "Please verify submission on employer site or review responses.",
        });

        return {
          status: APPLICATION_STATUS.HUMAN_REQUIRED,
          message:
            postSubmitAnalysis.summary ||
            "Application submitted. Please review or confirm on employer portal.",
        };
      }
    }

    // Final fallback check
    const finalCheck = await detectSubmissionSuccess(activePage);
    if (finalCheck.isSubmitted) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.APPLIED, {
        logMessage: "Application confirmed as submitted on portal.",
      });
      await JobApplication.findByIdAndUpdate(applicationId, {
        status: APPLICATION_STATUS.APPLIED,
        "form.submittedAt": new Date(),
        "form.requiresHuman": false,
      });

      return {
        status: APPLICATION_STATUS.APPLIED,
        message: "Application submitted successfully.",
      };
    }

    // If confirmSubmission was requested, but submission did not succeed, DO NOT mark as applied!
    if (confirmSubmission) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
        logMessage:
          "Application confirmation requested, but submission could not be completed on portal.",
      });
      throw new appError(
        "Application could not be completed on employer portal. Please review and apply directly.",
        400,
      );
    }

    await JobApplication.findByIdAndUpdate(applicationId, {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
    });

    return {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      message: "Application prepared. Waiting for user review.",
    };
  } catch (error) {
    await logError("naukriApplication.runNaukriApplication", error.message);
    if (applicationId) {
      const currentApp = await findApplicationById(applicationId).catch(
        () => null,
      );
      if (
        currentApp?.status !== APPLICATION_STATUS.GOOGLE_LOGIN_REQUIRED &&
        currentApp?.status !== APPLICATION_STATUS.HUMAN_REQUIRED
      ) {
        await updateApplicationStatus(
          applicationId,
          APPLICATION_STATUS.FAILED,
          {
            error: error.message,
            logMessage: `Naukri application error: ${error.message}`,
          },
        ).catch(() => {});
      }
    }
    throw error;
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};
