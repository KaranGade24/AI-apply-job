import { getUserSettingsService, updateUserSettingsService } from '../services/setting.service.js';
import { appError } from '../utils/errors.js';

export const getSettingsHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.query?.userId || 'default_user';
    const settings = await getUserSettingsService(userId);
    return res.status(200).json({
      status: 'success',
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

export const updateSettingsHandler = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.body?.userId || 'default_user';
    const updateData = req.body;
    if (!updateData) {
      throw new appError('Update data is required', 400);
    }
    const updated = await updateUserSettingsService(userId, updateData);
    return res.status(200).json({
      status: 'success',
      message: 'Settings updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};
