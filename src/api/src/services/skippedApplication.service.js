import {
  upsertSkippedApplication,
  getSkippedApplicationsByUserId
} from '../repositories/skippedApplication.repository.js';
import { appError } from '../utils/errors.js';
import { logError, logJobEvent } from '../utils/logger.js';

/**
 * Records a skipped job application with its specific reason
 */
export const logSkippedJobService = async ({
  userId,
  job,
  skipReason,
  skipDetails
}) => {
  try {
    if (!userId || !job || !job.sourceUrl) return null;

    const skipData = {
      userId,
      jobId: job._id || job.jobId || null,
      jobTitle: job.title || 'Untitled Position',
      company: job.company || job.companyName || '',
      location: job.location || '',
      sourceUrl: job.sourceUrl,
      applicationMethod: job.applicationMethod || 'unknown',
      skipReason: skipReason || 'OTHER',
      skipDetails: skipDetails || ''
    };

    const result = await upsertSkippedApplication(skipData);
    if (!result || !result.isNew) {
      // Already skipped previously; do not duplicate event or count
      return result?.doc || null;
    }

    await logJobEvent(
      'logSkippedJobService',
      'JOB_SKIPPED',
      `Job skipped for User ${userId}: ${job.sourceUrl} (${skipReason})`
    );
    return result.doc;
  } catch (error) {
    await logError('skippedApplicationService.logSkippedJobService', error.message);
    return null;
  }
};

/**
 * Retrieves list of skipped job applications for a user
 */
export const getUserSkippedApplicationsService = async (userId, options = {}) => {
  try {
    if (!userId) {
      throw new appError('User ID is required to fetch skipped applications', 400);
    }

    return await getSkippedApplicationsByUserId(userId, options);
  } catch (error) {
    if (error.isOperational) throw error;
    await logError('skippedApplicationService.getUserSkippedApplicationsService', error.message);
    throw new appError(`Failed to fetch skipped applications: ${error.message}`, 500);
  }
};

export default {
  logSkippedJobService,
  getUserSkippedApplicationsService
};
