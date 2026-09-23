import express from 'express';
import { getSettingsHandler, updateSettingsHandler } from '../controller/setting.controller.js';
import { optionalAuthMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

/**
 * @swagger
 * /api/settings:
 *   get:
 *     summary: Get all settings for current user
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: User settings
 *   put:
 *     summary: Update settings for current user
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Settings updated
 */
router.get('/', optionalAuthMiddleware, getSettingsHandler);
router.put('/', optionalAuthMiddleware, updateSettingsHandler);

export default router;
