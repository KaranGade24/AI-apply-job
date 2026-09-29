import { JobApplication } from '../../model/JobApplication.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';
import { updateApplicationStatus } from '../../repositories/application.repository.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Level 6 in the Answer Resolution hierarchy: Human in the loop.
 *
 * Persists unresolved/ambiguous questions to the database for candidate input,
 * transitions the application to WAITING_FOR_USER, and reconciles answers once
 * the candidate responds.
 */

/**
 * Persists missing questions and transitions application status to WAITING_FOR_USER.
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {Array<object>} params.missingQuestions
 * @param {string} [params.reason]
 * @returns {Promise<boolean>}
 */
export const persistMissingQuestionsForUser = async ({ applicationId, missingQuestions = [], reason = null }) => {
  if (!applicationId || missingQuestions.length === 0) return false;

  try {
    await JobApplication.findByIdAndUpdate(applicationId, {
      'form.missingQuestions': missingQuestions,
      status: APPLICATION_STATUS.WAITING_FOR_USER,
    });

    await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_USER, {
      logMessage: reason || `${missingQuestions.length} form questions require candidate answers.`,
    });

    await logJobEvent(
      'humanAnswerResolver',
      'WAITING_USER_INPUT',
      `App ${applicationId}: Paused for ${missingQuestions.length} user answers`
    );

    return true;
  } catch (error) {
    await logError('humanAnswerResolver.persistMissingQuestionsForUser', error.message);
    return false;
  }
};

/**
 * Checks if a field has an answer supplied directly by the candidate.
 *
 * @param {object} field
 * @param {Array<object>} userAnswers - List of { questionId, fieldId, answer }
 * @returns {{ resolved: boolean, value?: any, source?: string, confidence?: number }}
 */
export const resolveFromHuman = (field, userAnswers = []) => {
  if (!Array.isArray(userAnswers) || userAnswers.length === 0) {
    return { resolved: false };
  }

  const match = userAnswers.find(
    (ua) => (ua.questionId && ua.questionId === field.questionId) ||
            (ua.fieldId && ua.fieldId === field.fieldId) ||
            (ua.question && field.question && ua.question.toLowerCase().trim() === field.question.toLowerCase().trim())
  );

  if (match && match.answer !== undefined && match.answer !== null && match.answer !== '') {
    return {
      resolved: true,
      value: match.answer,
      source: 'human',
      confidence: 1.0,
    };
  }

  return { resolved: false };
};

/**
 * Reconciles previously missing questions with newly submitted candidate answers.
 *
 * @param {Array<object>} missingQuestions - List of pending questions
 * @param {Array<object>} submittedAnswers - List of { questionId, answer }
 * @returns {{ resolved: Array<object>, remaining: Array<object> }}
 */
export const reconcileHumanAnswers = (missingQuestions = [], submittedAnswers = []) => {
  const answerMap = new Map();
  for (const item of submittedAnswers) {
    if (item.questionId) answerMap.set(item.questionId, item.answer);
    if (item.fieldId) answerMap.set(item.fieldId, item.answer);
  }

  const resolved = [];
  const remaining = [];

  for (const q of missingQuestions) {
    const ans = answerMap.get(q.questionId) ?? answerMap.get(q.fieldId);
    if (ans !== undefined && ans !== null && ans !== '') {
      resolved.push({
        questionId: q.questionId,
        fieldId: q.fieldId,
        question: q.question,
        type: q.type,
        answer: ans,
        source: 'human',
        confidence: 1.0,
        userConfirmed: true,
        options: q.options || [],
      });
    } else {
      remaining.push(q);
    }
  }

  return { resolved, remaining };
};
