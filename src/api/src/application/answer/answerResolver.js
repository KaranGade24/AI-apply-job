import { resolveFromProfile } from './profileAnswerResolver.js';
import { resolveFromResume } from './resumeAnswerResolver.js';
import { resolveFromAi, resolveBatchAiAnswers } from './aiAnswerResolver.js';
import { resolveFromHuman, persistMissingQuestionsForUser } from './humanAnswerResolver.js';
import { classifyQuestionCategory, normalizeQuestionText } from '../form/formNormalizer.js';
import { FIELD_TYPES, QUESTION_CATEGORIES } from '../form/fieldTypes.js';

/**
 * Resolves all fields on an application form using multi-level matching:
 * Level 1: Deterministic User Profile
 * Level 2: Verified Resume Facts
 * Level 3: User Settings & Past Answers
 * Level 4: AI Subjective Reasoning (Grounded)
 * Level 5: Direct Candidate Human Input (if previously answered)
 * Level 6: Ambiguous / Unanswered -> Flagged as Missing Questions (persisted for user review)
 *
 * @param {Array<object>} fields - Fields extracted by Form Inspector
 * @param {object} context
 * @param {Array<object>} [context.userAnswers] - Prior user-approved answers
 * @param {object} context.userProfile
 * @param {object} context.user
 * @param {object} context.userSetting
 * @param {object} context.resumeData
 * @param {object} context.job
 * @param {string} [context.applicationId] - Application ID to persist missing questions if needed
 * @param {boolean} [context.autoPersistMissing=false] - Whether to automatically persist missing questions to DB
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
    applicationId = null,
    autoPersistMissing = false,
  } = context;

  const resolvedAnswers = [];
  const missingQuestions = [];
  const subjectiveFieldsToBatch = [];

  // Map of previously supplied answers by questionId or fieldId
  const priorAnswerMap = new Map();
  userAnswers.forEach((ans) => {
    if (ans.questionId) priorAnswerMap.set(ans.questionId, ans);
    if (ans.fieldId) priorAnswerMap.set(ans.fieldId, ans);
  });

  // Automatically resolve single verified candidate password for both Password & Verify Password
  let candidatePortalPassword = null;
  for (const [key, val] of priorAnswerMap.entries()) {
    if (/password/i.test(key) && (val.answer || val.value)) {
      candidatePortalPassword = val.answer || val.value;
      break;
    }
  }
  if (!candidatePortalPassword) {
    candidatePortalPassword =
      userSetting?.portalPassword ||
      userSetting?.defaultPassword ||
      userProfile?.portalPassword;
  }
  if (!candidatePortalPassword) {
    const rawCompany = (job?.company || 'Velsera').replace(/[^a-zA-Z0-9]/g, '');
    const companyPart =
      (rawCompany.charAt(0).toUpperCase() + rawCompany.slice(1).toLowerCase()).slice(0, 10) || 'Velsera';
    candidatePortalPassword = `Applicant@${companyPart}2026!`;
  }

  for (const field of fields) {
    const qId = field.questionId;
    const fId = field.fieldId;

    // Check if user already provided/confirmed this answer (e.g. from Checkpoint 1 or review edits)
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

    // Direct check via human resolver
    const humanRes = resolveFromHuman(field, userAnswers);
    if (humanRes.resolved) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: humanRes.value,
        source: humanRes.source,
        confidence: humanRes.confidence,
        userConfirmed: true,
        options: field.options || [],
      });
      continue;
    }

    // Level 0: Terms of Use / Agreement Checkbox
    const isTerms =
      field.isTermsAgreement ||
      (field.type === FIELD_TYPES.CHECKBOX &&
        /terms|privacy|policy|consent|acknowledge|agree|accept|conditions|statement/i.test(field.question || '')) ||
      (field.type === FIELD_TYPES.CHECKBOX &&
        /terms|privacy|policy|consent|agree|accept/i.test(field.name || '')) ||
      (field.type === FIELD_TYPES.CHECKBOX &&
        /terms|privacy|policy|consent|agree|accept/i.test(field.fieldId || '')) ||
      (field.type === FIELD_TYPES.CHECKBOX &&
        fields.some((f) => f.type === FIELD_TYPES.PASSWORD || /password/i.test(f.question || '')));

    if (isTerms) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: FIELD_TYPES.CHECKBOX,
        answer: 'true',
        source: 'setting',
        confidence: 1.0,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 0.5: Candidate Account Creation Password (Password AND Verify Password receive identical password)
    const isPasswordField =
      field.type === FIELD_TYPES.PASSWORD ||
      field.type === 'password' ||
      /password/i.test(field.question || '') ||
      /password/i.test(field.name || '') ||
      /password/i.test(field.fieldId || '');

    if (isPasswordField) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: 'password',
        answer: candidatePortalPassword,
        source: userSetting?.portalPassword ? 'setting' : 'profile',
        confidence: 1.0,
        userConfirmed: false,
        options: [],
      });
      continue;
    }

    // Level 1: Deterministic User Profile (NO LLM)
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

    // Level 2: Verified Resume facts (NO LLM)
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

    // Level 3: User Settings (Notice period, Relocation preferences - NO LLM)
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

    // Level 3.5: Sensitive / Legal Guard (Never invent sponsorship, citizenship, demographic, or criminal answers)
    const { guardSensitiveQuestion } = await import('../../browser/safety/sensitiveQuestionGuard.js');
    const sensitiveCheck = guardSensitiveQuestion(field, { ...userProfile, preferences: userSetting });
    if (sensitiveCheck.isSensitive && !sensitiveCheck.canAutoResolve) {
      missingQuestions.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        required: Boolean(field.required),
        options: field.options || [],
        placeholder: field.placeholder || '',
        reason: sensitiveCheck.reason,
      });
      continue;
    }

    // Level 4: Subjective AI questions (e.g. "Why are you interested in this position?")
    // Collect for ONE single batch LLM call across all subjective questions on this page
    if (category === QUESTION_CATEGORIES.SUBJECTIVE) {
      subjectiveFieldsToBatch.push(field);
      continue;
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

  // Resolve ALL subjective questions in ONE single batch LLM call
  if (subjectiveFieldsToBatch.length > 0) {
    const batchAiAnswers = await resolveBatchAiAnswers(subjectiveFieldsToBatch, {
      job,
      userProfile,
      resumeData,
    });

    for (const field of subjectiveFieldsToBatch) {
      const qId = field.questionId;
      const fId = field.fieldId;
      const answer = batchAiAnswers[qId] || batchAiAnswers[fId];

      if (answer && String(answer).trim().length > 0) {
        resolvedAnswers.push({
          questionId: qId,
          fieldId: fId,
          question: field.question,
          type: field.type,
          answer: String(answer).trim(),
          source: 'ai',
          confidence: 0.92,
          userConfirmed: false,
          options: field.options || [],
        });
      } else {
        // If AI could not resolve, send as missing question to user
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
    }
  }

  // Level 6: Persist missing questions if requested
  if (autoPersistMissing && applicationId && missingQuestions.length > 0) {
    await persistMissingQuestionsForUser({
      applicationId,
      missingQuestions,
    });
  }

  return {
    resolvedAnswers,
    missingQuestions,
  };
};
