import { JobApplication } from '../../model/JobApplication.js';
import { tailorResumeForJobDescription } from '../../services/resumeTailoring.service.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Shared wrapper for on-demand resume tailoring.
 * Checks if a tailored resume already exists for this application before triggering LLM tailoring.
 *
 * @param {object} params
 * @param {string} [params.applicationId]
 * @param {string} params.userId
 * @param {object} params.resumeData - Base candidate resume
 * @param {object} params.job - Target job posting
 * @returns {Promise<{ tailoredResume: object, alreadyTailored: boolean }>}
 */
export const tailorResumeOnDemand = async ({
  applicationId = null,
  userId,
  resumeData,
  job,
}) => {
  try {
    // 1. Check if application already has a tailored resume
    if (applicationId) {
      const app = await JobApplication.findById(applicationId).select('resume.tailoredResume').lean();
      if (app?.resume?.tailoredResume && Object.keys(app.resume.tailoredResume).length > 0) {
        await logJobEvent(
          'resumeTailor',
          'REUSE_EXISTING',
          `Using existing tailored resume for application ${applicationId}`
        );
        return {
          tailoredResume: app.resume.tailoredResume,
          alreadyTailored: true,
        };
      }
    }

    // 2. Perform on-demand tailoring
    await logJobEvent(
      'resumeTailor',
      'TRIGGER_TAILORING',
      `Generating tailored resume for job "${job?.title || 'Unknown'}"`
    );

    const result = await tailorResumeForJobDescription({
      candidateResume: resumeData,
      jobDetails: job,
      userId,
      applicationId,
    });

    return {
      tailoredResume: result.tailoredResume,
      alreadyTailored: false,
    };
  } catch (error) {
    await logError('resumeTailor.tailorResumeOnDemand', error.message);
    // Return base resume as fallback
    return {
      tailoredResume: resumeData || {},
      alreadyTailored: false,
    };
  }
};
