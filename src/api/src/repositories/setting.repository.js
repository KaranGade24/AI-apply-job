import { Setting } from '../model/Setting.js';

export const findSettingByUserId = async (userId) => {
  return await Setting.findOne({ userId });
};

export const createDefaultSetting = async (userId, customData = {}) => {
  const setting = new Setting({
    userId,
    ...customData,
  });
  return await setting.save();
};

export const updateSettingByUserId = async (userId, updateData) => {
  return await Setting.findOneAndUpdate(
    { userId },
    { $set: updateData },
    { new: true, upsert: true, runValidators: true }
  );
};
