import express from 'express';
import {
  getStatus,
  saveSession,
  disconnect,
} from '../controller/googleSession.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const googleSessionRouter = express.Router();

googleSessionRouter.get('/status', authMiddleware, getStatus);
googleSessionRouter.post('/session', authMiddleware, saveSession);
googleSessionRouter.post('/disconnect', authMiddleware, disconnect);

export default googleSessionRouter;
