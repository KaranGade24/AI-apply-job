import { runAgent } from '../agent/agent.js';
import { createResume, findResumesByUserId, findResumeById } from '../repositories/resumeRepository.js';
import { appError } from '../utils/errors.js';
import { ResumeType } from '../model/Resume.js';

/**
 * Service to process the uploaded resume file via AI agent graph and save to MongoDB
 */
export const processAndSaveResume = async ({ userId, filePath, originalFilename }) => {
  try {
    if (!userId) {
      throw new appError('User ID is required to process resume', 400);
    }
    if (!filePath) {
      throw new appError('File path is required for resume processing', 400);
    }

    // 1. Run AI Resume Parsing Agent Pipeline using runAgent orchestrator
    const parsedData = await runAgent('resume', { filePath }, { userId });

    if (!parsedData) {
      throw new appError('AI resume parsing yielded no data', 500);
    }

    // 2. Persist to MongoDB
    const savedResume = await createResume({
      userId,
      originalFile: originalFilename || filePath,
      parsedData,
      type: ResumeType.ORIGINAL,
      version: 1
    });

    return savedResume;
  } catch (error) {
    if (error.isOperational) {
      throw error;
    }
    throw new appError(`Resume processing service error: ${error.message}`, 500);
  }
};

/**
 * Get all resumes for a user
 */
export const getUserResumes = async (userId) => {
  try {
    return await findResumesByUserId(userId);
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to retrieve resumes: ${error.message}`, 500);
  }
};

/**
 * Get resume details by ID
 */
export const getResumeById = async (resumeId) => {
  try {
    const resume = await findResumeById(resumeId);
    if (!resume) {
      throw new appError('Resume not found', 404);
    }
    return resume;
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to fetch resume: ${error.message}`, 500);
  }
};

export default {
  processAndSaveResume,
  getUserResumes,
  getResumeById
};
