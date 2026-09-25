import express from "express";
import * as applicationController from "../controller/application.controller.js";
import { authMiddleware, optionalAuthMiddleware } from "../middlewares/auth.middleware.js";

const applicationRouter = express.Router();

/**
 * @swagger
 * /api/applications/process-next:
 *   post:
 *     summary: Automatically pick and process the next pending job application up to human review
 *     tags: [Applications]
 *     responses:
 *       200:
 *         description: Next pending application processed or no pending items found
 *       401:
 *         description: Unauthorized
 */
applicationRouter.post("/process-next", authMiddleware, applicationController.processNext);
applicationRouter.post("/", authMiddleware, applicationController.createApplicationDirect);
applicationRouter.post("/preview-draft", authMiddleware, applicationController.previewDraft);
applicationRouter.get("/job/:jobId", authMiddleware, applicationController.getApplicationByJob);
applicationRouter.patch("/:id/status", authMiddleware, applicationController.updateStatusDirect);
applicationRouter.post("/:id/tailor", authMiddleware, applicationController.tailorApplication);

/**
 * @swagger
 * /api/applications/create-from-job/{jobId}:
 *   post:
 *     summary: Create application for a specific saved job and run pipeline
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Application created and draft email/PDF generated
 *       404:
 *         description: Job posting not found
 */
applicationRouter.post("/create-from-job/:jobId", authMiddleware, applicationController.createFromJob);

/**
 * @swagger
 * /api/applications:
 *   get:
 *     summary: Retrieve user applications list with pagination and optional status filter
 *     tags: [Applications]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, processing, unsupported_method, resume_generating, email_generating, waiting_for_review, approved, rejected, sending, sent, failed]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of applications
 */
applicationRouter.get("/", authMiddleware, applicationController.getApplications);

/**
 * @swagger
 * /api/applications/{id}:
 *   get:
 *     summary: Get detailed single job application
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Detailed job application record
 *       404:
 *         description: Application not found
 * /api/applications/{id}:
 *   delete:
 *     summary: Delete a job application record
 *     description: Only allowed if the application is not approved or applied.
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application deleted successfully
 *       400:
 *         description: Cannot delete approved/applied application
 *       404:
 *         description: Application not found
 *       401:
 *         description: Unauthorized
 */
applicationRouter.get("/:id", authMiddleware, applicationController.getApplication);
applicationRouter.delete("/:id", authMiddleware, applicationController.deleteApplication);

/**
 * @swagger
 * /api/applications/{id}/approve:
 *   post:
 *     summary: Explicit Human Approval action - approves draft and sends application email
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application approved and email dispatched
 *       400:
 *         description: Invalid status or missing recipient email
 */
applicationRouter.post("/:id/approve", authMiddleware, applicationController.approve);

/**
 * @swagger
 * /api/applications/{id}/reject:
 *   post:
 *     summary: Explicit Human Rejection action
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 example: "Candidate declined to apply to this role"
 *     responses:
 *       200:
 *         description: Application marked as rejected
 */
applicationRouter.post("/:id/reject", authMiddleware, applicationController.reject);

/**
 * @swagger
 * /api/applications/{id}/review:
 *   put:
 *     summary: Edit email draft before human approval
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipient:
 *                 type: string
 *                 example: "hr@company.com"
 *               subject:
 *                 type: string
 *                 example: "Application for MERN Developer - Karan Gade"
 *               body:
 *                 type: string
 *                 example: "Updated email cover letter content..."
 *     responses:
 *       200:
 *         description: Email draft updated successfully
 */
applicationRouter.put("/:id/review", authMiddleware, applicationController.editEmail);

/**
 * @swagger
 * /api/applications/{id}/resume:
 *   put:
 *     summary: Update or regenerate tailored resume for a specific job application
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               targetPageLength:
 *                 type: integer
 *                 example: 1
 *               pageCount:
 *                 type: integer
 *                 example: 1
 *               regenerate:
 *                 type: boolean
 *                 example: true
 *               tailoredResumeData:
 *                 type: object
 *               template:
 *                 type: string
 *                 example: "modern"
 *     responses:
 *       200:
 *         description: Resume updated or regenerated successfully
 *       404:
 *         description: Application not found
 */
applicationRouter.put("/:id/resume", authMiddleware, applicationController.updateResume);

/**
 * @swagger
 * /api/applications/{id}/pdf:
 *   get:
 *     summary: Download or stream the tailored PDF resume for an application
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF file stream
 *       404:
 *         description: PDF resume not found
 */
applicationRouter.get("/:id/pdf", optionalAuthMiddleware, applicationController.downloadPdf);

export default applicationRouter;
