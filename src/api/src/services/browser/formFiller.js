/**
 * FormFiller: Safe form filling mapping user profile fields to detected form inputs
 */

import { logJobEvent } from '../../utils/logger.js';

export class FormFiller {
  static async fillForm(page, fields = [], userProfile = {}) {
    const filled = [];
    const missing = [];

    for (const field of fields) {
      let valueToFill = null;

      if (field.semanticMeaning === 'firstName') valueToFill = userProfile.personalInfo?.firstName || userProfile.personalInfo?.fullName?.split(' ')[0];
      else if (field.semanticMeaning === 'lastName') valueToFill = userProfile.personalInfo?.lastName || userProfile.personalInfo?.fullName?.split(' ').slice(1).join(' ');
      else if (field.semanticMeaning === 'email') valueToFill = userProfile.personalInfo?.email;
      else if (field.semanticMeaning === 'phone') valueToFill = userProfile.personalInfo?.phone;
      else if (field.semanticMeaning === 'linkedIn') valueToFill = userProfile.personalInfo?.linkedIn;
      else if (field.semanticMeaning === 'github') valueToFill = userProfile.personalInfo?.github;
      else if (field.semanticMeaning === 'workAuthorization') valueToFill = userProfile.applicationInfo?.workAuthorization;
      else if (field.semanticMeaning === 'expectedSalary') valueToFill = userProfile.applicationInfo?.expectedSalary;

      if (valueToFill) {
        await page.fill(`[name="${field.fieldId}"]`, String(valueToFill)).catch(() => {});
        filled.push({ fieldId: field.fieldId, label: field.label, value: valueToFill });
      } else if (field.required) {
        missing.push(field);
      }
    }

    await logJobEvent('formFiller', 'FORM_FILLED', `Filled ${filled.length} fields. ${missing.length} missing required fields.`);
    return {
      success: missing.length === 0,
      filled,
      missing,
    };
  }
}

export default FormFiller;
