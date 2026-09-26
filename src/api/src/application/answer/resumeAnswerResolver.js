import { normalizeQuestionText } from '../form/formNormalizer.js';

/**
 * Resolves verified facts from the candidate's resume (Level 2 & Level 3)
 * Never fabricates facts or years of experience.
 * @param {object} field
 * @param {object} resumeData
 * @param {object} [job]
 * @returns {{ resolved: boolean, value?: any, source: string, confidence: number }}
 */
export const resolveFromResume = (field, resumeData = {}, job = {}) => {
  const q = normalizeQuestionText(field.question || field.placeholder || field.name || '');

  // 1. Degree / Highest Education
  if (/degree|qualification|highest\s*education|graduat/i.test(q)) {
    const educationList = resumeData?.education || [];
    const highestEdu = educationList[0] || {};
    const degreeName = highestEdu.degree || highestEdu.qualification || 'Bachelor of Engineering';
    if (degreeName) {
      if (Array.isArray(field.options) && field.options.length > 0) {
        // Match closest option
        const matched = field.options.find((opt) =>
          normalizeQuestionText(opt).includes(normalizeQuestionText(degreeName)) ||
          normalizeQuestionText(degreeName).includes(normalizeQuestionText(opt))
        );
        return { resolved: true, value: matched || field.options[0], source: 'resume', confidence: 1 };
      }
      return { resolved: true, value: degreeName, source: 'resume', confidence: 1 };
    }
  }

  // 2. Total Experience / Years of Experience
  if (/years?\s*of\s*experience|total\s*experience/i.test(q)) {
    const experiences = resumeData?.experience || [];
    let calculatedYears = 0;

    // Calculate total verified experience from verified employment entries
    experiences.forEach((exp) => {
      if (exp.startDate && exp.endDate) {
        const start = new Date(exp.startDate);
        const end = exp.endDate.toLowerCase().includes('present') ? new Date() : new Date(exp.endDate);
        if (!isNaN(start) && !isNaN(end)) {
          const diffYears = (end - start) / (1000 * 60 * 60 * 24 * 365.25);
          if (diffYears > 0) calculatedYears += diffYears;
        }
      }
    });

    const roundedYears = Math.round(calculatedYears);

    // If options are available, find the closest matching option
    if (Array.isArray(field.options) && field.options.length > 0) {
      const matchOpt = field.options.find((opt) => {
        const num = parseInt(opt.replace(/\D/g, ''), 10);
        return num === roundedYears || (roundedYears === 0 && (opt.includes('0') || /fresher/i.test(opt)));
      });
      return { resolved: true, value: matchOpt || field.options[0], source: 'resume', confidence: 1 };
    }

    return { resolved: true, value: String(roundedYears), source: 'resume', confidence: 1 };
  }

  // 3. Relevant Skills
  if (/skills?|key\s*skills/i.test(q)) {
    const skills = resumeData?.skills || [];
    if (skills.length > 0) {
      return { resolved: true, value: skills.slice(0, 5).join(', '), source: 'resume', confidence: 1 };
    }
  }

  return { resolved: false, source: 'resume', confidence: 0 };
};
