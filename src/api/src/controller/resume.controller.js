import fs from "fs";
import {
  processAndSaveResume,
  getUserResumes,
  getResumeById,
  deleteResumeById,
} from "../services/resume.service.js";
import { resumeSchema } from "../agent/schema/resumeSchema.js";
import { handleError, appError } from "../utils/errors.js";
import { logError } from "../utils/logger.js";
import { upload } from "../config/multer.config.js";
import { MAX_FILE_SIZE_BYTES } from "../constant/api.constant.js";

export { upload };

/**
 * Upload Resume Controller Endpoint
 */
export const uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      throw new appError(
        "Please select a valid resume file (PDF or DOCX under 5MB) to upload.",
        400,
      );
    }

    // Strictly verify file size < 5MB
    if (req.file.size >= MAX_FILE_SIZE_BYTES) {
      // Cleanup uploaded file
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      throw new appError(
        "File size exceeds the limit. Resume file must be strictly less than 5 MB.",
        400,
      );
    }

    // Extract user ID from auth middleware req.user
    const userId = req.user?.userId;
    if (!userId) {
      throw new appError("User authentication context missing.", 401);
    }

    // Process uploaded resume through AI agent and save to MongoDB
    const result = await processAndSaveResume({
      userId,
      filePath: req.file.path,
      originalFilename: req.file.originalname,
    });

    return res.status(201).json({
      success: true,
      message: "Resume uploaded, parsed by AI, and stored successfully.",
      data: result,
    });
  } catch (error) {
    // Cleanup temporary file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        await logError(
          "uploadResumeCleanup",
          cleanupErr.message,
          cleanupErr.stack,
        );
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
    const userId = req.user?.userId;
    const resumes = await getUserResumes(userId);
    return res.status(200).json({
      success: true,
      data: resumes,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Get Resume Details By ID (with ownership check)
 */
export const getSingleResume = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const resume = await getResumeById(id, userId);
    return res.status(200).json({
      success: true,
      data: resume,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Save resume parsed data directly with strict Zod schema validation
 */
export const saveResumeData = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      throw new appError("User authentication context missing.", 401);
    }

    const { resumeData } = req.body || {};
    if (!resumeData || typeof resumeData !== "object") {
      throw new appError("Valid resume data is required.", 400);
    }

    // Validate request payload strictly against canonical resume schema
    let validatedData;
    try {
      validatedData = resumeSchema.parse(resumeData);
    } catch (valErr) {
      throw new appError(`Invalid resume schema: ${valErr.message}`, 400);
    }

    const { Resume } = await import("../model/Resume.js");
    let resumeDoc = await Resume.findOne({ userId, type: "ORIGINAL" });
    if (resumeDoc) {
      resumeDoc.parsedData = validatedData;
      await resumeDoc.save();
    } else {
      resumeDoc = await Resume.create({
        userId,
        parsedData: validatedData,
        type: "ORIGINAL",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Resume saved successfully",
      data: resumeDoc,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Generate Resume PDF endpoint
 */
export const generateResumePdfController = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { tailoredResumeData, template } = req.body || {};

    const { generateResumePdf } = await import("../pdf/resumePdfService.js");
    const pdfPath = await generateResumePdf({
      resumeData: tailoredResumeData || {},
      template: template || "modern",
      userId,
    });

    return res.status(200).json({
      success: true,
      pdfUrl: `/api/applications/pdf?path=${encodeURIComponent(pdfPath)}`,
      pdfPath,
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Delete Resume Controller (verifies ownership)
 */
export const deleteResumeController = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    await deleteResumeById(id, userId);

    return res.status(200).json({
      success: true,
      message: "Resume deleted successfully",
    });
  } catch (error) {
    return handleError(error, res);
  }
};

/**
 * Download Original Resume Controller (verifies ownership)
 */
export const downloadOriginalResume = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { Resume } = await import("../model/Resume.js");
    const resume = await Resume.findOne({ _id: id, userId });

    if (!resume || !resume.filePath) {
      throw new appError("Resume not found or access denied", 404);
    }

    const fs = await import("fs");
    if (!fs.existsSync(resume.filePath)) {
      throw new appError("File missing on server", 404);
    }

    res.download(resume.filePath, resume.originalFile || "resume.pdf");
  } catch (error) {
    return handleError(error, res);
  }
};

export default {
  upload,
  uploadResume,
  getMyResumes,
  getSingleResume,
  saveResumeData,
  generateResumePdfController,
  deleteResumeController,
  downloadOriginalResume,
};
