import { normalizeQuestionText } from '../form/formNormalizer.js';

/**
 * Resolves verified facts from the candidate's resume (Level 2 & Level 3).
 * Never fabricates facts, degrees, backgrounds, or years of experience.
 *
 * @param {object} field
 * @param {object} resumeData
 * @param {object} [job]
 * @returns {{ resolved: boolean, value?: any, source: string, sourcePath: string, confidence: number }}
 */
export const resolveFromResume = (field, resumeData = {}, job = {}) => {
  const q = normalizeQuestionText(field.question || field.placeholder || field.name || '');

  // 0. Personal Contact Information from Resume
  if (/^(name|fullname)$/i.test(q) || /full\s*name|candidate\s*name|your\s*name|applicant\s*name|contact\s*name/i.test(q) || (field.name && /^(name|fullname|candidate_name)$/i.test(field.name))) {
    const name = resumeData?.personalInfo?.fullName || resumeData?.personalInfo?.name || resumeData?.fullName || resumeData?.name || '';
    if (name) {
      return {
        resolved: true,
        value: name,
        source: 'resume',
        sourcePath: 'resumeData.personalInfo.fullName',
        confidence: 1.0,
      };
    }
  }

  if (/e-?mail/i.test(q) || field.type === 'email' || (field.name && /email/i.test(field.name))) {
    const email = resumeData?.personalInfo?.email || resumeData?.email || '';
    if (email) {
      return {
        resolved: true,
        value: email,
        source: 'resume',
        sourcePath: 'resumeData.personalInfo.email',
        confidence: 1.0,
      };
    }
  }

  if (/phone|mobile|contact\s*no|tel|whatsapp/i.test(q) || field.type === 'phone' || (field.name && /phone|mobile/i.test(field.name))) {
    const phone = resumeData?.personalInfo?.phone || resumeData?.personalInfo?.phoneNumber || resumeData?.phone || resumeData?.phoneNumber || '';
    if (phone) {
      return {
        resolved: true,
        value: phone,
        source: 'resume',
        sourcePath: 'resumeData.personalInfo.phone',
        confidence: 1.0,
      };
    }
  }

  // 1. Degree / Highest Education
  if (/degree|qualification|highest\s*education|graduat/i.test(q)) {
    const educationList = resumeData?.education || [];
    const highestEdu = educationList[0];
    if (highestEdu) {
      const degreeName = highestEdu.degree || highestEdu.qualification || null;
      if (degreeName) {
        if (Array.isArray(field.options) && field.options.length > 0) {
          // Match closest option
          const matched = field.options.find((opt) =>
            normalizeQuestionText(opt).includes(normalizeQuestionText(degreeName)) ||
            normalizeQuestionText(degreeName).includes(normalizeQuestionText(opt))
          );
          if (matched) {
            return {
              resolved: true,
              value: matched,
              source: 'resume',
              sourcePath: 'resumeData.education[0].degree',
              confidence: 1.0
            };
          }
          // No option matched? DO NOT pick field.options[0] default. Require human!
          return { resolved: false, source: 'resume', sourcePath: '', confidence: 0.0 };
        }
        return {
          resolved: true,
          value: degreeName,
          source: 'resume',
          sourcePath: 'resumeData.education[0].degree',
          confidence: 1.0
        };
      }
    }
    // No education data? Ask a human.
    return { resolved: false, source: 'resume', sourcePath: '', confidence: 0.0 };
  }

  // 2. Total Experience / Years of Experience
  if (/years?\s*of\s*experience|total\s*experience|relevant\s*experience/i.test(q)) {
    const directYears = resumeData?.totalExperienceYears || resumeData?.yearsOfExperience || resumeData?.experienceYears;
    const experiences = resumeData?.experience || [];
    if (directYears === undefined && experiences.length === 0) {
      return { resolved: false, source: 'resume', sourcePath: '', confidence: 0.0 };
    }

    let calculatedYears = directYears !== undefined ? Number(directYears) : 0;

    // Calculate total verified experience from verified employment entries if directYears not provided
    if (directYears === undefined) {
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
    }

    const roundedYears = Math.round(calculatedYears);

    // If options are available, find the closest matching option
    if (Array.isArray(field.options) && field.options.length > 0) {
      const matchOpt = field.options.find((opt) => {
        const num = parseInt(opt.replace(/\D/g, ''), 10);
        return num === roundedYears || (roundedYears === 0 && (opt.includes('0') || /fresher/i.test(opt)));
      });

      if (matchOpt) {
        return {
          resolved: true,
          value: matchOpt,
          source: 'resume',
          sourcePath: 'resumeData.experience',
          confidence: 1.0
        };
      }
      // No option matched? DO NOT pick field.options[0] default. Require human!
      return { resolved: false, source: 'resume', sourcePath: '', confidence: 0.0 };
    }

    return {
      resolved: true,
      value: String(roundedYears),
      source: 'resume',
      sourcePath: 'resumeData.experience',
      confidence: 1.0
    };
  }

  // 3. Relevant Skills
  if (/skills?|key\s*skills/i.test(q)) {
    const skills = resumeData?.skills || [];
    if (skills.length > 0) {
      return {
        resolved: true,
        value: skills.slice(0, 5).join(', '),
        source: 'resume',
        sourcePath: 'resumeData.skills',
        confidence: 1.0
      };
    }
  }

  return { resolved: false, source: 'resume', sourcePath: '', confidence: 0.0 };
};
