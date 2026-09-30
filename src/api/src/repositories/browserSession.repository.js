import { BrowserSession } from "../model/BrowserSession.js";
import { logError } from "../utils/logger.js";

/**
 * Creates or updates a browser session record
 * @param {object} sessionData
 * @returns {Promise<object>}
 */
export const upsertBrowserSession = async (sessionData) => {
  try {
    const filter = { sessionId: sessionData.sessionId };
    const update = {
      $set: {
        ...sessionData,
        updatedAt: new Date(),
      },
    };
    return await BrowserSession.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
    });
  } catch (error) {
    await logError("browserSession.repository.upsertBrowserSession", error.message);
    throw error;
  }
};

/**
 * Finds an active browser session by application ID
 * @param {string} applicationId
 * @returns {Promise<object>}
 */
export const getActiveSessionByApplicationId = async (applicationId) => {
  try {
    return await BrowserSession.findOne({
      applicationId,
      status: { $in: ["active", "paused"] },
    }).lean();
  } catch (error) {
    await logError("browserSession.repository.getActiveSessionByApplicationId", error.message);
    throw error;
  }
};

/**
 * Updates session checkpoint for crash recovery
 * @param {string} sessionId
 * @param {object} checkpoint
 * @param {string} [screenshotPath]
 * @returns {Promise<object>}
 */
export const updateSessionCheckpoint = async (sessionId, checkpoint, screenshotPath = null) => {
  try {
    const update = {
      $set: {
        lastCheckpoint: checkpoint,
        updatedAt: new Date(),
      },
    };
    if (screenshotPath) {
      update.$set.lastScreenshotPath = screenshotPath;
    }
    return await BrowserSession.findOneAndUpdate({ sessionId }, update, { new: true });
  } catch (error) {
    await logError("browserSession.repository.updateSessionCheckpoint", error.message);
    throw error;
  }
};

/**
 * Marks session status (e.g. paused, closed, disconnected)
 * @param {string} sessionId
 * @param {string} status
 * @returns {Promise<object>}
 */
export const updateSessionStatus = async (sessionId, status) => {
  try {
    return await BrowserSession.findOneAndUpdate(
      { sessionId },
      { $set: { status, updatedAt: new Date() } },
      { new: true }
    );
  } catch (error) {
    await logError("browserSession.repository.updateSessionStatus", error.message);
    throw error;
  }
};
