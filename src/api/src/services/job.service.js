import { findOriginalResumeByUserId } from '../repositories/resume.repository.js';
import { getJobs, getJobBySourceUrl, deleteJobById } from '../repositories/job.repository.js';
import { JobApplication } from '../model/JobApplication.js';
import { SkippedApplication } from '../model/SkippedApplication.js';
import { runJobDiscoveryWorkflow } from '../agent/graph/jobDiscoveryGraph.js';
import { MatchStatus, WorkMode } from '../model/Job.js';
import { appError } from '../utils/errors.js';
import { logError, logJobEvent } from '../utils/logger.js';

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
  keywords = [],
  locations = [],
  experience = { min: 0, max: 2 },
  workMode = ['remote', 'hybrid', 'workFromOffice'],
  employmentType = ['fullTime'],
  excludeKeywords = [],
  preferredApplicationMethods = ['email', 'googleForm', 'websiteForm', 'phone', 'unknown'],
  postedWithin = '24h',
  maxJobs = 10,
  abortSignal = null
}) => {
  try {
    if (!userId) {
      throw new appError('User ID is required for job discovery', 400);
    }

    await logJobEvent('discoverJobsService', 'START', `Initiating job discovery for User: ${userId}`);

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
      excludeKeywords,
      preferredApplicationMethods,
      postedWithin,
      maxJobs,
      candidateResumeText,
      abortSignal
    };

    // 3. Execute Job Discovery Workflow Graph
    const workflowResult = await runJobDiscoveryWorkflow(searchConfig);

    if (!workflowResult.success && workflowResult.errors?.length > 0) {
      throw new appError(`Job Discovery workflow failed: ${workflowResult.errors.join('; ')}`, 500);
    }

    await logJobEvent('discoverJobsService', 'SUCCESS', `Discovered ${workflowResult.totalJobsDiscovered || 0} jobs, matched ${workflowResult.matchedJobs?.length || 0}`);

    let jobs = workflowResult.matchedJobs || [];
    if (userId && jobs.length > 0) {
      const [appliedJobIds, skippedJobIds] = await Promise.all([
        JobApplication.find({ userId }).distinct('jobId'),
        SkippedApplication.find({ userId }).distinct('jobId')
      ]);
      const excludedIds = new Set([...appliedJobIds.map(id => id.toString()), ...skippedJobIds.map(id => id.toString())]);
      jobs = jobs.filter(job => !excludedIds.has(job._id.toString()));
    }

    return {
      totalDiscovered: workflowResult.totalJobsDiscovered || 0,
      matchedCount: jobs.length,
      hasCandidateResume: Boolean(candidateResumeText),
      jobs: jobs
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
export const getSavedJobsService = async (filter = {}, limit = 50, userId = null) => {
  try {
    let finalFilter = { ...filter };

    if (userId) {
      // Fetch IDs of jobs that the user has already applied to or skipped
      const [appliedJobIds, skippedJobIds] = await Promise.all([
        JobApplication.find({ userId }).distinct('jobId'),
        SkippedApplication.find({ userId }).distinct('jobId')
      ]);

      const excludedIds = [...new Set([...appliedJobIds, ...skippedJobIds])].filter(id => id != null);
      
      if (excludedIds.length > 0) {
        finalFilter._id = { $nin: excludedIds };
      }
    }

    let jobs = await getJobs(finalFilter, limit);
    return jobs;
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to fetch saved jobs: ${error.message}`, 500);
  }
};

/**
 * Service to delete a job
 * @param {string} jobId
 */
export const deleteJobService = async (jobId) => {
  try {
    const job = await deleteJobById(jobId);
    if (!job) {
      throw new appError('Job not found', 404);
    }
    return job;
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to delete job: ${error.message}`, 500);
  }
};

export default {
  discoverJobsService,
  getSavedJobsService,
  deleteJobService
};
