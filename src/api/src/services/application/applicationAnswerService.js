/**
 * ApplicationAnswerService: Stores and retrieves confirmed application answers
 */

export class ApplicationAnswerService {
  static resolveAnswerFromProfile(questionText = '', userProfile = {}) {
    const qLower = questionText.toLowerCase();

    if (qLower.includes('authorized') || qLower.includes('legally authorized')) {
      return userProfile.applicationInfo?.workAuthorization || null;
    }
    if (qLower.includes('sponsor') || qLower.includes('sponsorship')) {
      return userProfile.applicationInfo?.sponsorshipRequired ? 'Yes' : 'No';
    }
    if (qLower.includes('salary') || qLower.includes('expected salary')) {
      return userProfile.applicationInfo?.expectedSalary || null;
    }
    if (qLower.includes('relocate') || qLower.includes('relocation')) {
      return userProfile.applicationInfo?.willingToRelocate ? 'Yes' : 'No';
    }
    if (qLower.includes('notice') || qLower.includes('notice period')) {
      return userProfile.applicationInfo?.noticePeriod || null;
    }

    return null;
  }
}

export default ApplicationAnswerService;
