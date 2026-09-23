import express from 'express';
import { getSkippedApplicationsController } from '../controller/skippedApplication.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const skippedApplicationRouter = express.Router();

/**
 * @swagger
 * /api/skipped-applications:
 *   get:
 *     summary: Retrieve list of skipped job applications with reasons
 *     tags: [SkippedApplications]
 *     parameters:
 *       - in: query
 *         name: skipReason
 *         schema:
 *           type: string
 *           enum: [SKILL_MISMATCH, LOCATION_MISMATCH, UNSUPPORTED_METHOD, CONFIG_MISMATCH, KEYWORD_MISMATCH, EXPERIENCE_MISMATCH, WORK_MODE_MISMATCH, ALREADY_EXISTS, OTHER]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of skipped applications
 *       401:
 *         description: Unauthorized
 */
skippedApplicationRouter.get('/', authMiddleware, getSkippedApplicationsController);

export default skippedApplicationRouter;
