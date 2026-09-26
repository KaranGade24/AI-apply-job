/**
 * Validates a list of form fields against answers provided
 * @param {Array<object>} fields
 * @param {Array<object>} answers
 * @returns {{ isValid: boolean, missingRequired: Array<object> }}
 */
export const validateFormFields = (fields = [], answers = []) => {
  const answerMap = new Map();
  answers.forEach((a) => {
    if (a.questionId) answerMap.set(a.questionId, a.answer);
    if (a.fieldId) answerMap.set(a.fieldId, a.answer);
  });

  const missingRequired = [];

  for (const field of fields) {
    if (field.required) {
      const val = answerMap.get(field.questionId) ?? answerMap.get(field.fieldId);
      if (val === undefined || val === null || val === '') {
        missingRequired.push(field);
      }
    }
  }

  return {
    isValid: missingRequired.length === 0,
    missingRequired,
  };
};
