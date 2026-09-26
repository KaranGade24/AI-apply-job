import { resolveFromProfile } from './profileAnswerResolver.js';
import { resolveFromResume } from './resumeAnswerResolver.js';
import { resolveFromAi } from './aiAnswerResolver.js';
import { classifyQuestionCategory, normalizeQuestionText } from '../form/formNormalizer.js';
import { QUESTION_CATEGORIES } from '../form/fieldTypes.js';

/**
 * Resolves all fields on an application form using multi-level matching:
 * Level 1: Deterministic User Profile
 * Level 2: Verified Resume Facts
 * Level 3: User Settings & Past Answers
 * Level 4: AI Subjective Reasoning (Grounded)
 * Level 5: Unanswered -> Flagged as Missing Questions (Sent to Frontend)
 *
 * @param {Array<object>} fields - Fields extracted by Form Inspector
 * @param {object} context
 * @param {Array<object>} [context.userAnswers] - Prior user-approved answers
 * @param {object} context.userProfile
 * @param {object} context.user
 * @param {object} context.userSetting
 * @param {object} context.resumeData
 * @param {object} context.job
 * @returns {Promise<{ resolvedAnswers: Array<object>, missingQuestions: Array<object> }>}
 */
export const resolveAllFormAnswers = async (fields = [], context = {}) => {
  const {
    userAnswers = [],
    userProfile = {},
    user = {},
    userSetting = {},
    resumeData = {},
    job = {},
  } = context;

  const resolvedAnswers = [];
  const missingQuestions = [];

  // Map of previously supplied answers by questionId or fieldId
  const priorAnswerMap = new Map();
  userAnswers.forEach((ans) => {
    if (ans.questionId) priorAnswerMap.set(ans.questionId, ans);
    if (ans.fieldId) priorAnswerMap.set(ans.fieldId, ans);
  });

  for (const field of fields) {
    const qId = field.questionId;
    const fId = field.fieldId;

    // Check if user already provided/confirmed this answer (e.g. from Checkpoint 1)
    if (priorAnswerMap.has(qId) || priorAnswerMap.has(fId)) {
      const prior = priorAnswerMap.get(qId) || priorAnswerMap.get(fId);
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: prior.answer ?? prior.value,
        source: 'user',
        confidence: 1,
        userConfirmed: true,
        options: field.options || [],
      });
      continue;
    }

    // Level 1: Deterministic User Profile
    const profileRes = resolveFromProfile(field, userProfile, user, userSetting);
    if (profileRes.resolved) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: profileRes.value,
        source: profileRes.source,
        confidence: profileRes.confidence,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 2 & 3: Verified Resume facts
    const resumeRes = resolveFromResume(field, resumeData, job);
    if (resumeRes.resolved) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: resumeRes.value,
        source: resumeRes.source,
        confidence: resumeRes.confidence,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 3: User Settings (Notice period, Relocation preferences)
    const category = classifyQuestionCategory(field.question);
    if (category === QUESTION_CATEGORIES.NOTICE_PERIOD) {
      const notice = userSetting?.noticePeriod || 'Immediate';
      let selectedOption = notice;
      if (Array.isArray(field.options) && field.options.length > 0) {
        selectedOption =
          field.options.find((opt) => normalizeQuestionText(opt).includes('immediate') || opt.includes('15') || opt.includes('30')) ||
          field.options[0];
      }
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: selectedOption,
        source: 'setting',
        confidence: 0.95,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 4: Subjective AI reasoning (for open-ended pitch or motivation questions)
    if (category === QUESTION_CATEGORIES.SUBJECTIVE) {
      const aiRes = await resolveFromAi(field, { job, userProfile, resumeData });
      if (aiRes.resolved) {
        resolvedAnswers.push({
          questionId: qId,
          fieldId: fId,
          question: field.question,
          type: field.type,
          answer: aiRes.value,
          source: aiRes.source,
          confidence: aiRes.confidence,
          userConfirmed: false,
          options: field.options || [],
        });
        continue;
      }
    }

    // Level 5: Ambiguous / Unknown question -> DO NOT GUESS! Flag as Missing Question (Checkpoint 1)
    missingQuestions.push({
      questionId: qId,
      fieldId: fId,
      question: field.question,
      type: field.type,
      required: Boolean(field.required),
      options: field.options || [],
      placeholder: field.placeholder || '',
    });
  }

  return {
    resolvedAnswers,
    missingQuestions,
  };
};
