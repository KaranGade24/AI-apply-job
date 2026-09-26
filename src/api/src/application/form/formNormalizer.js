import { QUESTION_CATEGORIES } from './fieldTypes.js';

/**
 * Normalizes question text for consistent matching and hashing
 * @param {string} text
 * @returns {string}
 */
export const normalizeQuestionText = (text = '') => {
  return text
    .toLowerCase()
    .replace(/[?*:]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Generates a stable unique ID / hash for a question on a form
 * @param {string} questionText
 * @param {number} index
 * @returns {string}
 */
export const generateQuestionId = (questionText, index = 0) => {
  const normalized = normalizeQuestionText(questionText).replace(/[^a-z0-9]/g, '_').slice(0, 32);
  return `q_${index}_${normalized || 'field'}`;
};

/**
 * Classifies a question into a known category
 * @param {string} questionText
 * @returns {string} Category from QUESTION_CATEGORIES
 */
export const classifyQuestionCategory = (questionText = '') => {
  const q = normalizeQuestionText(questionText);

  if (/full\s*name|candidate\s*name|your\s*name|first\s*name/i.test(q)) {
    return QUESTION_CATEGORIES.PROFILE;
  }
  if (/e-?mail/i.test(q)) {
    return QUESTION_CATEGORIES.PROFILE;
  }
  if (/phone|mobile|contact\s*no/i.test(q)) {
    return QUESTION_CATEGORIES.PROFILE;
  }
  if (/current\s*location|where\s*are\s*you\s*located|city|preferred\s*location/i.test(q)) {
    return QUESTION_CATEGORIES.LOCATION;
  }
  if (/degree|qualification|highest\s*education|college|graduation/i.test(q)) {
    return QUESTION_CATEGORIES.EDUCATION;
  }
  if (/years?\s*of\s*experience|total\s*experience|relevant\s*experience/i.test(q)) {
    return QUESTION_CATEGORIES.EXPERIENCE;
  }
  if (/notice\s*period|how\s*soon\s*can\s*you\s*join|availability/i.test(q)) {
    return QUESTION_CATEGORIES.NOTICE_PERIOD;
  }
  if (/expected\s*ctc|current\s*ctc|salary|compensation/i.test(q)) {
    return QUESTION_CATEGORIES.SALARY;
  }
  if (/willing\s*to\s*relocate|relocation/i.test(q)) {
    return QUESTION_CATEGORIES.YES_NO;
  }
  if (/authorized\s*to\s*work|work\s*permit|visa/i.test(q)) {
    return QUESTION_CATEGORIES.YES_NO;
  }
  if (/why\s*should\s*we\s*hire|why\s*are\s*you\s*interested|brief\s*pitch|cover\s*letter|tell\s*us\s*about/i.test(q)) {
    return QUESTION_CATEGORIES.SUBJECTIVE;
  }
  if (/resume|cv|upload\s*file/i.test(q)) {
    return QUESTION_CATEGORIES.RESUME;
  }

  return QUESTION_CATEGORIES.UNKNOWN;
};
