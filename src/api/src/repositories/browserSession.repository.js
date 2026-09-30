import { JobApplication } from '../model/JobApplication.js';
import { logError } from '../utils/logger.js';
import { encryptValue, decryptValue } from '../utils/encryption.js';

/**
 * Repository for persisting and retrieving browser session storage states and pending human actions securely with AES-256-GCM.
 */
export class BrowserSessionRepository {
  /**
   * Helper that encrypts storage state object or string using AES-256-GCM
   *
   * @param {any} state
   * @returns {object|null}
   */
  static encryptStorageState(state) {
    if (!state) return null;
    if (typeof state === 'object' && state !== null && state.cipherText && state.iv && state.authTag) {
      return state;
    }
    const serialized = typeof state === 'string' ? state : JSON.stringify(state);
    return encryptValue(serialized);
  }

  /**
   * Helper that decrypts an encrypted storage state object or returns legacy plaintext/parsed JSON
   * Tolerant of both legacy plaintext and encrypted objects.
   *
   * @param {any} savedStorageState
   * @returns {object|null}
   */
  static decryptStorageState(savedStorageState) {
    if (!savedStorageState) return null;

    // Check if it is an encrypted object payload { cipherText, iv, authTag }
    if (typeof savedStorageState === 'object' && savedStorageState !== null) {
      if (savedStorageState.cipherText && savedStorageState.iv && savedStorageState.authTag) {
        try {
          const decrypted = decryptValue(savedStorageState);
          return JSON.parse(decrypted);
        } catch (decryptErr) {
          logError('BrowserSessionRepository.decryptStorageState', decryptErr.message);
          return null;
        }
      }
      // Already plain JSON object (legacy document)
      return savedStorageState;
    }

    // If it's a string, attempt to parse
    if (typeof savedStorageState === 'string') {
      try {
        const parsed = JSON.parse(savedStorageState);
        if (parsed && typeof parsed === 'object' && parsed.cipherText && parsed.iv && parsed.authTag) {
          const decrypted = decryptValue(parsed);
          return JSON.parse(decrypted);
        }
        return parsed;
      } catch {
        return savedStorageState;
      }
    }

    return savedStorageState;
  }

  /**
   * Saves storageState directly into workflow.agentState.pendingHumanAction.savedStorageState with AES-256-GCM encryption.
   *
   * @param {string} applicationId
   * @param {object|string} state
   * @returns {Promise<object|null>}
   */
  static async saveStorageState(applicationId, state) {
    if (!applicationId || !state) return null;
    try {
      const stateToEncrypt = typeof state === 'string' ? state : JSON.stringify(state);
      const encrypted = encryptValue(stateToEncrypt);

      return await JobApplication.findByIdAndUpdate(
        applicationId,
        {
          $set: {
            'workflow.agentState.pendingHumanAction.savedStorageState': encrypted,
            updatedAt: new Date(),
          },
        },
        { new: true }
      );
    } catch (error) {
      await logError('BrowserSessionRepository.saveStorageState', error.message);
      return null;
    }
  }

  /**
   * Loads and decrypts storageState for an application.
   * Tolerates both encrypted and legacy plaintext formats.
   *
   * @param {string} applicationId
   * @returns {Promise<object|null>}
   */
  static async loadStorageState(applicationId) {
    if (!applicationId) return null;
    try {
      const app = await JobApplication.findById(applicationId).lean();
      const raw = app?.workflow?.agentState?.pendingHumanAction?.savedStorageState;
      return BrowserSessionRepository.decryptStorageState(raw);
    } catch (error) {
      await logError('BrowserSessionRepository.loadStorageState', error.message);
      return null;
    }
  }

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
      if (sessionData.savedStorageState !== undefined && sessionData.savedStorageState !== null) {
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
      if (pendingAction) {
        return {
          ...pendingAction,
          savedStorageState: BrowserSessionRepository.decryptStorageState(pendingAction.savedStorageState),
        };
      }
      return null;
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
            updatedAt: new Date(),
          },
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
