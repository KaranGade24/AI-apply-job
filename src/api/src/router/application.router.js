import express from "express";
import * as applicationController from "../controller/application.controller.js";
import * as agentExecutionController from "../controller/agentExecution.controller.js";
import * as browserControlController from "../controller/browserControl.controller.js";
import {
  authMiddleware,
  optionalAuthMiddleware,
} from "../middlewares/auth.middleware.js";

const applicationRouter = express.Router();

/**
 * Browser Live Interaction & Human Control Routes
 */
applicationRouter.post(
  "/:id/agent/take-control",
  authMiddleware,
  browserControlController.takeControl,
);
applicationRouter.post(
  "/:id/agent/return-control",
  authMiddleware,
  browserControlController.returnControl,
);
applicationRouter.post(
  "/:id/agent/resume",
  authMiddleware,
  browserControlController.resumeAfterVerification,
);
applicationRouter.post(
  "/:id/agent/pause",
  authMiddleware,
  browserControlController.pauseAgent,
);
applicationRouter.post(
  "/:id/agent/stop",
  authMiddleware,
  browserControlController.stopAgent,
);
applicationRouter.post(
  "/:id/agent/browser-action",
  authMiddleware,
  browserControlController.dispatchAction,
);
applicationRouter.get(
  "/:id/agent/browser-frame",
  authMiddleware,
  browserControlController.getBrowserFrame,
);

/**
 * @swagger
 * /api/applications/{id}/agent/start:
 *   post:
 *     summary: Start or advance autonomous browser application workflow
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workflow initiated
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Already running
 */
applicationRouter.post(
  "/:id/agent/start",
  authMiddleware,
  agentExecutionController.startApplication,
);

/**
 * @swagger
 * /api/applications/{id}/agent/status:
 *   get:
 *     summary: Retrieve automation execution status and progress
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Current automation status
 */
applicationRouter.get(
  "/:id/agent/status",
  authMiddleware,
  agentExecutionController.getStatus,
);

/**
 * @swagger
 * /api/applications/{id}/agent/questions:
 *   get:
 *     summary: Retrieve pending human-in-the-loop questionnaire questions
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of pending questions
 */
applicationRouter.get(
  "/:id/agent/questions",
  authMiddleware,
  agentExecutionController.getQuestions,
);

applicationRouter.get(
  "/:id/agent/events",
  authMiddleware,
  agentExecutionController.getEvents,
);

/**
 * @swagger
 * /api/applications/{id}/agent/answers:
 *   post:
 *     summary: Submit human answers to pending questions and resume paused workflow
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Answers accepted and workflow resumed
 */
applicationRouter.post(
  "/:id/agent/answers",
  authMiddleware,
  agentExecutionController.submitAnswers,
);

/**
 * @swagger
 * /api/applications/{id}/agent/review:
 *   get:
 *     summary: Retrieve pre-submission summary and answers verification hash
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application review summary
 *   patch:
 *     summary: Apply edits to pre-submission review and return new reviewHash
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Review updated with new reviewHash
 */
applicationRouter.get(
  "/:id/agent/review",
  authMiddleware,
  agentExecutionController.getReview,
);
applicationRouter.patch(
  "/:id/agent/review",
  authMiddleware,
  agentExecutionController.updateReviewEdits,
);

/**
 * @swagger
 * /api/applications/{id}/agent/confirm:
 *   post:
 *     summary: Approve pre-submission review and execute final submission
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Final submission triggered
 */
applicationRouter.post(
  "/:id/agent/confirm",
  authMiddleware,
  agentExecutionController.confirmReview,
);

/**
 * @swagger
 * /api/applications/{id}/agent/cancel:
 *   post:
 *     summary: Cancel active application workflow
 *     tags: [Agent Execution]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workflow cancelled
 */
applicationRouter.post(
  "/:id/agent/cancel",
  authMiddleware,
  agentExecutionController.cancelApplication,
);

/* ==================== FIXED PATHS ==================== */

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
applicationRouter.post(
  "/process-next",
  authMiddleware,
  applicationController.processNext,
);

applicationRouter.post(
  "/",
  authMiddleware,
  applicationController.createApplicationDirect,
);
applicationRouter.post(
  "/preview-draft",
  authMiddleware,
  applicationController.previewDraft,
);
applicationRouter.get(
  "/job/:jobId",
  authMiddleware,
  applicationController.getApplicationByJob,
);

/**
 * @swagger
 * /api/applications/create-from-job/{jobId}:
 *   post:
 *     summary: Create application from specific job ID
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Application created successfully
 */
applicationRouter.post(
  "/create-from-job/:jobId",
  authMiddleware,
  applicationController.createFromJob,
);

/**
 * @swagger
 * /api/applications:
 *   get:
 *     summary: Get all applications for authenticated user
 *     tags: [Applications]
 *     responses:
 *       200:
 *         description: List of applications
 */
applicationRouter.get(
  "/",
  authMiddleware,
  applicationController.getApplications,
);

/* ==================== PARAMETER ROUTES (/:id) ==================== */

/**
 * @swagger
 * /api/applications/{id}:
 *   get:
 *     summary: Get single application details by ID
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Application details
 */
applicationRouter.get(
  "/:id",
  authMiddleware,
  applicationController.getApplication,
);

/**
 * @swagger
 * /api/applications/{id}:
 *   delete:
 *     summary: Delete a job application
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
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
applicationRouter.delete(
  "/:id",
  authMiddleware,
  applicationController.deleteApplication,
);

applicationRouter.patch(
  "/:id/status",
  authMiddleware,
  applicationController.updateStatusDirect,
);
applicationRouter.post(
  "/:id/tailor",
  authMiddleware,
  applicationController.tailorApplication,
);
applicationRouter.post(
  "/:id/answers",
  authMiddleware,
  applicationController.submitAnswers,
);
applicationRouter.put(
  "/:id/answers",
  authMiddleware,
  applicationController.saveAnswers,
);
applicationRouter.post(
  "/:id/refill-form",
  authMiddleware,
  applicationController.refillApplicationForm,
);
applicationRouter.post(
  "/:id/confirm",
  authMiddleware,
  applicationController.confirmFinal,
);
applicationRouter.post(
  "/:id/analyze-portal",
  authMiddleware,
  applicationController.analyzePortal,
);
applicationRouter.post(
  "/:id/advance-portal",
  authMiddleware,
  applicationController.advancePortalAction,
);
applicationRouter.post(
  "/:id/tailor-role",
  authMiddleware,
  applicationController.tailorRoleOutreach,
);
applicationRouter.post(
  "/:id/send-email-direct",
  authMiddleware,
  applicationController.sendDirectRoleEmail,
);
applicationRouter.post(
  "/:id/apply-roles-batch",
  authMiddleware,
  applicationController.applySelectedRolesBatch,
);
applicationRouter.post(
  "/:id/retry-google-form",
  authMiddleware,
  applicationController.retryGoogleForm,
);

/**
 * @swagger
 * /api/applications/{id}/approve:
 *   post:
 *     summary: Approve tailored resume/email draft and send outreach
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Outreach approved and processed successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
applicationRouter.post(
  "/:id/approve",
  authMiddleware,
  applicationController.approve,
);

/**
 * @swagger
 * /api/applications/{id}/reject:
 *   post:
 *     summary: Reject/archive application with optional reason
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
 *     responses:
 *       200:
 *         description: Application status marked as rejected/archived
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
applicationRouter.post(
  "/:id/reject",
  authMiddleware,
  applicationController.reject,
);

/**
 * @swagger
 * /api/applications/{id}/review:
 *   put:
 *     summary: Manually review and edit generated draft outreach email details
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipient:
 *                 type: string
 *               subject:
 *                 type: string
 *               body:
 *                 type: string
 *     responses:
 *       200:
 *         description: Email draft details updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
applicationRouter.put(
  "/:id/review",
  authMiddleware,
  applicationController.editEmail,
);

/**
 * @swagger
 * /api/applications/{id}/resume:
 *   put:
 *     summary: Upload or update tailored resume data for a job application
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tailoredResumeData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tailored resume data updated successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application not found
 */
applicationRouter.put(
  "/:id/resume",
  authMiddleware,
  applicationController.updateResume,
);

/**
 * @swagger
 * /api/applications/{id}/pdf:
 *   get:
 *     summary: Download the generated resume PDF for the application
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: PDF file data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Application or PDF not found
 */
applicationRouter.get(
  "/:id/pdf",
  authMiddleware,
  applicationController.downloadPdf,
);

applicationRouter.post(
  "/:id/open-tab",
  authMiddleware,
  applicationController.openTab,
);

export default applicationRouter;
