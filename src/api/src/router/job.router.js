import express from 'express';
import { discoverJobsController, getSavedJobsController } from '../controller/job.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const jobRouter = express.Router();

/**
 * @swagger
 * /api/jobs/discover:
 *   post:
 *     summary: Discover, parse, filter, and match jobs against candidate resume
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               sources:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["jobViaReferral", "naukri", "linkedin"]
 *               keywords:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["MERN Developer", "Node.js Developer", "Backend Developer"]
 *               locations:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Pune", "Remote"]
 *               experience:
 *                 type: object
 *                 properties:
 *                   min:
 *                     type: number
 *                     example: 0
 *                   max:
 *                     type: number
 *                     example: 1
 *               workMode:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["remote", "hybrid", "workFromOffice"]
 *               employmentType:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["fullTime"]
 *               preferredApplicationMethods:
 *                 type: array
 *                 description: Preferred application methods to filter discovered jobs (e.g., email, googleForm, websiteForm, phone, unknown)
 *                 items:
 *                   type: string
 *                 example: ["email", "googleForm", "phone", "unknown"]
 *               preferredMethods:
 *                 type: array
 *                 description: Alias for preferredApplicationMethods
 *                 items:
 *                   type: string
 *                 example: ["email", "googleForm", "phone"]
 *               postedWithin:
 *                 type: string
 *                 example: "24h"
 *               maxJobs:
 *                 type: number
 *                 example: 20
 *     responses:
 *       200:
 *         description: Job discovery and candidate resume matching successful
 *       401:
 *         description: Unauthorized or missing JWT token
 *       500:
 *         description: Internal server error
 */
jobRouter.post('/discover', authMiddleware, discoverJobsController);

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: Retrieve saved/matched jobs from database
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: matchStatus
 *         schema:
 *           type: string
 *           enum: [MATCHED, NOT_MATCHED, PENDING_MATCH]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of saved jobs
 *       401:
 *         description: Unauthorized
 */
jobRouter.get('/', authMiddleware, getSavedJobsController);

export default jobRouter;
