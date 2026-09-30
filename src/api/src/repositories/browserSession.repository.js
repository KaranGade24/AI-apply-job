import { JobApplication } from '../model/JobApplication.js';
import { logError } from '../utils/logger.js';

/**
 * Repository for persisting and retrieving browser session storage states and pending human actions.
 */
export class BrowserSessionRepository {
  /**
   * Saves browser session state and pending human action details.
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
        updateData['workflow.agentState.pendingHumanAction.savedStorageState'] = sessionData.savedStorageState;
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
