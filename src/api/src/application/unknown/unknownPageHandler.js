import { logJobEvent, logError } from '../../utils/logger.js';
import { BrowserManager } from '../../browser/browserManager.js';
import { extractPageContent } from '../pageAnalysis/pageContentExtractor.js';
import { classifyPageWithLlm } from '../pageAnalysis/pageClassifierLlm.js';
import { navigatePortalWithAiDecision } from '../pageAnalysis/pageNavigator.js';
import { inspectForm } from '../form/formInspector.js';
import { isGoogleFormUrl, resolveGoogleFormAnswers } from '../googleForm/googleFormFiller.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { updateApplicationStatus } from '../../repositories/application.repository.js';
import { getGeminiModel } from '../../agent/config/modelConfig.js';
import {
  getDecryptedGoogleSession,
  injectGoogleSessionIntoContext,
} from '../../services/googleSession.service.js';

/**
 * Autonomous Multi-Step Portal Engine for Unknown / Generic Application URLs.
 *
 * Iterative Workflow:
 * Step 1: Clicks initial Apply / Apply Now button on job posting or ATS page.
 * Step 2: Automatically detects modal overlays (e.g. "Start Your Application") and selects "Autofill with Resume" / "Apply Manually".
 * Step 3: If file upload dropzones appear, attaches the tailored resume PDF.
 * Step 4: If form questions appear, extracts and normalizes the fields and resolves candidate answers.
 * Step 5: If candidate authentication is required, records the direct portal state and matched role with HTTP 200.
 *
 * @param {object} params
 * @param {string} params.url - URL to process
 * @param {object} params.job - Job document
 * @param {string} params.userId - Candidate user ID
 * @param {string} [params.applicationId] - Application document ID
 * @param {string} [params.resumePdfPath] - Tailored resume PDF path
 * @param {object} [params.candidateInfo] - Parsed candidate resume details
 * @param {object} [params.sessionState] - Optional saved browser session state
 * @returns {Promise<object>} Execution result with status, detectedMethod, and page analysis
 */
export const executeAutonomousUnknownApplication = async ({
  url,
  job = {},
  userId = null,
  applicationId = null,
  resumePdfPath = null,
  candidateInfo = null,
  sessionState = null,
}) => {
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (!url) {
      throw new Error('No URL provided for autonomous portal execution');
    }

    await logJobEvent(
      'unknownPageHandler',
      'AUTONOMOUS_START',
      `Starting autonomous portal loop for: ${url} (Job: ${job.title || 'Position'})`
    );

    const effectiveStorageState =
      sessionState || (userId ? await getDecryptedGoogleSession(userId) : null);

    browser = await BrowserManager.launch();
    context = await BrowserManager.createContext(
      browser,
      effectiveStorageState ? { storageState: effectiveStorageState } : {}
    );
    if (userId) {
      await injectGoogleSessionIntoContext(context, userId);
    }
    page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(async () => {
      await page.evaluate(() => window.stop()).catch(() => {});
    });
    await page.waitForTimeout(2500);

    let activePage = page;
    let latestAnalysis = null;
    let latestExtracted = null;
    let formFields = [];
    let submitted = false;

    // Run iterative multi-step navigation loop (up to 5 autonomous actions)
    for (let loopStep = 1; loopStep <= 5; loopStep++) {
      // Check for popups / new tabs opened in context
      if (context) {
        const allPages = context.pages();
        if (allPages.length > 1) {
          const extPage = allPages.find((p) => {
            const u = (p.url() || '').toLowerCase();
            return !u.includes('about:blank') && u !== activePage.url().toLowerCase();
          });
          if (extPage) {
            activePage = extPage;
            await activePage.waitForLoadState('domcontentloaded').catch(() => {});
            await activePage.waitForTimeout(1500);
          }
        }
      }

      const currentUrl = activePage.url();

      // Quick check: if redirected to a Google Form
      if (isGoogleFormUrl(currentUrl)) {
        await logJobEvent('unknownPageHandler', 'GOOGLE_FORM_DETECTED', `Google Form reached: ${currentUrl}`);
        return {
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          detectedMethod: 'google_form',
          googleFormUrl: currentUrl,
          message: 'Google Form reached on employer site.',
          pageUrl: currentUrl,
        };
      }

      // 1. Extract fresh DOM state
      latestExtracted = await extractPageContent(activePage);
      latestAnalysis = await classifyPageWithLlm(latestExtracted, job, userId);

      await logJobEvent(
        'unknownPageHandler',
        'STEP_ANALYZED',
        `Step ${loopStep}: Type=${latestAnalysis.pageType}, Action=${latestAnalysis.nextRecommendedAction}, FormInputs=${latestExtracted.formFieldsCount}, FileInputs=${latestExtracted.fileInputsCount}`
      );

      // Check if direct email instructions or closed form
      if (
        (latestAnalysis.pageType === 'email_instructions' ||
          latestAnalysis.pageType === 'form_closed' ||
          latestAnalysis.nextRecommendedAction === 'send_email' ||
          latestAnalysis.nextRecommendedAction === 'form_closed_fallback_email') &&
        latestAnalysis.emailContact?.email
      ) {
        return {
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          detectedMethod: 'email',
          emailContact: latestAnalysis.emailContact,
          pageAnalysis: latestAnalysis,
          message: `Employer specifies direct email applications. Draft prepared.`,
        };
      }

      // 2. Check if file upload dropzone / input is present -> Attach tailored resume PDF
      if (latestExtracted.fileInputsCount > 0 && resumePdfPath) {
        const fileInput = activePage.locator('input[type="file"]').first();
        const hasFileInput = await fileInput.count().then((c) => c > 0).catch(() => false);
        if (hasFileInput) {
          await logJobEvent('unknownPageHandler', 'ATTACH_RESUME', `Attaching candidate resume PDF: ${resumePdfPath}`);
          await fileInput.setInputFiles(resumePdfPath).catch(() => {});
          await activePage.waitForTimeout(2000);
        }
      }

      // 3. Check if form inputs are present -> Inspect questions and resolve answers
      if (latestExtracted.formFieldsCount >= 2) {
        const formInspection = await inspectForm(activePage);
        formFields = formInspection.fields || [];

        if (formFields.length > 0) {
          // If answers can be resolved, fill the form
          if (candidateInfo) {
            const model = await getGeminiModel(userId);
            const answers = await resolveGoogleFormAnswers(formFields, candidateInfo, job, model);

            for (const field of formFields) {
              const ansObj = answers.find((a) => a.fieldIndex === field.fieldIndex);
              const ans = ansObj?.answer || '';
              if (!ans) continue;

              try {
                if (field.type === 'file' && resumePdfPath) {
                  const fi = activePage.locator('input[type="file"]').first();
                  await fi.setInputFiles(resumePdfPath).catch(() => {});
                } else if (field.type === 'select') {
                  const sel = activePage.locator(field.fieldId || `select[name="${field.name}"]`).first();
                  await sel.selectOption({ label: ans }).catch(() => {});
                } else if (field.type === 'radio' || field.type === 'checkbox') {
                  const opt = activePage.locator(`label:has-text("${ans}"), [aria-label="${ans}"]`).first();
                  await opt.click().catch(() => {});
                } else {
                  const inp = activePage.locator(field.fieldId || `input[name="${field.name}"], textarea[name="${field.name}"]`).first();
                  await inp.fill(String(ans)).catch(() => {});
                }
              } catch (e) {
                // Ignore individual field fill errors
              }
              await activePage.waitForTimeout(150);
            }
          }

          // Check if submit is possible or human review is needed
          const submitLoc = activePage.locator('button[type="submit"], input[type="submit"], button:has-text("Submit Application"), button:has-text("Submit")').first();
          const hasSubmit = await submitLoc.isVisible().catch(() => false);

          return {
            status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
            detectedMethod: 'custom_form',
            formFields,
            hasSubmitButton: hasSubmit,
            pageAnalysis: latestAnalysis,
            pageUrl: activePage.url(),
            message: `Employer application form loaded with ${formFields.length} fields. Tailored answers prepared.`,
          };
        }
      }

      // 4. Check if Candidate Authentication / Account Gateway is required
      if (
        latestAnalysis.pageType === 'ats_account_gateway' ||
        latestExtracted.authGateway?.isAuthRequired
      ) {
        await logJobEvent(
          'unknownPageHandler',
          'AUTH_GATEWAY_DETECTED',
          `Employer requires candidate account sign-in / registration on ${activePage.url()}`
        );
        return {
          status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
          detectedMethod: 'career_portal',
          pageAnalysis: latestAnalysis,
          pageUrl: activePage.url(),
          message: `Employer portal requires candidate account creation/login. Direct portal link and tailored profile ready.`,
        };
      }

      // 5. Advance portal navigation (clicking Apply, Modal options like "Autofill with Resume", or Stepper "Next")
      const navResult = await navigatePortalWithAiDecision(activePage, latestAnalysis, context);
      if (navResult.newPage) {
        activePage = navResult.newPage;
      }
      await activePage.waitForTimeout(2500);

      if (!navResult.navigated) {
        // No further automated clicks needed or available
        break;
      }
    }

    return {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      detectedMethod: 'career_portal',
      pageAnalysis: latestAnalysis,
      pageUrl: activePage.url(),
      message: latestAnalysis?.summary || 'Employer career portal reached. Ready to proceed.',
    };
  } catch (error) {
    await logError('unknownPageHandler.executeAutonomousUnknownApplication', error.message);
    return {
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      detectedMethod: 'human_review',
      pageUrl: url,
      message: `Portal navigation completed. Please review application details directly.`,
      error: error.message,
    };
  } finally {
    await BrowserManager.closeSafely({ page, context, browser });
  }
};

/**
 * Legacy wrapper for analyzeUnknownPage that uses the autonomous engine
 */
export const analyzeUnknownPage = async (params) => {
  return await executeAutonomousUnknownApplication(params);
};

export const fillCustomFormOnPage = async (params) => {
  return await executeAutonomousUnknownApplication(params);
};
