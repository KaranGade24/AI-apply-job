import { ApplicationSession } from "../model/ApplicationSession.js";
import { logError, sanitizeSecrets } from "../utils/logger.js";
import { SESSION_TTL_MS, MAX_AGENT_STEPS } from "../constant/agent.constant.js";

/**
 * Repository for managing ApplicationSession state and history in MongoDB.
 */
export class ApplicationSessionRepository {
  /**
   * Creates or initializes a new ApplicationSession.
   *
   * @param {object} sessionData
   * @returns {Promise<object>}
   */
  static async createSession(sessionData) {
    try {
      const expiresAt = new Date(Date.now() + (SESSION_TTL_MS || 86400000));
      const session = new ApplicationSession({
        ...sessionData,
        expiresAt,
      });
      return await session.save();
    } catch (error) {
      await logError(
        "ApplicationSessionRepository.createSession",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Finds an active application session for a user and application.
   *
   * @param {string} applicationId
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  static async findSessionByApplicationId(applicationId, userId) {
    try {
      const query = { applicationId };
      if (userId) query.userId = userId;
      return await ApplicationSession.findOne(query).sort({ createdAt: -1 });
    } catch (error) {
      await logError(
        "ApplicationSessionRepository.findSessionByApplicationId",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Finds an application session by thread ID.
   *
   * @param {string} threadId
   * @param {string} [userId]
   * @returns {Promise<object|null>}
   */
  static async findSessionByThreadId(threadId, userId) {
    try {
      const query = { threadId };
      if (userId) query.userId = userId;
      return await ApplicationSession.findOne(query);
    } catch (error) {
      await logError(
        "ApplicationSessionRepository.findSessionByThreadId",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Updates an application session.
   *
   * @param {string} applicationId
   * @param {string} userId
   * @param {object} updateData
   * @returns {Promise<object|null>}
   */
  static async updateSession(applicationId, userId, updateData) {
    try {
      return await ApplicationSession.findOneAndUpdate(
        { applicationId, userId },
        { $set: updateData },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      await logError(
        "ApplicationSessionRepository.updateSession",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Appends an entry to session history (capped at MAX_AGENT_STEPS).
   *
   * @param {string} applicationId
   * @param {string} userId
   * @param {object} historyItem
   * @returns {Promise<object|null>}
   */
  static async appendHistory(applicationId, userId, historyItem) {
    try {
      const maxCap = MAX_AGENT_STEPS || 50;
      const safeDetails =
        historyItem.details && typeof historyItem.details === "object"
          ? JSON.parse(sanitizeSecrets(historyItem.details))
          : null;
      if (safeDetails && typeof safeDetails === "object") {
        delete safeDetails.value;
        delete safeDetails.fieldValue;
        delete safeDetails.rawHtml;
        delete safeDetails.html;
        delete safeDetails.screenshot;
        delete safeDetails.screenshotPath;
      }
      return await ApplicationSession.findOneAndUpdate(
        { applicationId, userId },
        {
          $push: {
            history: {
              $each: [
                {
                  timestamp: new Date(),
                  action: historyItem.action,
                  pageUrl: historyItem.pageUrl || "",
                  pageType: historyItem.pageType || "",
                  details: historyItem.details || null,
                },
              ],
              $slice: -maxCap,
            },
          },
          $inc: { stepCount: 1 },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      await logError(
        "ApplicationSessionRepository.appendHistory",
        error.message,
      );
      throw error;
    }
  }

  /**
   * Records an error in the session.
   *
   * @param {string} applicationId
   * @param {string} userId
   * @param {object} errorItem
   * @returns {Promise<object|null>}
   */
  static async recordError(applicationId, userId, errorItem) {
    try {
      return await ApplicationSession.findOneAndUpdate(
        { applicationId, userId },
        {
          $push: {
            errors: {
              timestamp: new Date(),
              step: errorItem.step || "",
              message: errorItem.message,
              stack: errorItem.stack || "",
            },
          },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      await logError("ApplicationSessionRepository.recordError", error.message);
      throw error;
    }
  }

  /**
   * Deactivates an application session upon completion or cancellation.
   *
   * @param {string} applicationId
   * @param {string} userId
   * @returns {Promise<object|null>}
   */
  static async deactivateSession(applicationId, userId) {
    try {
      return await ApplicationSession.findOneAndUpdate(
        { applicationId, userId },
        { $set: { isActive: false } },
        { new: true },
      );
    } catch (error) {
      await logError(
        "ApplicationSessionRepository.deactivateSession",
        error.message,
      );
      throw error;
    }
  }

  static async assertOwnership(applicationId, userId) {
    if (!userId) {
      throw new Error("Unauthorized");
    }
    const session = await ApplicationSession.findOne({ applicationId, userId })
      .select("_id")
      .lean();
    return session;
  }

  static async getHistory(
    applicationId,
    userId,
    limit = MAX_AGENT_STEPS || 50,
  ) {
    try {
      const session = await ApplicationSession.findOne({
        applicationId,
        userId,
      })
        .select("history")
        .lean();
      if (!session || !session.history) {
        return [];
      }
      return (session.history || []).slice(
        -Math.max(1, Math.min(limit, MAX_AGENT_STEPS || 50)),
      );
    } catch (error) {
      await logError("ApplicationSessionRepository.getHistory", error.message);
      return [];
    }
  }
}

export default ApplicationSessionRepository;
