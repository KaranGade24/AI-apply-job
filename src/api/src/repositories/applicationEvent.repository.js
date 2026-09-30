import { ApplicationEvent } from "../model/ApplicationEvent.js";
import { logError } from "../utils/logger.js";

/**
 * Creates and persists an audit event for an application action or state transition
 * @param {object} eventData
 * @returns {Promise<object>}
 */
export const recordApplicationEvent = async (eventData) => {
  try {
    const event = new ApplicationEvent(eventData);
    return await event.save();
  } catch (error) {
    await logError("applicationEvent.repository.recordApplicationEvent", error.message);
    throw error;
  }
};

/**
 * Retrieves audit events for a given application, sorted chronologically
 * @param {string} applicationId
 * @param {number} [limit=100]
 * @returns {Promise<Array>}
 */
export const getEventsByApplicationId = async (applicationId, limit = 100) => {
  try {
    return await ApplicationEvent.find({ applicationId })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();
  } catch (error) {
    await logError("applicationEvent.repository.getEventsByApplicationId", error.message);
    throw error;
  }
};
