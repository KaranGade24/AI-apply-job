import { JobApplication } from '../model/JobApplication.js';
import { logError } from '../utils/logger.js';

/**
 * Repository for persisting application workflow events and audit logs.
 */
export class ApplicationEventRepository {
  /**
   * Appends an event/log entry to the application's audit event trail.
   *
   * @param {string} applicationId
   * @param {string} eventType
   * @param {string} message
   * @returns {Promise<object|null>}
   */
  static async logApplicationEvent(applicationId, eventType, message) {
    if (!applicationId) return null;
    try {
      const eventRecord = {
        eventType,
        message,
        timestamp: new Date()
      };

      return await JobApplication.findByIdAndUpdate(
        applicationId,
        {
          $push: { 'workflow.events': eventRecord },
          $set: { updatedAt: new Date() }
        },
        { new: true }
      );
    } catch (error) {
      await logError('ApplicationEventRepository.logApplicationEvent', error.message);
      return null;
    }
  }
}

export default ApplicationEventRepository;
