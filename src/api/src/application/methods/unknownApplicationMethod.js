import { logJobEvent, logError } from '../../utils/logger.js';
import { executeAutonomousUnknownApplication } from '../unknown/unknownPageHandler.js';
import { updateApplicationStatus } from '../../repositories/application.repository.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { JobApplication } from '../../model/JobApplication.js';

/**
 * Runs the full Autonomous Unknown / Career Portal application method workflow.
 *
 * Uses the Observe → Analyze → Decide → Act → Verify browser-agent engine:
 * 1. Restores user session / cookies if available
 * 2. Runs the autonomous agent loop across pages, accordions, modals, and multi-step forms
 * 3. Supports dynamic method handoff (Google Form, direct Email, Phone)
 * 4. Supports Human-in-the-loop pause/resume (WAITING_FOR_USER / HUMAN_REQUIRED)
 * 5. Supports WAITING_FOR_FINAL_REVIEW checkpoint before final form submission
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.pageUrl - Target job URL
 * @param {object} params.candidateInfo - Candidate resume / profile data
 * @param {object} params.jobDetails - Job document
 * @param {string} params.userId
 * @param {string} [params.resumePdfPath] - Local tailored resume PDF path
 * @param {object} [params.sessionState] - Optional browser session state
 * @returns {Promise<object>} Structured execution result
 */
export const runUnknownApplicationMethod = async ({
  applicationId,
  pageUrl,
  candidateInfo,
  jobDetails,
  userId,
  resumePdfPath = null,
  sessionState = null,
}) => {
  try {
    if (!pageUrl) {
      throw new Error('No URL provided for unknown application method');
    }

    await logJobEvent(
      'unknownApplicationMethod',
      'START',
      `Analyzing unknown/portal application page: ${pageUrl}`
    );

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.ANALYZING_PORTAL, {
        logMessage: `AI browser agent analyzing portal: ${pageUrl}`,
      });
    }

    // Run the autonomous browser agent
    const pageResult = await executeAutonomousUnknownApplication({
      url: pageUrl,
      job: jobDetails,
      userId,
      applicationId,
      resumePdfPath,
      candidateInfo,
      sessionState,
    });

    const detectedMethod = pageResult.detectedMethod || pageResult.handoff?.method || 'unknown';

    // If dynamic handoff was executed (e.g. to Google Form, Phone, or Email)
    if (pageResult.handoffExecuted) {
      return {
        detectedMethod,
        actionTaken: 'handoff_executed',
        handoffResult: pageResult.handoffResult,
        status: pageResult.status,
        message: pageResult.message || `Discovered ${detectedMethod} application method.`,
        pageResult,
      };
    }

    // Persist any form fields or state to JobApplication
    if (applicationId && (pageResult.formFields || pageResult.agentState)) {
      const updateData = {};
      if (pageResult.formFields) {
        updateData['form.fields'] = pageResult.formFields;
      }
      if (pageResult.missingQuestions) {
        updateData['form.missingQuestions'] = pageResult.missingQuestions;
      }
      if (pageResult.answeredQuestions) {
        updateData['form.answers'] = pageResult.answeredQuestions;
      }
      if (Object.keys(updateData).length > 0) {
        await JobApplication.findByIdAndUpdate(applicationId, updateData);
      }
    }

    return {
      detectedMethod,
      actionTaken: pageResult.terminalState || 'in_progress',
      status: pageResult.status || APPLICATION_STATUS.WAITING_FOR_REVIEW,
      message: pageResult.message || 'Agent completed iteration.',
      pageResult,
    };
  } catch (error) {
    await logError('unknownApplicationMethod.runUnknownApplicationMethod', error.message);

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
        logMessage: `Portal navigation halted: ${error.message}. Manual review available.`,
      });
    }

    return {
      detectedMethod: 'unknown',
      actionTaken: 'error_fallback',
      status: APPLICATION_STATUS.WAITING_FOR_REVIEW,
      message: error.message,
    };
  }
};
