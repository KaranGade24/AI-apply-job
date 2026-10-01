<<<<<<< HEAD
import { resolveFromProfile } from './profileAnswerResolver.js';
import { resolveFromResume } from './resumeAnswerResolver.js';
import { resolveFromAi, resolveBatchAiAnswers } from './aiAnswerResolver.js';
import { resolveFromHuman, persistMissingQuestionsForUser } from './humanAnswerResolver.js';
import { classifyQuestionCategory, normalizeQuestionText } from '../form/formNormalizer.js';
import { FIELD_TYPES, QUESTION_CATEGORIES } from '../form/fieldTypes.js';

// Sensitive/legal questions that must never be guessed or automated with generic defaults
const SENSITIVE_PATTERNS = [
  /gender|sex/i,
  /race|ethnicity|demographic/i,
  /disability|handicap/i,
  /veteran|military/i,
  /citizenship|visa|sponsorship|work\s+authorization|authorized\s+to\s+work/i,
  /background\s+check|drug\s+screen|convict/i,
  /social\s+security|national\s+id|ssn/i
];

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
    const qText = field.question || '';

    // Guardrail: Sensitive/legal questions must NEVER be guessed or automated
    const isSensitive = SENSITIVE_PATTERNS.some(pattern => pattern.test(qText));

    // Check if user already provided/confirmed this answer
    if (priorAnswerMap.has(qId) || priorAnswerMap.has(fId)) {
      const prior = priorAnswerMap.get(qId) || priorAnswerMap.get(fId);
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: prior.answer ?? prior.value,
        source: 'user',
        sourcePath: 'userAnswers',
        confidence: 1.0,
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
        sourcePath: 'userAnswers',
        confidence: humanRes.confidence,
        userConfirmed: true,
        options: field.options || [],
      });
      continue;
    }

    // If sensitive and not explicitly answered by human, treat as missing and skip automated levels
    if (isSensitive) {
      missingQuestions.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        required: Boolean(field.required),
        options: field.options || [],
        placeholder: field.placeholder || '',
        isSensitive: true
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
        sourcePath: 'agreement_autofill',
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
        sourcePath: userSetting?.portalPassword ? 'userSetting.portalPassword' : 'userProfile.portalPassword',
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
        sourcePath: profileRes.sourcePath,
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
        sourcePath: resumeRes.sourcePath,
        confidence: resumeRes.confidence,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 3: User Settings (Notice period - NO LLM, NO option[0] fallbacks)
    const category = classifyQuestionCategory(field.question);
    if (category === QUESTION_CATEGORIES.NOTICE_PERIOD) {
      const notice = userSetting?.noticePeriod;
      if (notice) {
        let selectedOption = notice;
        if (Array.isArray(field.options) && field.options.length > 0) {
          selectedOption = field.options.find((opt) => 
            normalizeQuestionText(opt).includes(normalizeQuestionText(notice))
          );
        }

        if (selectedOption) {
          resolvedAnswers.push({
            questionId: qId,
            fieldId: fId,
            question: field.question,
            type: field.type,
            answer: selectedOption,
            source: 'setting',
            sourcePath: 'userSetting.noticePeriod',
            confidence: 0.95,
            userConfirmed: false,
            options: field.options || [],
          });
          continue;
        }
      }
      // If no matching notice period option matches, fallback to missing question (ASK_HUMAN)
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
          sourcePath: 'gemini.llm.model',
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

=======
/**
 * Answer Resolver and Compliance Guard.
 * Deterministically resolves fields using profile, resume, and job facts,
 * with strict compliance filters routing sensitive questions to humans.
 */

/**
 * sensitiveQuestionGuard checks for legally protected, demographic, relocation, CTC,
 * notice period, or terms checkboxes, forcing human escalation.
 */
export const checkSensitiveQuestion = (questionText) => {
  const q = (questionText || '').toLowerCase();
  const sensitivePatterns = [
    'sponsor', 'authorization', 'authorized', 'work in the', 'citizenship', 
    'salary', 'ctc', 'compensation', 'notice period', 'relocat', 
    'gender', 'race', 'ethnicity', 'disability', 'veteran', 'lgbt', 'demographic', 
    'background check', 'convict', 'misdemeanor', 'felony', 'declaration', 
    'terms', 'privacy', 'consent', 'newsletter', 'marketing', 'agree'
  ];
  return sensitivePatterns.some(p => q.includes(p));
};

/**
 * Resolves answer order: approved -> deterministic resume -> job facts -> safe free-text -> askHuman.
 */
export const resolveFieldAnswer = (field, candidateInfo = {}, jobDetails = {}, approvedAnswers = {}) => {
  const question = (field.accessibleName || '').trim();

  // 1. sensitiveQuestionGuard validation
  if (checkSensitiveQuestion(question)) {
    return {
      value: null,
      source: 'human',
      confidence: 0.0,
      needsReview: true,
      reason: 'Question flagged as legally sensitive (relocation, authorization, CTC, terms, or EEO).'
    };
  }

  // 2. Previously approved answers
  if (approvedAnswers && approvedAnswers[question] !== undefined) {
    return {
      value: approvedAnswers[question],
      source: 'approved',
      confidence: 1.0,
      needsReview: false
    };
  }

  // 3. Deterministic profile/resume mapping
  const info = candidateInfo || {};
  const personal = info.personalInfo || info.personal || {};
  const qLower = question.toLowerCase();

  let matchedValue = null;
  let source = 'resume';

  if (/full\s*name|first\s*name|last\s*name|your\s*name/i.test(qLower)) {
    matchedValue = personal.fullName || personal.name || info.name;
    source = 'profile';
  } else if (/email|e-mail/i.test(qLower)) {
    matchedValue = personal.email || info.email;
    source = 'profile';
  } else if (/phone|mobile|contact\s*number/i.test(qLower)) {
    matchedValue = personal.phone || info.phone;
    source = 'profile';
  } else if (/linkedin/i.test(qLower)) {
    matchedValue = personal.linkedin || personal.linkedinUrl;
  } else if (/github/i.test(qLower)) {
    matchedValue = personal.github || personal.githubUrl;
  } else if (/website|portfolio/i.test(qLower)) {
    matchedValue = personal.website || personal.portfolio;
  } else if (/skills/i.test(qLower)) {
    matchedValue = (info.skills || []).join(', ');
  } else if (/education|degree/i.test(qLower)) {
    matchedValue = info.education?.[0]?.degree || '';
  } else if (/experience|years/i.test(qLower)) {
    matchedValue = info.experience?.[0]?.role || '';
  }

  if (matchedValue) {
    return {
      value: matchedValue,
      source,
      confidence: 0.95,
      needsReview: false
    };
  }

  // 4. Job facts mapping
  const job = jobDetails || {};
  if (/company/i.test(qLower)) {
    return { value: job.company || '', source: 'job', confidence: 0.9, needsReview: false };
  }
  if (/job\s*title|position/i.test(qLower)) {
    return { value: job.title || '', source: 'job', confidence: 0.9, needsReview: false };
  }

  // 5. Safe free-text drafted by LLM
  if (/why\s*do\s*you\s*want|cover\s*letter|about\s*yourself|summary|interest/i.test(qLower)) {
    const draftedValue = `I am very interested in the ${job.title || 'Developer'} role at ${job.company || 'the company'}. My expertise with ${(info.skills || []).slice(0, 3).join(', ')} aligns well with your targets.`;
    return {
      value: draftedValue,
      source: 'llm',
      confidence: 0.7,
      needsReview: true
    };
  }

  // 6. Otherwise escalate to human
>>>>>>> 1d429e22336b7068910ecf5c700f23abff096a1b
  return {
    value: null,
    source: 'human',
    confidence: 0.0,
    needsReview: true
  };
};

export default {
  checkSensitiveQuestion,
  resolveFieldAnswer
};
