import path from "path";
import fs from "fs/promises";
import * as applicationService from "../services/application.service.js";
import { appError } from "../utils/errors.js";

/**
 * Creates application for a specific job and initiates pipeline
 */
export const createFromJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id || req.user._id;

    const application = await applicationService.createApplicationFromJob(userId, jobId);
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
 * Process next pending application automatically
 */
export const processNext = async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id;
    const application = await applicationService.processNextPendingApplication(userId);

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
    const userId = req.user.id || req.user._id;
    const { status, page, limit } = req.query;

    const result = await applicationService.getUserApplications(userId, { status, page, limit });
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
    const userId = req.user.id || req.user._id;

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
    const userId = req.user.id || req.user._id;

    const updated = await applicationService.approveAndSendApplication(id, userId);
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
    const { reason } = req.body;
    const userId = req.user.id || req.user._id;

    const updated = await applicationService.rejectApplication(id, userId, reason);
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
    const { recipient, subject, body } = req.body;
    const userId = req.user.id || req.user._id;

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
    const userId = req.user.id || req.user._id;

    const application = await applicationService.getApplicationById(id, userId);
    const pdfPath = application.resume?.pdfPath;

    if (!pdfPath) {
      throw new appError("No tailored PDF resume generated for this application yet", 404);
    }

    const resolvedPath = path.isAbsolute(pdfPath)
      ? pdfPath
      : path.resolve(process.cwd(), pdfPath);

    await fs.access(resolvedPath);

    return res.sendFile(resolvedPath);
  } catch (error) {
    next(error);
  }
};
