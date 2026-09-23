import { Resume, ResumeType } from '../model/Resume.js';
import { appError } from '../utils/errors.js';

/**
 * Creates and persists a new Resume record in MongoDB
 */
export const createResume = async ({ userId, originalFile, parsedData, type = ResumeType.ORIGINAL, version = 1, jobId = null }) => {
  try {
    const newResume = await Resume.create({
      userId,
      originalFile,
      parsedData,
      type,
      version,
      jobId
    });
    return newResume;
  } catch (error) {
    throw new appError(`Database error creating resume: ${error.message}`, 500);
  }
};

/**
 * Finds resumes by User ID
 */
export const findResumesByUserId = async (userId) => {
  try {
    return await Resume.find({ userId }).sort({ createdAt: -1 });
  } catch (error) {
    throw new appError(`Database error fetching user resumes: ${error.message}`, 500);
  }
};

/**
 * Finds a specific resume by Resume ID
 */
export const findResumeById = async (resumeId) => {
  try {
    return await Resume.findById(resumeId);
  } catch (error) {
    throw new appError(`Database error fetching resume: ${error.message}`, 500);
  }
};

/**
 * Finds the latest ORIGINAL resume for a User ID
 */
export const findOriginalResumeByUserId = async (userId) => {
  try {
    return await Resume.findOne({ userId, type: ResumeType.ORIGINAL }).sort({ createdAt: -1 });
  } catch (error) {
    throw new appError(`Database error fetching original resume: ${error.message}`, 500);
  }
};

/**
 * Gets active resume for a User ID
 */
export const getActiveResumeByUserId = async (userId) => {
  try {
    const resume = await Resume.findOne({ userId, type: ResumeType.ORIGINAL }).sort({ createdAt: -1 });
    if (!resume) {
      return await Resume.findOne({ userId }).sort({ createdAt: -1 });
    }
    return resume;
  } catch (error) {
    throw new appError(`Database error fetching active resume: ${error.message}`, 500);
  }
};

export default {
  createResume,
  findResumesByUserId,
  findResumeById,
  findOriginalResumeByUserId,
  getActiveResumeByUserId
};
