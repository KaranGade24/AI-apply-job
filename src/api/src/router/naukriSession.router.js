import express from 'express';
import {
  connectNaukriController,
  getNaukriStatusController,
  saveManualLoginController,
  disconnectNaukriController
} from '../controller/naukriSession.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const naukriSessionRouter = express.Router();

/**
 * @swagger
 * /api/job-sources/naukri/connect:
 *   post:
 *     summary: Verify or initiate Naukri session connection
 *     tags: [Naukri]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection status result
 */
naukriSessionRouter.post('/connect', authMiddleware, connectNaukriController);

/**
 * @swagger
 * /api/job-sources/naukri/status:
 *   get:
 *     summary: Get current Naukri connection status
 *     tags: [Naukri]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Status info
 */
naukriSessionRouter.get('/status', authMiddleware, getNaukriStatusController);

/**
 * @swagger
 * /api/job-sources/naukri/save-session:
 *   post:
 *     summary: Verify and securely encrypt manual login session or imported cookies
 *     tags: [Naukri]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Session encrypted and saved
 */
naukriSessionRouter.post('/save-session', authMiddleware, saveManualLoginController);
naukriSessionRouter.post('/manual-login', authMiddleware, saveManualLoginController);

/**
 * @swagger
 * /api/job-sources/naukri/disconnect:
 *   post:
 *     summary: Disconnect and remove saved Naukri session
 *     tags: [Naukri]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Disconnected successfully
 */
naukriSessionRouter.post('/disconnect', authMiddleware, disconnectNaukriController);

export default naukriSessionRouter;
