import { SkippedApplication } from '../model/SkippedApplication.js';
import { logError } from '../utils/logger.js';

/**
 * Upserts a skipped application record in MongoDB
 * @param {object} skipData
 * @returns {Promise<object|null>}
 */
export const upsertSkippedApplication = async (skipData = {}) => {
  try {
    if (!skipData.userId || !skipData.sourceUrl) {
      return null;
    }

    return await SkippedApplication.findOneAndUpdate(
      { userId: skipData.userId, sourceUrl: skipData.sourceUrl },
      { $set: skipData },
      { returnDocument: 'after', upsert: true, runValidators: true }
    );
  } catch (error) {
    await logError('skippedApplicationRepository.upsertSkippedApplication', error.message);
    return null;
  }
};

/**
 * Retrieves skipped applications for a user with optional filter & pagination
 * @param {string} userId
 * @param {object} options
 * @returns {Promise<{ skipped: Array<object>, total: number }>}
 */
export const getSkippedApplicationsByUserId = async (userId, options = {}) => {
  try {
    const { skipReason, page = 1, limit = 50 } = options;
    const filter = { userId };
    if (skipReason) {
      filter.skipReason = skipReason;
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    const [skipped, total] = await Promise.all([
      SkippedApplication.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      SkippedApplication.countDocuments(filter)
    ]);

    return { skipped, total };
  } catch (error) {
    await logError('skippedApplicationRepository.getSkippedApplicationsByUserId', error.message);
    return { skipped: [], total: 0 };
  }
};

export default {
  upsertSkippedApplication,
  getSkippedApplicationsByUserId
};
