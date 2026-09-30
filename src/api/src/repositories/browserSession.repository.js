import { JobApplication } from '../model/JobApplication.js';
import { logError } from '../utils/logger.js';
import { encryptValue, decryptValue } from '../utils/encryption.js';

/**
 * Repository for persisting and retrieving browser session storage states and pending human actions securely with AES-256-GCM.
 */
export class BrowserSessionRepository {
  /**
   * Saves browser session state and pending human action details (encrypting storageState).
   *
   * @param {string} applicationId
   * @param {object} sessionData
   * @param {string} [sessionData.savedUrl]
   * @param {object} [sessionData.savedStorageState]
   * @param {string} [sessionData.reason]
   * @returns {Promise<object|null>}
   */
  static async saveBrowserSessionState(applicationId, sessionData = {}) {
    if (!applicationId) return null;
    try {
      const updateData = {};
      if (sessionData.savedUrl !== undefined) {
        updateData['workflow.agentState.pendingHumanAction.savedUrl'] = sessionData.savedUrl;
      }
      if (sessionData.savedStorageState !== undefined) {
        const stateToEncrypt = typeof sessionData.savedStorageState === 'string'
          ? sessionData.savedStorageState
          : JSON.stringify(sessionData.savedStorageState);
        updateData['workflow.agentState.pendingHumanAction.savedStorageState'] = encryptValue(stateToEncrypt);
      }
      if (sessionData.reason !== undefined) {
        updateData['workflow.agentState.pendingHumanAction.reason'] = sessionData.reason;
      }
      updateData.updatedAt = new Date();

      return await JobApplication.findByIdAndUpdate(
        applicationId,
        { $set: updateData },
        { new: true }
      );
    } catch (error) {
      await logError('BrowserSessionRepository.saveBrowserSessionState', error.message);
      return null;
    }
  }

  /**
   * Retrieves and decrypts browser session storage state.
   *
   * @param {string} applicationId
   * @returns {Promise<object|null>}
   */
  static async getBrowserSessionState(applicationId) {
    if (!applicationId) return null;
    try {
      const app = await JobApplication.findById(applicationId).lean();
      const pendingAction = app?.workflow?.agentState?.pendingHumanAction;
      if (pendingAction && pendingAction.savedStorageState?.cipherText) {
        try {
          const decrypted = decryptValue(pendingAction.savedStorageState);
          pendingAction.savedStorageState = JSON.parse(decrypted);
        } catch (decryptErr) {
          await logError('BrowserSessionRepository.getBrowserSessionState.decrypt', decryptErr.message);
        }
      }
      return pendingAction;
    } catch (error) {
      await logError('BrowserSessionRepository.getBrowserSessionState', error.message);
      return null;
    }
  }

  /**
   * Clears saved browser session state upon successful resume.
   *
   * @param {string} applicationId
   * @returns {Promise<object|null>}
   */
  static async clearBrowserSessionState(applicationId) {
    if (!applicationId) return null;
    try {
      return await JobApplication.findByIdAndUpdate(
        applicationId,
        {
          $set: {
            'workflow.agentState.pendingHumanAction': null,
            updatedAt: new Date()
          }
        },
        { new: true }
      );
    } catch (error) {
      await logError('BrowserSessionRepository.clearBrowserSessionState', error.message);
      return null;
    }
  }
}

export default BrowserSessionRepository;
