import express from 'express';
import {
  getNaukriStatusController,
  connectNaukriController,
  disconnectNaukriController,
} from '../controller/naukriAccount.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/status', getNaukriStatusController);
router.post('/connect', connectNaukriController);
router.post('/disconnect', disconnectNaukriController);

export default router;
