import fs from 'fs';
import { processAndSaveResume, getUserResumes, getResumeById } from '../services/resume.service.js';
import { handleError, appError } from '../utils/errors.js';
import { logError } from '../utils/logger.js';
import { upload } from '../config/multer.config.js';
import { MAX_FILE_SIZE_BYTES } from '../constant/api.constant.js';

export { upload };

/**
 * Upload Resume Controller Endpoint
 */
export const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      throw new appError('Please select a valid resume file (PDF or DOC/DOCX under 5MB) to upload.', 400);
    }

    // Strictly verify file size < 5MB
    if (req.file.size >= MAX_FILE_SIZE_BYTES) {
      // Cleanup uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw new appError('File size exceeds the limit. Resume file must be strictly less than 5 MB.', 400);
    }

    // Extract user ID from auth middleware req.user
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    if (!userId) {
      throw new appError('User authentication context missing.', 401);
    }

    // Process uploaded resume through AI agent and save to MongoDB
    const result = await processAndSaveResume({
      userId,
      filePath: req.file.path,
      originalFilename: req.file.originalname
    });

    return res.status(201).json({
      success: true,
      message: 'Resume uploaded, parsed by AI, and stored successfully.',
      data: result
    });
  } catch (error) {
    // Cleanup temporary file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        await logError('uploadResumeCleanup', cleanupErr.message, cleanupErr.stack);
      }
    }
    return handleError(error, res);
  }
};

/**
 * Get User Resumes Controller
 */
export const getMyResumes = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id || req.user?.id;
    const resumes = await getUserResumes(userId);
    return res.status(200).json({
      success: true,
      data: resumes
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Get Resume Details By ID
 */
export const getSingleResume = async (req, res) => {
  try {
    const { id } = req.params;
    const resume = await getResumeById(id);
    return res.status(200).json({
      success: true,
      data: resume
    });
  } catch (error) {
    return handleError(error, res);
  }
};

export default {
  upload,
  uploadResume,
  getMyResumes,
  getSingleResume
};
