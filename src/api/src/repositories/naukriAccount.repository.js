import { NaukriAccount } from '../model/NaukriAccount.js';
import { logError } from '../utils/logger.js';

/**
 * Finds Naukri account record by user ID
 * @param {string} userId
 * @returns {Promise<import('../model/NaukriAccount.js').default|null>}
 */
export const findNaukriAccountByUserId = async (userId) => {
  try {
    if (!userId) return null;
    return await NaukriAccount.findOne({ userId });
  } catch (error) {
    await logError('naukriAccountRepository.findNaukriAccountByUserId', error.message);
    throw error;
  }
};

/**
 * Upserts a Naukri account record for a user
 * @param {string} userId
 * @param {object} accountData
 * @returns {Promise<import('../model/NaukriAccount.js').default>}
 */
export const upsertNaukriAccount = async (userId, accountData) => {
  try {
    if (!userId) throw new Error('Cannot upsert NaukriAccount without valid userId');
    return await NaukriAccount.findOneAndUpdate(
      { userId },
      {
        $set: {
          ...accountData,
          userId,
          source: 'naukri'
        }
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    await logError('naukriAccountRepository.upsertNaukriAccount', error.message);
    throw error;
  }
};

/**
 * Updates status and last validation timestamp of a user's Naukri account
 * @param {string} userId
 * @param {string} status
 * @param {Date} [lastValidatedAt]
 */
export const updateNaukriAccountStatus = async (userId, status, lastValidatedAt = new Date()) => {
  try {
    return await NaukriAccount.findOneAndUpdate(
      { userId },
      {
        $set: {
          status,
          lastValidatedAt
        }
      },
      { returnDocument: 'after' }
    );
  } catch (error) {
    await logError('naukriAccountRepository.updateNaukriAccountStatus', error.message);
    throw error;
  }
};

/**
 * Disconnects/deletes a user's Naukri account session
 * @param {string} userId
 */
export const deleteNaukriAccountByUserId = async (userId) => {
  try {
    return await NaukriAccount.findOneAndUpdate(
      { userId },
      {
        $set: {
          encryptedStorageState: {
            algorithm: 'aes-256-gcm',
            iv: '',
            authTag: '',
            cipherText: ''
          },
          status: 'disconnected',
          userName: '',
          userEmail: '',
          lastValidatedAt: null
        }
      },
      { returnDocument: 'after' }
    );
  } catch (error) {
    await logError('naukriAccountRepository.deleteNaukriAccountByUserId', error.message);
    throw error;
  }
};

export default {
  findNaukriAccountByUserId,
  upsertNaukriAccount,
  updateNaukriAccountStatus,
  deleteNaukriAccountByUserId
};
