import { findSettingByUserId, createDefaultSetting, updateSettingByUserId } from '../repositories/setting.repository.js';
import { logError } from '../utils/logger.js';

export const getUserSettingsService = async (userId) => {
  try {
    let settings = await findSettingByUserId(userId);
    if (!settings) {
      settings = await createDefaultSetting(userId);
    }
    return settings;
  } catch (error) {
    logError(error, { context: 'getUserSettingsService', userId });
    throw error;
  }
};

export const updateUserSettingsService = async (userId, updateData) => {
  try {
    const updated = await updateSettingByUserId(userId, updateData);
    return updated;
  } catch (error) {
    logError(error, { context: 'updateUserSettingsService', userId });
    throw error;
  }
};
