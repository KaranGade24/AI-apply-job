import { Router } from 'express';
import { getProfile, updateProfile, saveAnswer, syncFromResume } from '../controller/profile.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', getProfile);
router.put('/', updateProfile);
router.post('/answers', saveAnswer);
router.post('/sync-resume', syncFromResume);

export default router;
