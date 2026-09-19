import { findOriginalResumeByUserId } from '../repositories/resume.repository.js';
import { getJobs, getJobBySourceUrl } from '../repositories/job.repository.js';
import { runJobDiscoveryWorkflow } from '../agent/graph/jobDiscoveryGraph.js';
import { appError } from '../utils/errors.js';
import { logError } from '../utils/logger.js';

/**
 * Service to orchestrate Job Discovery, filtering, and candidate resume matching
 * @param {object} params
 * @param {string} params.userId - Authenticated candidate user ID
 * @param {Array<string>} params.sources - Array of job source adapter names (e.g. ['jobViaReferral', 'naukri'])
 * @param {Array<string>} params.keywords - Job keywords / titles
 * @param {Array<string>} params.locations - Preferred locations
 * @param {object} params.experience - Min and max experience in years
 * @param {Array<string>} params.workMode - Preferred work modes (e.g. ['remote', 'hybrid'])
 * @param {Array<string>} params.employmentType - Employment type (e.g. ['fullTime'])
 * @param {string} params.postedWithin - Time frame window (e.g. '24h')
 * @param {number} params.maxJobs - Maximum matched jobs to retrieve
 */
export const discoverJobsService = async ({
  userId,
  sources = ['jobViaReferral'],
  keywords = ['MERN Developer', 'Node.js Developer'],
  locations = ['Pune', 'Remote'],
  experience = { min: 0, max: 2 },
  workMode = ['remote', 'hybrid', 'workFromOffice'],
  employmentType = ['fullTime'],
  postedWithin = '24h',
  maxJobs = 10
}) => {
  try {
    if (!userId) {
      throw new appError('User ID is required for job discovery', 400);
    }

    // 1. Fetch user's original candidate resume from MongoDB
    const originalResume = await findOriginalResumeByUserId(userId);

    let candidateResumeText = '';
    if (originalResume && originalResume.parsedData) {
      candidateResumeText = typeof originalResume.parsedData === 'string'
        ? originalResume.parsedData
        : JSON.stringify(originalResume.parsedData);
    }

    // 2. Build search configuration
    const searchConfig = {
      userId,
      sources,
      keywords,
      locations,
      experience,
      workMode,
      employmentType,
      postedWithin,
      maxJobs,
      candidateResumeText
    };

    // 3. Execute Job Discovery Workflow Graph
    const workflowResult = await runJobDiscoveryWorkflow(searchConfig);

    if (!workflowResult.success && workflowResult.errors?.length > 0) {
      throw new appError(`Job Discovery workflow failed: ${workflowResult.errors.join('; ')}`, 500);
    }

    return {
      totalDiscovered: workflowResult.totalJobsDiscovered || 0,
      matchedCount: (workflowResult.matchedJobs || []).length,
      hasCandidateResume: Boolean(candidateResumeText),
      jobs: workflowResult.matchedJobs || []
    };
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }
    await logError('jobService.discoverJobsService', error.message);
    throw new appError(`Job Discovery Service Error: ${error.message}`, 500);
  }
};

/**
 * Service to retrieve saved jobs from MongoDB
 */
export const getSavedJobsService = async (filter = {}, limit = 50) => {
  try {
    return await getJobs(filter, limit);
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to fetch saved jobs: ${error.message}`, 500);
  }
};

export default {
  discoverJobsService,
  getSavedJobsService
};
