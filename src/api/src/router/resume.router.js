import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { upload, uploadResume, getMyResumes, getSingleResume, saveResumeData, generateResumePdfController, deleteResumeController, downloadOriginalResume } from '../controller/resume.controller.js';

const router = Router();

router.post('/save', authMiddleware, saveResumeData);
router.post('/generate-pdf', authMiddleware, generateResumePdfController);
router.delete('/:id', authMiddleware, deleteResumeController);
router.get('/:id/download', authMiddleware, downloadOriginalResume);

/**
 * @swagger
 * /api/resume/upload:
 *   post:
 *     summary: Upload and parse resume file using AI Agent
 *     tags: [Resume]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - resume
 *             properties:
 *               token:
 *                 type: string
 *                 description: JWT token for authentication
 *               resume:
 *                 type: string
 *                 format: binary
 *                 description: Resume PDF or DOC file (strictly less than 5MB)
 *     responses:
 *       201:
 *         description: Resume uploaded, parsed by AI, and stored in MongoDB
 *       400:
 *         description: Invalid file type or file size exceeds 5MB
 *       401:
 *         description: Unauthorized - missing or invalid token
 *       500:
 *         description: Internal server or AI parsing error
 */
router.post('/upload', upload.single('resume'), authMiddleware, uploadResume);

/**
 * @swagger
 * /api/resume:
 *   get:
 *     summary: Get all resumes uploaded by authenticated user
 *     tags: [Resume]
 *     responses:
 *       200:
 *         description: List of user resumes
 */
router.get('/', authMiddleware, getMyResumes);

/**
 * @swagger
 * /api/resume/{id}:
 *   get:
 *     summary: Get specific resume details by ID
 *     tags: [Resume]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resume detail object
 *       404:
 *         description: Resume not found
 */
router.get('/:id', authMiddleware, getSingleResume);

export default router;
