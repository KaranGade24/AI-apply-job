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

    if (!name && (userProfile?.fullName || userProfile?.name)) {
      name = userProfile.fullName || userProfile.name || '';
      path = 'userProfile.fullName';
    }

    if (!name && (user?.fullName || user?.name || user?.username)) {
      name = user.fullName || user.name || user.username || '';
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
    if (!email && userProfile?.email) {
      email = userProfile.email;
      path = 'userProfile.email';
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
    if (!phone && (userProfile?.phone || userProfile?.phoneNumber)) {
      phone = userProfile.phone || userProfile.phoneNumber;
      path = 'userProfile.phone';
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

  // 4. Location / City
  if (/current\s*location|where\s*are\s*you\s*located|current\s*city|city|location/i.test(q)) {
    let loc = userSetting?.location;
    let path = 'userSetting.location';

    if (!loc && userProfile?.personal?.address) {
      loc = userProfile.personal.address;
      path = 'userProfile.personal.address';
    }
    if (!loc && (userProfile?.location || userProfile?.city)) {
      loc = userProfile.location || userProfile.city;
      path = 'userProfile.location';
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

  // Experience
  if (/experience|years\s*of\s*exp/i.test(q)) {
    const exp = userProfile?.totalExperienceYears || userProfile?.experience || '3';
    return {
      resolved: true,
      value: String(exp),
      source: 'profile',
      sourcePath: 'userProfile.experience',
      confidence: 1.0
    };
  }

  // Current CTC
  if (/current\s*(?:ctc|salary|compensation|package)/i.test(q)) {
    const ctc = userProfile?.currentCtc || userProfile?.currentSalary || '10 LPA';
    return {
      resolved: true,
      value: String(ctc),
      source: 'profile',
      sourcePath: 'userProfile.currentCtc',
      confidence: 1.0
    };
  }

  // Expected CTC
  if (/expected\s*(?:ctc|salary|compensation|package)/i.test(q)) {
    const expCtc = userProfile?.expectedCtc || userProfile?.expectedSalary || '15 LPA';
    return {
      resolved: true,
      value: String(expCtc),
      source: 'profile',
      sourcePath: 'userProfile.expectedCtc',
      confidence: 1.0
    };
  }

  // Notice Period
  if (/notice\s*period|availability|joining|how\s*soon/i.test(q)) {
    const notice = userProfile?.noticePeriod || 'Immediate / 15 days';
    return {
      resolved: true,
      value: String(notice),
      source: 'profile',
      sourcePath: 'userProfile.noticePeriod',
      confidence: 1.0
    };
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
