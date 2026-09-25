import { Job, MatchStatus } from '../model/Job.js';
import { SkippedApplication } from '../model/SkippedApplication.js';
import { logError } from '../utils/logger.js';

/**
 * Saves or updates a job by sourceUrl in MongoDB (upsert)
 * @param {object} jobData
 * @returns {Promise<object>} Saved Mongoose document
 */
export const upsertJob = async (jobData) => {
  try {
    if (!jobData.sourceUrl) {
      throw new Error('sourceUrl is required for job upsert');
    }

    const updatedJob = await Job.findOneAndUpdate(
      { sourceUrl: jobData.sourceUrl },
      { $set: jobData },
      { returnDocument: 'after', upsert: true, runValidators: true }
    );

    return updatedJob;
  } catch (error) {
    await logError('jobRepository.upsertJob', error.message);
    throw error;
  }
};

/**
 * Saves multiple job documents in bulk using upsert
 * @param {Array<object>} jobsList
 * @returns {Promise<Array<object>>} List of saved jobs
 */
export const saveBulkJobs = async (jobsList = []) => {
  try {
    const savedJobs = [];
    for (const job of jobsList) {
      if (job.sourceUrl) {
        const doc = await upsertJob(job);
        savedJobs.push(doc);
      }
    }
    return savedJobs;
  } catch (error) {
    await logError('jobRepository.saveBulkJobs', error.message);
    return [];
  }
};

/**
 * Checks which source URLs already exist in the database
 * @param {Array<string>} urls
 * @returns {Promise<Set<string>>} Set of existing source URLs
 */
export const getExistingSourceUrls = async (urls = []) => {
  try {
    if (!urls || urls.length === 0) return new Set();
    const [existingJobs, existingSkipped] = await Promise.all([
      Job.find({ sourceUrl: { $in: urls } }, { sourceUrl: 1 }).lean(),
      SkippedApplication.find({ sourceUrl: { $in: urls } }, { sourceUrl: 1 }).lean(),
    ]);

    const set = new Set();
    existingJobs.forEach((j) => j.sourceUrl && set.add(j.sourceUrl));
    existingSkipped.forEach((s) => s.sourceUrl && set.add(s.sourceUrl));
    return set;
  } catch (error) {
    await logError('jobRepository.getExistingSourceUrls', error.message);
    return new Set();
  }
};

/**
 * Finds job by source URL
 * @param {string} sourceUrl
 * @returns {Promise<object|null>}
 */
export const getJobBySourceUrl = async (sourceUrl) => {
  try {
    return await Job.findOne({ sourceUrl });
  } catch (error) {
    await logError('jobRepository.getJobBySourceUrl', error.message);
    return null;
  }
};

/**
 * Updates match status, score, and skill analysis for a job
 * @param {string} jobId
 * @param {object} matchResult
 * @returns {Promise<object|null>}
 */
export const updateJobMatchStatus = async (jobId, matchResult = {}) => {
  try {
    const update = {
      matchStatus: matchResult.matchStatus || MatchStatus.MATCHED,
      matchScore: matchResult.matchScore || 0,
      matchReason: matchResult.matchReason || '',
      matchedSkills: matchResult.matchedSkills || [],
      missingSkills: matchResult.missingSkills || [],
      resumeId: matchResult.resumeId || null
    };

    return await Job.findByIdAndUpdate(jobId, { $set: update }, { returnDocument: 'after' });
  } catch (error) {
    await logError('jobRepository.updateJobMatchStatus', error.message);
    return null;
  }
};

/**
 * Retrieves matched or stored jobs with optional filters
 * @param {object} filter
 * @param {number} limit
 * @returns {Promise<Array<object>>}
 */
export const getJobs = async (filter = {}, limit = 50) => {
  try {
    return await Job.find(filter).sort({ createdAt: -1 }).limit(limit);
  } catch (error) {
    await logError('jobRepository.getJobs', error.message);
    return [];
  }
};

/**
 * Finds a job document by ID
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export const findJobById = async (jobId) => {
  try {
    return await Job.findById(jobId);
  } catch (error) {
    await logError('jobRepository.findJobById', error.message);
    return null;
  }
};

export const getJobById = findJobById;

/**
 * Deletes a job document by ID
 * @param {string} jobId
 * @returns {Promise<object|null>}
 */
export const deleteJobById = async (jobId) => {
  try {
    return await Job.findByIdAndDelete(jobId);
  } catch (error) {
    await logError('jobRepository.deleteJobById', error.message);
    return null;
  }
};

export default {
  upsertJob,
  saveBulkJobs,
  getJobBySourceUrl,
  getExistingSourceUrls,
  updateJobMatchStatus,
  getJobs,
  findJobById,
  getJobById,
  deleteJobById
};
