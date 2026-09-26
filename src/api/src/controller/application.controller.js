import path from "path";
import fs from "fs/promises";
import * as applicationService from "../services/application.service.js";
import { appError } from "../utils/errors.js";
import { generateResumePdf } from "../pdf/resumePdfService.js";
import { updateApplicationResume } from "../repositories/application.repository.js";

/**
 * Creates application for a specific job and initiates pipeline
 */
export const createFromJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.userId;

    const application = await applicationService.createApplicationFromJob(
      userId,
      jobId,
    );
    return res.status(201).json({
      success: true,
      message: "Job application created and draft generated successfully",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Direct application creation from custom job payload or jobId
 * Saves application record directly WITHOUT running heavy agent at save time
 */
export const createApplicationDirect = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const {
      jobId,
      jobTitle,
      company,
      location,
      sourceUrl,
      status,
      applicationMethod,
      email,
    } = req.body || {};

    const app = await applicationService.createDirectApplicationService(
      userId,
      {
        jobId,
        jobTitle,
        company,
        location,
        sourceUrl,
        status: status || "pending",
        applicationMethod,
        email,
      },
    );

    return res.status(201).json({
      success: true,
      message: "Application saved successfully",
      data: app,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update application status directly, with optional AI tailoring when requested or when status is waiting_for_review
 */
export const updateStatusDirect = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, triggerTailor } = req.body || {};
    const userId = req.user?.userId;

    if (triggerTailor || status === "waiting_for_review") {
      const app = await applicationService.getApplicationById(id, userId);
      if (triggerTailor || !app?.resume?.tailoredResumeData) {
        const tailored = await applicationService.tailorApplicationService(
          userId,
          id,
        );
        return res.status(200).json({
          success: true,
          message:
            "Job read, resume tailored, and outreach drafted. Status set to waiting_for_review",
          data: tailored,
        });
      }
    }

    const updated =
      await applicationService.updateApplicationStatusDirectService(id, status);
    return res.status(200).json({
      success: true,
      message: "Application status updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Explicit trigger: reads job, tailors resume, generates ATS PDF, and writes email/pitch
 */
export const tailorApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const updated = await applicationService.tailorApplicationService(
      userId,
      id,
    );
    return res.status(200).json({
      success: true,
      message: "Application tailored and email drafted successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Process next pending application automatically
 */
export const processNext = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const application =
      await applicationService.processNextPendingApplication(userId);

    if (!application) {
      return res.status(200).json({
        success: true,
        message: "No pending applications found",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Next pending application processed successfully",
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all user applications
 */
export const getApplications = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { status, page, limit } = req.query || {};

    const result = await applicationService.getUserApplications(userId, {
      status,
      page,
      limit,
    });
    return res.status(200).json({
      success: true,
      data: result.applications,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single application by ID
 */
export const getApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const application = await applicationService.getApplicationById(id, userId);
    return res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Human Approval Endpoint: Explicit user approval
 */
export const approve = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const updated = await applicationService.approveAndSendApplication(
      id,
      userId,
    );
    return res.status(200).json({
      success: true,
      message: "Application approved and email sent successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Human Rejection Endpoint: Explicit user rejection
 */
export const reject = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const userId = req.user?.userId;

    const updated = await applicationService.rejectApplication(
      id,
      userId,
      reason,
    );
    return res.status(200).json({
      success: true,
      message: "Application rejected successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Human Edit Endpoint: Edit email draft before approval
 */
export const editEmail = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { recipient, subject, body } = req.body || {};
    const userId = req.user?.userId;

    const updated = await applicationService.editApplicationEmail(id, userId, {
      recipient,
      subject,
      body,
    });

    return res.status(200).json({
      success: true,
      message: "Application email draft updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download or stream tailored resume PDF
 */
export const downloadPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const application = await applicationService.getApplicationById(id, userId);
    let pdfPath = application.resume?.pdfPath;

    let fileExists = false;
    if (pdfPath) {
      const resolvedPath = path.isAbsolute(pdfPath)
        ? pdfPath
        : path.resolve(process.cwd(), pdfPath);
      try {
        await fs.access(resolvedPath);
        fileExists = true;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="Tailored_Resume_${id}.pdf"`,
        );
        return res.sendFile(resolvedPath);
      } catch {
        fileExists = false;
      }
    }

    // If PDF file does not exist on disk, compile it dynamically from stored resume data
    if (!fileExists && application.resume?.tailoredResumeData) {
      try {
        const generatedPath = await generateResumePdf({
          resumeData: application.resume.tailoredResumeData,
          template: application.resume?.template || "ats",
          userId: application.userId?._id || application.userId,
        });
        await updateApplicationResume(id, { pdfPath: generatedPath });
        const resolvedGenerated = path.isAbsolute(generatedPath)
          ? generatedPath
          : path.resolve(process.cwd(), generatedPath);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="Tailored_Resume_${id}.pdf"`,
        );
        return res.sendFile(resolvedGenerated);
      } catch (genErr) {
        // Log generation failure and fall through
      }
    }

    if (!pdfPath && !fileExists) {
      throw new appError(
        "No tailored PDF resume generated for this application yet",
        404,
      );
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Update or regenerate tailored resume for an application
 */
export const updateResume = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      targetPageLength,
      pageCount,
      tailoredResumeData,
      template,
      regenerate,
    } = req.body || {};
    const userId = req.user?.userId;

    const updated = await applicationService.updateApplicationResumeService(
      id,
      userId,
      {
        targetPageLength,
        pageCount,
        tailoredResumeData,
        template,
        regenerate,
      },
    );

    return res.status(200).json({
      success: true,
      message: "Application resume updated/regenerated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get existing application by Job ID for current user
 */
export const getApplicationByJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user?.userId;

    const app = await applicationService.getApplicationByJobAndUserService(
      userId,
      jobId,
    );
    return res.status(200).json({
      success: true,
      data: app,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Preview draft email and verification payload for a job before applying
 */
export const previewDraft = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await applicationService.previewOrGenerateDraftService(
      userId,
      req.body || {},
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Checkpoint 1: Submit user answers for missing questionnaire questions
 */
export const submitAnswers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { answers } = req.body || {};

    const updated = await applicationService.submitMissingAnswersService(
      id,
      userId,
      answers || []
    );

    return res.status(200).json({
      success: true,
      message: "Answers submitted and application workflow resumed",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Checkpoint 2: Final user confirmation and submission
 */
export const confirmFinal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { confirmedAnswers } = req.body || {};

    const updated = await applicationService.confirmFinalApplicationService(
      id,
      userId,
      { confirmedAnswers: confirmedAnswers || [] }
    );

    return res.status(200).json({
      success: true,
      message: "Application confirmed and submitted successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save edited answers during final review without submitting
 */
export const saveAnswers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { answers } = req.body || {};

    const updated = await applicationService.saveEditedAnswersService(
      id,
      userId,
      answers || []
    );

    return res.status(200).json({
      success: true,
      message: "Answers updated successfully",
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a job application
 */
export const deleteApplication = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    await applicationService.deleteApplicationService(id, userId);

    return res.status(200).json({
      success: true,
      message: "Application deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
