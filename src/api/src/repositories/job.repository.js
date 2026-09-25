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

    const variantsSet = new Set();
    urls.forEach((u) => {
      if (!u || typeof u !== 'string') return;
      const clean = u.trim();
      variantsSet.add(clean);
      
      const noSlash = clean.replace(/\/$/, '');
      variantsSet.add(noSlash);
      variantsSet.add(`${noSlash}/`);

      try {
        const decoded = decodeURIComponent(clean);
        variantsSet.add(decoded);
        variantsSet.add(decoded.replace(/\/$/, ''));
        variantsSet.add(`${decoded.replace(/\/$/, '')}/`);
      } catch (e) {}
    });

    const variantArray = Array.from(variantsSet);

    const [existingJobs, existingSkipped] = await Promise.all([
      Job.find({ sourceUrl: { $in: variantArray } }, { sourceUrl: 1 }).lean(),
      SkippedApplication.find({ sourceUrl: { $in: variantArray } }, { sourceUrl: 1 }).lean(),
    ]);

    const resultSet = new Set();
    const addAllVariants = (rawUrl) => {
      if (!rawUrl) return;
      const clean = rawUrl.trim();
      const lower = clean.toLowerCase();
      const noSlash = clean.replace(/\/$/, '');
      const lowerNoSlash = lower.replace(/\/$/, '');

      resultSet.add(clean);
      resultSet.add(lower);
      resultSet.add(noSlash);
      resultSet.add(lowerNoSlash);
      resultSet.add(`${noSlash}/`);
      resultSet.add(`${lowerNoSlash}/`);

      try {
        const decoded = decodeURIComponent(clean);
        const decodedLower = decoded.toLowerCase();
        resultSet.add(decoded);
        resultSet.add(decodedLower);
        resultSet.add(decoded.replace(/\/$/, ''));
        resultSet.add(decodedLower.replace(/\/$/, ''));
      } catch (e) {}
    };

    existingJobs.forEach((j) => addAllVariants(j.sourceUrl));
    existingSkipped.forEach((s) => addAllVariants(s.sourceUrl));

    return resultSet;
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
