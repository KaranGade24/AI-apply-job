import { normalizeQuestionText } from '../form/formNormalizer.js';

/**
 * Resolves deterministic user profile answers (Level 1)
 * @param {object} field
 * @param {object} userProfile
 * @param {object} user
 * @param {object} [userSetting]
 * @returns {{ resolved: boolean, value?: any, source: string, confidence: number }}
 */
export const resolveFromProfile = (field, userProfile = {}, user = {}, userSetting = {}) => {
  const q = normalizeQuestionText(field.question || field.placeholder || field.name || '');

  // Full Name
  if (/full\s*name|candidate\s*name|your\s*name|first\s*name/i.test(q)) {
    const name =
      userSetting?.fullName ||
      userProfile?.personal?.firstName
        ? `${userProfile.personal.firstName} ${userProfile.personal.lastName || ''}`.trim()
        : user?.fullName || user?.name || '';
    if (name) {
      return { resolved: true, value: name, source: 'profile', confidence: 1 };
    }
  }

  // Email
  if (/e-?mail/i.test(q)) {
    const email = userSetting?.email || user?.email || userProfile?.personal?.email || '';
    if (email) {
      return { resolved: true, value: email, source: 'profile', confidence: 1 };
    }
  }

  // Phone
  if (/phone|mobile|contact\s*no/i.test(q)) {
    const phone = userSetting?.phone || userProfile?.personal?.phone || user?.phone || '';
    if (phone) {
      return { resolved: true, value: phone, source: 'profile', confidence: 1 };
    }
  }

  // Location / City
  if (/current\s*location|where\s*are\s*you\s*located|current\s*city/i.test(q)) {
    const loc = userSetting?.location || userProfile?.personal?.address || 'Pune, India';
    if (loc) {
      return { resolved: true, value: loc, source: 'profile', confidence: 1 };
    }
  }

  // LinkedIn
  if (/linkedin/i.test(q)) {
    const linkedin = userSetting?.linkedinUrl || userProfile?.links?.linkedin || '';
    if (linkedin) {
      return { resolved: true, value: linkedin, source: 'profile', confidence: 1 };
    }
  }

  // GitHub
  if (/github/i.test(q)) {
    const github = userSetting?.githubUrl || userProfile?.links?.github || '';
    if (github) {
      return { resolved: true, value: github, source: 'profile', confidence: 1 };
    }
  }

  // Portfolio
  if (/portfolio|website/i.test(q)) {
    const portfolio = userSetting?.portfolioUrl || userProfile?.links?.portfolio || '';
    if (portfolio) {
      return { resolved: true, value: portfolio, source: 'profile', confidence: 1 };
    }
  }

  return { resolved: false, source: 'profile', confidence: 0 };
};
