import { normalizeFormField } from './fieldModel.js';
import { logError, logJobEvent } from '../../../utils/logger.js';

const HIGH_RISK_CATEGORIES = new Set([
  'work_authorization',
  'salary',
  'demographic',
  'relocation',
  'notice_period',
  'legal',
]);

/**
 * Maps profile and resume data to standard personal/contact/link categories.
 *
 * @param {string} category
 * @param {object} profile
 * @param {object} resume
 * @returns {{ value: any, source: string }|null}
 */
const mapDeterministicProfileField = (category, profile = {}, resume = {}) => {
  const parsedData = resume.parsedData || {};
  const pInfo = parsedData.personalInfo || {};
  const personal = profile.personal || {};
  const links = profile.links || {};

  switch (category) {
    case 'first_name': {
      const fromResume = pInfo.fullName ? pInfo.fullName.split(' ')[0] : '';
      const val = fromResume || personal.firstName || parsedData.firstName || (profile.name ? profile.name.split(' ')[0] : '');
      return val ? { value: val, source: fromResume ? 'resume' : 'profile' } : null;
    }

    case 'last_name': {
      const fromResume = pInfo.fullName ? pInfo.fullName.split(' ').slice(1).join(' ') : '';
      const val = fromResume || personal.lastName || parsedData.lastName || (profile.name ? profile.name.split(' ').slice(1).join(' ') : '');
      return val ? { value: val, source: fromResume ? 'resume' : 'profile' } : null;
    }

    case 'full_name': {
      const val = pInfo.fullName || profile.name || `${personal.firstName || ''} ${personal.lastName || ''}`.trim() || parsedData.name || '';
      return val ? { value: val, source: pInfo.fullName ? 'resume' : 'profile' } : null;
    }

    case 'email': {
      const val = pInfo.email || profile.email || personal.email || parsedData.email || '';
      return val ? { value: val, source: pInfo.email ? 'resume' : 'profile' } : null;
    }

    case 'phone': {
      const val = pInfo.phone || personal.phone || parsedData.phone || '';
      return val ? { value: val, source: pInfo.phone ? 'resume' : 'profile' } : null;
    }

    case 'address': {
      const val = pInfo.location || personal.address || parsedData.location || parsedData.address || '';
      return val ? { value: val, source: pInfo.location ? 'resume' : 'profile' } : null;
    }

    case 'linkedin': {
      const val = pInfo.linkedin || links.linkedin || parsedData.linkedin || '';
      return val ? { value: val, source: pInfo.linkedin ? 'resume' : 'profile' } : null;
    }

    case 'github': {
      const val = pInfo.github || links.github || parsedData.github || '';
      return val ? { value: val, source: pInfo.github ? 'resume' : 'profile' } : null;
    }

    case 'portfolio': {
      const val = pInfo.website || links.portfolio || parsedData.portfolio || parsedData.website || '';
      return val ? { value: val, source: pInfo.website ? 'resume' : 'profile' } : null;
    }

    case 'skills': {
      let resumeSkills = [];
      if (Array.isArray(parsedData.skills)) {
        resumeSkills = parsedData.skills;
      } else if (parsedData.skills && typeof parsedData.skills === 'object') {
        resumeSkills = [
          ...(parsedData.skills.technicalSkills || []),
          ...(parsedData.skills.softSkills || []),
          ...(parsedData.skills.languages || [])
        ];
      }
      const skills = resumeSkills.length > 0 ? resumeSkills : (profile.skills || []);
      if (Array.isArray(skills) && skills.length > 0) {
        return { value: skills.join(', '), source: resumeSkills.length > 0 ? 'resume' : 'profile' };
      }
      return null;
    }

    case 'resume_upload': {
      const filePath = resume.filePath || resume.originalFile || null;
      return filePath ? { value: filePath, source: 'resume' } : null;
    }

    case 'city': {
      const val = personal.city || profile.city || (personal.address ? personal.address.split(',')[0].trim() : '') || '';
      return val ? { value: val, source: 'profile' } : null;
    }

    case 'state': {
      const val = personal.state || profile.state || (personal.address && personal.address.split(',').length > 1 ? personal.address.split(',')[1].trim().split(' ')[0] : '') || '';
      return val ? { value: val, source: 'profile' } : null;
    }

    case 'zip': {
      const val = personal.zip || personal.postalCode || profile.zip || (personal.address ? (personal.address.match(/\b\d{5}(?:-\d{4})?\b/) || personal.address.match(/\b\d{6}\b/))?.[0] : '') || '';
      return val ? { value: val, source: 'profile' } : null;
    }

    case 'country': {
      const val = personal.country || profile.country || 'United States';
      return { value: val, source: 'profile' };
    }

    case 'experience': {
      const val = profile.totalExperienceYears || profile.experience || parsedData.experienceYears || '3';
      return { value: String(val), source: 'profile' };
    }

    case 'education': {
      const val = parsedData.education?.[0]?.degree || profile.education || 'Bachelor of Science';
      return { value: String(val), source: 'resume' };
    }

    default:
      return null;
  }
};

/**
 * Generates an LLM answer draft strictly for safe free-text questions using factual profile data.
 *
 * @param {object} field
 * @param {object} profile
 * @param {object} [model]
 * @returns {Promise<string|null>}
 */
const generateLlmDraft = async (field, profile = {}, model = null) => {
  if (!model || typeof model.invoke !== 'function') return null;

  try {
    const prompt = `You are assisting a candidate with a job application form question.
Draft a concise, professional, and truthful answer (max 3 sentences) strictly grounded in the candidate facts below.
Do NOT invent credentials or include sensitive confidential info.

Question: "${field.label || field.name}"
Candidate Skills: ${(profile.skills || []).join(', ')}
Candidate Background Summary: ${profile.personal?.address || ''}

Draft answer:`;

    const response = await model.invoke(prompt);
    const content = typeof response === 'string' ? response : response?.content;
    return content ? content.trim() : null;
  } catch (error) {
    await logError('generateLlmDraft', error.message);
    return null;
  }
};

/**
 * Maps all form fields to resolved answers following the strict precedence hierarchy.
 *
 * @param {Array<object>} fields - Normalized form fields from extractFormFields
 * @param {object} params
 * @param {object} [params.profile] - UserProfile document
 * @param {object} [params.resume] - Resume document
 * @param {Array<object>} [params.previousAnswers=[]] - Previously approved session/question-bank answers
 * @param {object} [params.model] - Optional LLM model for free-text drafts
 * @returns {Promise<{
 *   answers: Array<{
 *     questionId: string,
 *     fieldIndex: number,
 *     label: string,
 *     value: any,
 *     source: 'profile'|'resume'|'approvedBefore'|'llm'|'human',
 *     confidence: number,
 *     needsReview: boolean,
 *     askHuman?: boolean,
 *     reason?: string,
 *     options?: Array<string>
 *   }>,
 *   pendingHumanQuestions: Array<object>,
 *   allResolved: boolean
 * }>}
 */
export const mapFormAnswers = async (fields = [], {
  profile = {},
  resume = {},
  previousAnswers = [],
  model = null,
  autoResolve = false,
} = {}) => {
  const answers = [];
  const pendingHumanQuestions = [];

  // Build lookup map for previously approved answers by stable questionId
  const approvedMap = new Map();
  for (const pa of previousAnswers || []) {
    const key = (pa.questionId || pa.questionKey || '').toLowerCase();
    if (key && pa.answer !== undefined && pa.answer !== null) {
      approvedMap.set(key, pa.answer);
    }
  }

  for (const field of fields) {
    const qId = field.stableQuestionId;
    const category = field.category;

    // 1. Check Approved Previous Answers
    if (approvedMap.has(qId.toLowerCase())) {
      const approvedValue = approvedMap.get(qId.toLowerCase());
      answers.push({
        questionId: qId,
        fieldIndex: field.index,
        label: field.label,
        value: approvedValue,
        source: 'approvedBefore',
        confidence: 1.0,
        needsReview: false,
      });
      continue;
    }

    // 2. High-Risk Categories: check if autoResolve is enabled OR if profile provides answer
    if (HIGH_RISK_CATEGORIES.has(category)) {
      if (autoResolve) {
        let autoVal = null;
        const qText = (field.label || field.name || '').toLowerCase();
        const opts = (field.options || []).map((o) => o.text || o.value || '');

        if (category === 'work_authorization') {
          if (qText.includes('sponsor') || qText.includes('visa')) {
            const noOpt = opts.find((o) => /^(no|will not require|not required)/i.test(o));
            autoVal = noOpt || (profile.requiresSponsorship ? 'Yes' : 'No');
          } else {
            const yesOpt = opts.find((o) => /^(yes|authorized|eligible)/i.test(o));
            autoVal = yesOpt || profile.workAuthorization || 'Yes';
          }
        } else if (category === 'salary') {
          autoVal = profile.expectedSalary || profile.expectedCtc || 'Competitive';
        } else if (category === 'notice_period') {
          autoVal = profile.noticePeriod || 'Immediate';
        } else if (category === 'relocation') {
          const yesOpt = opts.find((o) => /^yes/i.test(o));
          autoVal = yesOpt || 'Yes';
        } else if (category === 'legal') {
          if (field.type === 'checkbox' || /agree|consent|terms|policy/i.test(qText)) {
            autoVal = 'true';
          } else {
            const noOpt = opts.find((o) => /^no/i.test(o));
            autoVal = noOpt || 'No';
          }
        } else if (category === 'demographic') {
          const declineOpt = opts.find((o) => /decline|prefer not|choose not|not wish/i.test(o));
          autoVal = declineOpt || 'Prefer not to say';
        }

        if (autoVal !== null) {
          answers.push({
            questionId: qId,
            fieldIndex: field.index,
            label: field.label,
            value: autoVal,
            source: 'profile',
            confidence: 0.9,
            needsReview: false,
          });
          continue;
        }
      }

      const humanQuestion = {
        questionId: qId,
        question: field.label || field.name || 'Application Question',
        fieldIndex: field.index,
        options: field.options.map((o) => o.text || o.value).filter(Boolean),
        reason: `Mandatory human confirmation required for ${category.replace('_', ' ')} question.`,
        required: field.required,
      };

      answers.push({
        questionId: qId,
        fieldIndex: field.index,
        label: field.label,
        value: null,
        source: 'human',
        confidence: 0,
        needsReview: true,
        askHuman: true,
        reason: humanQuestion.reason,
        options: humanQuestion.options,
      });

      pendingHumanQuestions.push(humanQuestion);
      continue;
    }

    // 3. Deterministic Mapping from Profile / Resume
    const deterministicMatch = mapDeterministicProfileField(category, profile, resume);
    if (deterministicMatch && deterministicMatch.value) {
      answers.push({
        questionId: qId,
        fieldIndex: field.index,
        label: field.label,
        value: deterministicMatch.value,
        source: deterministicMatch.source,
        confidence: 0.95,
        needsReview: false,
      });
      continue;
    }

    // 4. LLM Draft for Safe Free-Text Questions
    if (category === 'freetext') {
      const draft = await generateLlmDraft(field, profile, model);
      if (draft) {
        answers.push({
          questionId: qId,
          fieldIndex: field.index,
          label: field.label,
          value: draft,
          source: 'llm',
          confidence: 0.75,
          needsReview: true,
        });
        continue;
      }
    }

    // 5. Fallback: Missing or Ambiguous field -> Ask Human
    const fallbackQuestion = {
      questionId: qId,
      question: field.label || field.name || 'Please provide information for this field',
      fieldIndex: field.index,
      options: field.options.map((o) => o.text || o.value).filter(Boolean),
      reason: 'No confident automated answer found for this form field.',
      required: field.required,
    };

    answers.push({
      questionId: qId,
      fieldIndex: field.index,
      label: field.label,
      value: null,
      source: 'human',
      confidence: 0,
      needsReview: true,
      askHuman: true,
      reason: fallbackQuestion.reason,
      options: fallbackQuestion.options,
    });

    pendingHumanQuestions.push(fallbackQuestion);
  }

  const allResolved = pendingHumanQuestions.length === 0;

  return {
    answers,
    pendingHumanQuestions,
    allResolved,
  };
};

export default {
  mapFormAnswers,
};
