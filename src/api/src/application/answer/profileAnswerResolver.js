import { normalizeQuestionText } from '../form/formNormalizer.js';

/**
 * Resolves deterministic user profile answers (Level 1)
 *
 * Enforces zero-fabrication of location, degree, and background.
 *
 * @param {object} field
 * @param {object} userProfile
 * @param {object} user
 * @param {object} [userSetting]
 * @returns {{ resolved: boolean, value?: any, source: string, sourcePath: string, confidence: number }}
 */
export const resolveFromProfile = (field, userProfile = {}, user = {}, userSetting = {}) => {
  const q = normalizeQuestionText(field.question || field.placeholder || field.name || '');

  // 1. Full Name (Precedence safe implementation)
  if (/full\s*name|candidate\s*name|your\s*name|first\s*name/i.test(q)) {
    let name = userSetting?.fullName || '';
    let path = 'userSetting.fullName';

    if (!name && userProfile?.personal?.firstName) {
      name = `${userProfile.personal.firstName} ${userProfile.personal.lastName || ''}`.trim();
      path = 'userProfile.personal.firstName';
    }

    if (!name && (user?.fullName || user?.name)) {
      name = user.fullName || user.name || '';
      path = user.fullName ? 'user.fullName' : 'user.name';
    }

    if (name) {
      return {
        resolved: true,
        value: name,
        source: 'profile',
        sourcePath: path,
        confidence: 1.0
      };
    }
  }

  // 2. Email
  if (/e-?mail/i.test(q)) {
    let email = userSetting?.email;
    let path = 'userSetting.email';

    if (!email && user?.email) {
      email = user.email;
      path = 'user.email';
    }
    if (!email && userProfile?.personal?.email) {
      email = userProfile.personal.email;
      path = 'userProfile.personal.email';
    }

    if (email) {
      return {
        resolved: true,
        value: email,
        source: 'profile',
        sourcePath: path,
        confidence: 1.0
      };
    }
  }

  // 3. Phone
  if (/phone|mobile|contact\s*no/i.test(q)) {
    let phone = userSetting?.phone;
    let path = 'userSetting.phone';

    if (!phone && userProfile?.personal?.phone) {
      phone = userProfile.personal.phone;
      path = 'userProfile.personal.phone';
    }
    if (!phone && user?.phone) {
      phone = user.phone;
      path = 'user.phone';
    }

    if (phone) {
      return {
        resolved: true,
        value: phone,
        source: 'profile',
        sourcePath: path,
        confidence: 1.0
      };
    }
  }

  // 4. Location / City (NO Pune default fallback)
  if (/current\s*location|where\s*are\s*you\s*located|current\s*city/i.test(q)) {
    let loc = userSetting?.location;
    let path = 'userSetting.location';

    if (!loc && userProfile?.personal?.address) {
      loc = userProfile.personal.address;
      path = 'userProfile.personal.address';
    }

    if (loc) {
      return {
        resolved: true,
        value: loc,
        source: 'profile',
        sourcePath: path,
        confidence: 1.0
      };
    }
  }

  // 5. LinkedIn
  if (/linkedin/i.test(q)) {
    const linkedin = userSetting?.linkedinUrl || userProfile?.links?.linkedin || '';
    const path = userSetting?.linkedinUrl ? 'userSetting.linkedinUrl' : 'userProfile.links.linkedin';
    if (linkedin) {
      return {
        resolved: true,
        value: linkedin,
        source: 'profile',
        sourcePath: path,
        confidence: 1.0
      };
    }
  }

  // 6. GitHub
  if (/github/i.test(q)) {
    const github = userSetting?.githubUrl || userProfile?.links?.github || '';
    const path = userSetting?.githubUrl ? 'userSetting.githubUrl' : 'userProfile.links.github';
    if (github) {
      return {
        resolved: true,
        value: github,
        source: 'profile',
        sourcePath: path,
        confidence: 1.0
      };
    }
  }

  // 7. Portfolio / Website
  if (/portfolio|website/i.test(q)) {
    const portfolio = userSetting?.portfolioUrl || userProfile?.links?.portfolio || '';
    const path = userSetting?.portfolioUrl ? 'userSetting.portfolioUrl' : 'userProfile.links.portfolio';
    if (portfolio) {
      return {
        resolved: true,
        value: portfolio,
        source: 'profile',
        sourcePath: path,
        confidence: 1.0
      };
    }
  }

  return { resolved: false, source: 'profile', sourcePath: '', confidence: 0.0 };
};
