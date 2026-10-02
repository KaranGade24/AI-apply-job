import { runAgent } from '../agent/agent.js';
import {
  createResume,
  findResumesByUserId,
  findResumeById,
  findResumeByIdAndUserId,
  deleteResumeByIdAndUserId,
} from '../repositories/resume.repository.js';
import { resumeSchema } from '../agent/schema/resumeSchema.js';
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

    // Ensure parsedData strictly adheres to canonical resume schema
    const validatedData = resumeSchema.parse(parsedData);

    // 2. Persist to MongoDB (Upsert ORIGINAL resume)
    const { Resume } = await import('../model/Resume.js');
    let savedResume = await Resume.findOne({ userId, type: ResumeType.ORIGINAL });
    
    if (savedResume) {
      savedResume.originalFile = originalFilename || filePath;
      savedResume.filePath = filePath;
      savedResume.parsedData = validatedData;
      savedResume.version = (savedResume.version || 1) + 1;
      await savedResume.save();
    } else {
      savedResume = await createResume({
        userId,
        originalFile: originalFilename || filePath,
        filePath,
        parsedData: validatedData,
        type: ResumeType.ORIGINAL,
        version: 1
      });
    }

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
 * Get resume details by ID with optional ownership verification
 */
export const getResumeById = async (resumeId, userId = null) => {
  try {
    const resume = userId
      ? await findResumeByIdAndUserId(resumeId, userId)
      : await findResumeById(resumeId);

    if (!resume) {
      throw new appError('Resume not found or access denied', 404);
    }
    return resume;
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to fetch resume: ${error.message}`, 500);
  }
};

/**
 * Delete resume by ID verifying ownership
 */
export const deleteResumeById = async (resumeId, userId) => {
  try {
    if (!userId) {
      throw new appError('User context required to delete resume', 401);
    }
    const result = await deleteResumeByIdAndUserId(resumeId, userId);
    if (!result) {
      throw new appError('Resume not found or access denied', 404);
    }
    return result;
  } catch (error) {
    if (error.isOperational) throw error;
    throw new appError(`Failed to delete resume: ${error.message}`, 500);
  }
};

export default {
  processAndSaveResume,
  getUserResumes,
  getResumeById,
  deleteResumeById,
};
