import * as profileService from '../services/profile.service.js';

export const getProfile = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const profile = await profileService.getUserProfileService(userId);
    return res.status(200).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const updated = await profileService.updateUserProfileService(userId, req.body);
    return res.status(200).json({ success: true, message: 'Profile updated successfully', data: updated });
  } catch (error) {
    next(error);
  }
};

export const saveAnswer = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const answers = await profileService.saveReusableAnswerService(userId, req.body);
    return res.status(200).json({ success: true, message: 'Answer saved successfully', data: answers });
  } catch (error) {
    next(error);
  }
};

export const syncFromResume = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const profile = await profileService.syncProfileFromResumeService(userId);
    return res.status(200).json({ success: true, message: 'Profile synced from resume successfully', data: profile });
  } catch (error) {
    next(error);
  }
};
