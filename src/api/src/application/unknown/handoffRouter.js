import { HANDOFF_METHODS, APPLICATION_METHOD, APPLICATION_STATUS } from '../../constant/application.constant.js';
import { runGoogleFormApplication } from '../methods/googleFormApplicationMethod.js';
import { runPhoneApplication } from '../methods/phoneApplicationMethod.js';
import { updateApplicationStatus } from '../../repositories/application.repository.js';
import { JobApplication } from '../../model/JobApplication.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Dispatches a dynamic handoff when the generic UNKNOWN browser agent discovers
 * that a target site actually requires a specialized application method
 * (Google Form, direct Email, or Phone call).
 *
 * @param {object} params
 * @param {string} params.method - Target method from HANDOFF_METHODS
 * @param {object} params.context - Handoff context
 * @param {string} params.context.url - Discovered URL
 * @param {string} [params.context.applicationId]
 * @param {string} params.context.userId
 * @param {object} params.context.job
 * @param {object} [params.context.candidateInfo]
 * @param {object} [params.context.pageClassification]
 * @param {object} [params.context.agentState]
 * @returns {Promise<object>} Result of the handoff execution
 */
export const dispatchMethodHandoff = async ({ method, context = {} }) => {
  const {
    url,
    applicationId,
    userId,
    job = {},
    candidateInfo = null,
    pageClassification = null,
    agentState = null,
  } = context;

  await logJobEvent(
    'handoffRouter',
    'DISPATCH',
    `Dispatching handoff to ${method} for application ${applicationId || 'N/A'} at ${url}`
  );

  try {
    switch (method) {
      case HANDOFF_METHODS.GOOGLE_FORM: {
        if (applicationId) {
          await JobApplication.findByIdAndUpdate(applicationId, {
            applicationMethod: APPLICATION_METHOD.GOOGLE_FORM,
            'job.applicationUrl': url,
          });
        }

        const googleFormResult = await runGoogleFormApplication({
          formUrl: url,
          applicationId,
          userId,
          candidateInfo,
          jobDetails: job,
        });

        return {
          handoffExecuted: true,
          method: HANDOFF_METHODS.GOOGLE_FORM,
          result: googleFormResult,
        };
      }

      case HANDOFF_METHODS.PHONE: {
        const phone =
          pageClassification?.phoneNumber ||
          job?.contactPhone ||
          agentState?.discoveredPhone ||
          '';

        if (applicationId) {
          await JobApplication.findByIdAndUpdate(applicationId, {
            applicationMethod: APPLICATION_METHOD.PHONE,
          });
        }

        const phoneResult = await runPhoneApplication({
          applicationId,
          phoneNumber: phone,
          candidateInfo,
          jobDetails: job,
          userId,
        });

        return {
          handoffExecuted: true,
          method: HANDOFF_METHODS.PHONE,
          result: phoneResult,
        };
      }

      case HANDOFF_METHODS.EMAIL: {
        const emailContact = pageClassification?.emailContact || {};
        const email = emailContact.email || job?.contactEmail || '';
        const referenceId = emailContact.referenceId || '';

        if (applicationId) {
          await JobApplication.findByIdAndUpdate(applicationId, {
            applicationMethod: APPLICATION_METHOD.EMAIL,
            'emailDetails.recipient': email,
            'emailDetails.referenceId': referenceId,
          });

          await updateApplicationStatus(applicationId, APPLICATION_STATUS.EMAIL_GENERATING, {
            logMessage: `Discovered direct email application: ${email}. Handing off to Email engine.`,
          });
        }

        return {
          handoffExecuted: true,
          method: HANDOFF_METHODS.EMAIL,
          emailContact,
          message: `Direct email application detected for ${email}. Handing off to email pipeline.`,
        };
      }

      case HANDOFF_METHODS.GENERIC_FORM:
      default:
        return {
          handoffExecuted: false,
          method: HANDOFF_METHODS.GENERIC_FORM,
          message: 'Continue with generic form agent mode.',
        };
    }
  } catch (error) {
    await logError('handoffRouter.dispatchMethodHandoff', error.message);
    return {
      handoffExecuted: false,
      error: error.message,
    };
  }
};
