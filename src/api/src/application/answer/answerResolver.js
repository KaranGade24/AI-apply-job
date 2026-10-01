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
