import { GoogleAccount } from '../model/GoogleAccount.js';
import { GOOGLE_AUTH_STATUS } from '../constant/google.constant.js';
import { logError } from '../utils/logger.js';

/**
 * Finds Google account record by userId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export const findGoogleAccountByUserId = async (userId) => {
  try {
    return await GoogleAccount.findOne({ userId });
  } catch (error) {
    await logError('googleAccount.repository.findGoogleAccountByUserId', error.message);
    throw error;
  }
};

/**
 * Upserts a Google account record for a user
 * @param {string} userId
 * @param {object} accountData
 * @returns {Promise<object>}
 */
export const upsertGoogleAccount = async (userId, accountData) => {
  try {
    return await GoogleAccount.findOneAndUpdate(
      { userId },
      { $set: { ...accountData, userId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    await logError('googleAccount.repository.upsertGoogleAccount', error.message);
    throw error;
  }
};

/**
 * Updates status and validation timestamp
 * @param {string} userId
 * @param {string} status
 * @param {Date} [lastValidatedAt]
 * @returns {Promise<object|null>}
 */
export const updateGoogleAccountStatus = async (
  userId,
  status = GOOGLE_AUTH_STATUS.DISCONNECTED,
  lastValidatedAt = null
) => {
  try {
    const update = { status };
    if (lastValidatedAt) {
      update.lastValidatedAt = lastValidatedAt;
    }
    return await GoogleAccount.findOneAndUpdate(
      { userId },
      { $set: update },
      { new: true }
    );
  } catch (error) {
    await logError('googleAccount.repository.updateGoogleAccountStatus', error.message);
    throw error;
  }
};

/**
 * Deletes/disconnects Google account session for a user
 * @param {string} userId
 * @returns {Promise<object>}
 */
export const deleteGoogleAccountByUserId = async (userId) => {
  try {
    return await GoogleAccount.findOneAndDelete({ userId });
  } catch (error) {
    await logError('googleAccount.repository.deleteGoogleAccountByUserId', error.message);
    throw error;
  }
};
