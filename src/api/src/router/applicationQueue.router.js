import { Router } from 'express';
import {
  addToQueue,
  getQueue,
  pauseQueue,
  resumeQueue,
  cancelQueueItem,
  skipQueueItem,
  retryQueueItem,
  retryAllFailed,
  clearCompleted,
  getAnalytics,
} from '../controller/applicationQueue.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getQueue);
router.post('/add', addToQueue);
router.post('/pause', pauseQueue);
router.post('/resume', resumeQueue);
router.post('/:id/cancel', cancelQueueItem);
router.post('/:id/skip', skipQueueItem);
router.post('/:id/retry', retryQueueItem);
router.post('/retry-failed', retryAllFailed);
router.delete('/clear-completed', clearCompleted);
router.get('/analytics', getAnalytics);

export default router;
