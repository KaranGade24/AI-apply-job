import { ApplicationQuestion } from "../model/ApplicationQuestion.js";
import { logError } from "../utils/logger.js";

/**
 * Upserts a question encountered by the browser agent
 * @param {string} applicationId
 * @param {object} questionData
 * @returns {Promise<object>}
 */
export const upsertApplicationQuestion = async (applicationId, questionData) => {
  try {
    const filter = { applicationId, questionId: questionData.questionId };
    const update = {
      $set: {
        ...questionData,
        applicationId,
        updatedAt: new Date(),
      },
    };
    return await ApplicationQuestion.findOneAndUpdate(filter, update, {
      new: true,
      upsert: true,
    });
  } catch (error) {
    await logError("applicationQuestion.repository.upsertApplicationQuestion", error.message);
    throw error;
  }
};

/**
 * Retrieves all pending questions requiring human input for an application
 * @param {string} applicationId
 * @returns {Promise<Array>}
 */
export const getPendingHumanQuestions = async (applicationId) => {
  try {
    return await ApplicationQuestion.find({
      applicationId,
      status: "human_pending",
    }).lean();
  } catch (error) {
    await logError("applicationQuestion.repository.getPendingHumanQuestions", error.message);
    throw error;
  }
};

/**
 * Saves human-provided answer to a question and marks it resolved
 * @param {string} applicationId
 * @param {string} questionId
 * @param {any} answer
 * @returns {Promise<object>}
 */
export const resolveQuestionWithHumanAnswer = async (applicationId, questionId, answer) => {
  try {
    return await ApplicationQuestion.findOneAndUpdate(
      { applicationId, questionId },
      {
        $set: {
          resolvedAnswer: answer,
          currentAnswer: answer,
          status: "resolved",
          userConfirmed: true,
          "source.type": "human",
          "source.path": "userClarification",
          confidence: 1.0,
        },
      },
      { new: true }
    );
  } catch (error) {
    await logError("applicationQuestion.repository.resolveQuestionWithHumanAnswer", error.message);
    throw error;
  }
};

/**
 * Retrieves all questions for an application
 * @param {string} applicationId
 * @returns {Promise<Array>}
 */
export const getQuestionsByApplicationId = async (applicationId) => {
  try {
    return await ApplicationQuestion.find({ applicationId }).lean();
  } catch (error) {
    await logError("applicationQuestion.repository.getQuestionsByApplicationId", error.message);
    throw error;
  }
};
