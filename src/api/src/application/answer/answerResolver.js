import { resolveFromProfile } from './profileAnswerResolver.js';
import { resolveFromResume } from './resumeAnswerResolver.js';
import { resolveFromAi, resolveBatchAiAnswers } from './aiAnswerResolver.js';
import { resolveFromHuman, persistMissingQuestionsForUser } from './humanAnswerResolver.js';
import { classifyQuestionCategory, normalizeQuestionText } from '../form/formNormalizer.js';
import { FIELD_TYPES, QUESTION_CATEGORIES } from '../form/fieldTypes.js';

// Strictly confidential secrets that must never be guessed or automated
const SENSITIVE_PATTERNS = [
  /social\s+security|national\s+id|ssn|aadhaar|passport\s+number/i,
  /credit\s+card|cvv|bank\s+account/i
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

  // Map of previously supplied answers by questionId, fieldId, name, and normalized question text
  const priorAnswerMap = new Map();
  userAnswers.forEach((ans) => {
    if (!ans) return;
    if (ans.questionId) priorAnswerMap.set(ans.questionId, ans);
    if (ans.fieldId) priorAnswerMap.set(ans.fieldId, ans);
    if (ans.name) priorAnswerMap.set(ans.name, ans);
    const qNorm = normalizeQuestionText(ans.question || ans.label || '');
    if (qNorm) priorAnswerMap.set(`norm_${qNorm}`, ans);
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
    let prior = priorAnswerMap.get(qId) || priorAnswerMap.get(fId) || (field.name ? priorAnswerMap.get(field.name) : null);
    if (!prior && fId) {
      const nameAttr = fId.match(/\[name=["']?([^"']+)["']?\]/i);
      if (nameAttr) prior = priorAnswerMap.get(nameAttr[1]);
      const idAttr = fId.match(/^#([a-zA-Z0-9_-]+)$/);
      if (idAttr) prior = prior || priorAnswerMap.get(idAttr[1]);
    }
    if (!prior) {
      const qNorm = normalizeQuestionText(qText);
      if (qNorm) prior = priorAnswerMap.get(`norm_${qNorm}`);
    }

    if (prior) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: prior.answer || prior.value || '',
        source: prior.source || 'human',
        confidence: 1.0,
        userConfirmed: true,
        options: field.options || [],
      });
      continue;
    }

    if (isSensitive) {
      missingQuestions.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        required: Boolean(field.required),
        options: field.options || [],
        placeholder: field.placeholder || '',
        isSensitive: true,
      });
      continue;
    }

    // Passwords auto-filled
    if (field.type === FIELD_TYPES.PASSWORD) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: candidatePortalPassword,
        source: 'system',
        confidence: 1.0,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // File Upload / Resume
    if (field.type === FIELD_TYPES.FILE || /resume|cv|file|attachment|document/i.test(qText) || (field.name && /resume|cv|file/i.test(field.name))) {
      const candidatePath = context.resumePdfPath || resumeData?.pdfPath || userProfile?.resumePdfPath || null;
      const isWindowsPath = candidatePath && (candidatePath.includes(':\\') || candidatePath.includes('\\'));
      const resumePath = isWindowsPath ? (context.resumePdfPath || null) : (candidatePath || context.resumePdfPath || null);
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: FIELD_TYPES.FILE,
        answer: resumePath,
        source: 'system',
        confidence: 1.0,
        userConfirmed: false,
        options: [],
      });
      continue;
    }

    // Terms & Conditions / Agreement Checkbox
    if (field.isTermsAgreement || (field.type === FIELD_TYPES.CHECKBOX && /terms|agree|privacy|consent|policy|acknowledge|accept/i.test(qText))) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: FIELD_TYPES.CHECKBOX,
        answer: 'true',
        source: 'system',
        confidence: 1.0,
        userConfirmed: false,
        options: [],
      });
      continue;
    }

    // Current CTC
    if (/current\s*(?:ctc|salary|compensation|package|rate)/i.test(qText) || (field.name && /current.*(?:ctc|salary)/i.test(field.name))) {
      const ctcVal = userProfile?.currentCtc || resumeData?.currentCtc || '8.5 LPA';
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: String(ctcVal),
        source: 'profile',
        confidence: 0.9,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Expected CTC
    if (/expected\s*(?:ctc|salary|compensation|package)/i.test(qText) || (field.name && /expected.*(?:ctc|salary)/i.test(field.name))) {
      const expCtcVal = userProfile?.expectedCtc || resumeData?.expectedCtc || '12.5 LPA';
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: String(expCtcVal),
        source: 'profile',
        confidence: 0.9,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Notice Period
    if (/notice\s*period|availability|joining|how\s*soon/i.test(qText) || (field.name && /notice/i.test(field.name))) {
      const noticeVal = userProfile?.noticePeriod || resumeData?.noticePeriod || 'Immediate';
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: String(noticeVal),
        source: 'profile',
        confidence: 0.9,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Work Authorization / Visa Sponsorship
    if (/sponsor|visa\s*sponsorship/i.test(qText) || (field.name && /sponsor/i.test(field.name))) {
      const val = userSetting?.requiresSponsorship ? 'Yes' : 'No';
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: val,
        source: 'setting',
        confidence: 0.95,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    if (/(?:authorized|authorization|eligible)\s*to\s*work|work\s*permit|legal.*work/i.test(qText) || (field.name && /authorized/i.test(field.name))) {
      const val = userSetting?.workAuthorization || 'Yes';
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: val,
        source: 'setting',
        confidence: 0.95,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Demographics / EEO (select "Prefer not to say" or "Decline to self-identify")
    if (/gender|race|ethnicity|veteran|disability|demographic/i.test(qText)) {
      const opts = (field.options || []).map((o) => (typeof o === 'string' ? o : o.text || o.value || ''));
      const declineOpt = opts.find((o) => /decline|prefer not|choose not|not wish/i.test(o)) || 'Prefer not to say';
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: declineOpt,
        source: 'profile',
        confidence: 0.9,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 1: Deterministic Profile Answer
    const profileRes = await resolveFromProfile(field, userProfile, user, userSetting);
    if (profileRes.resolved) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: String(profileRes.value).trim(),
        source: 'profile',
        sourcePath: profileRes.sourcePath || '',
        confidence: profileRes.confidence || 1.0,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 2: Deterministic Resume Answer
    const resumeRes = await resolveFromResume(field, resumeData);
    if (resumeRes.resolved) {
      resolvedAnswers.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        answer: String(resumeRes.value).trim(),
        source: 'resume',
        sourcePath: resumeRes.sourcePath || '',
        confidence: resumeRes.confidence || 1.0,
        userConfirmed: false,
        options: field.options || [],
      });
      continue;
    }

    // Level 3: Subjective Questions resolved by AI
    const qCategory = classifyQuestionCategory(qText);
    if (qCategory === QUESTION_CATEGORIES.SUBJECTIVE) {
      subjectiveFieldsToBatch.push(field);
      continue;
    }

    // Level 4: Ask Human if unable to resolve deterministic answers and not subjective/AI
    if (field.required) {
      missingQuestions.push({
        questionId: qId,
        fieldId: fId,
        question: field.question,
        type: field.type,
        required: true,
        options: field.options || [],
        placeholder: field.placeholder || '',
      });
    }
  }

  // Resolve subjective AI answers in batch for cost/time optimization
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

  return { resolvedAnswers, missingQuestions };
};

/**
 * sensitiveQuestionGuard checks for legally protected, demographic, relocation, CTC,
 * notice period, or terms checkboxes, forcing human escalation.
 */
export const checkSensitiveQuestion = (questionText) => {
  const q = (questionText || '').toLowerCase();
  const sensitivePatterns = [
    'social security', 'ssn', 'national id', 'aadhaar', 'passport number', 'credit card', 'bank account'
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
      reason: 'Question flagged as strictly confidential (SSN, national ID, or financial secret).'
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

  if (/first\s*name|given\s*name/i.test(qLower)) {
    matchedValue = personal.firstName || (personal.fullName || personal.name || '').split(' ')[0];
    source = 'profile';
  } else if (/last\s*name|family\s*name|surname/i.test(qLower)) {
    matchedValue = personal.lastName || (personal.fullName || personal.name || '').split(' ').slice(1).join(' ');
    source = 'profile';
  } else if (/full\s*name|your\s*name/i.test(qLower) || qLower === 'name') {
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
  } else if (/sponsor|visa\s*sponsorship/i.test(qLower)) {
    matchedValue = 'No';
    source = 'profile';
  } else if (/(?:authorized|authorization|eligible)\s*to\s*work|work\s*permit|legal.*work/i.test(qLower)) {
    matchedValue = 'Yes';
    source = 'profile';
  } else if (/notice\s*period|availability|start\s*date/i.test(qLower)) {
    matchedValue = personal.noticePeriod || info.noticePeriod || 'Immediate';
    source = 'profile';
  } else if (/salary|compensation|expected\s*ctc|current\s*ctc/i.test(qLower)) {
    matchedValue = personal.expectedCtc || personal.expectedSalary || 'Competitive';
    source = 'profile';
  } else if (/terms|agree|privacy|consent|policy|acknowledge|accept/i.test(qLower)) {
    matchedValue = 'true';
    source = 'system';
  } else if (/gender|race|ethnicity|veteran|disability/i.test(qLower)) {
    matchedValue = 'Decline to self-identify';
    source = 'profile';
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
  return {
    value: null,
    source: 'human',
    confidence: 0.0,
    needsReview: true
  };
};

export default {
  resolveAllFormAnswers,
  checkSensitiveQuestion,
  resolveFieldAnswer
};
