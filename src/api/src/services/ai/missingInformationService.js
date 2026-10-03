/**
 * MissingInformationService: Detects missing required fields and pauses automation to request user input
 */

export class MissingInformationService {
  static detectMissingFields(requiredFields = [], userProfile = {}) {
    const missing = [];
    for (const field of requiredFields) {
      if (!userProfile[field.name] && !userProfile.applicationInfo?.[field.name]) {
        missing.push(field);
      }
    }
    return {
      hasMissing: missing.length > 0,
      missingFields: missing,
    };
  }
}

export default MissingInformationService;
