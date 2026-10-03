/**
 * FormAnalyzer: Dynamic application form field discovery and semantic classification
 */

export class FormAnalyzer {
  static analyzeFields(html = '') {
    const fields = [];
    const inputRegex = /<input\b([^>]*)>/gi;
    let match;

    while ((match = inputRegex.exec(html)) !== null) {
      const attrStr = match[1];
      const nameMatch = attrStr.match(/name=["']([^"']*)["']/i);
      const typeMatch = attrStr.match(/type=["']([^"']*)["']/i);
      const labelMatch = attrStr.match(/aria-label=["']([^"']*)["']/i) || attrStr.match(/placeholder=["']([^"']*)["']/i);
      const required = /required/i.test(attrStr);

      const fieldName = nameMatch ? nameMatch[1] : `field_${fields.length}`;
      const type = typeMatch ? typeMatch[1] : 'text';
      const label = labelMatch ? labelMatch[1] : fieldName;

      let semanticMeaning = 'custom';
      if (/first.*name/i.test(fieldName) || /first.*name/i.test(label)) semanticMeaning = 'firstName';
      else if (/last.*name/i.test(fieldName) || /last.*name/i.test(label)) semanticMeaning = 'lastName';
      else if (/email/i.test(fieldName) || /email/i.test(label)) semanticMeaning = 'email';
      else if (/phone|mobile|tel/i.test(fieldName) || /phone|mobile/i.test(label)) semanticMeaning = 'phone';
      else if (/resume|cv/i.test(fieldName) || /resume|cv/i.test(label)) semanticMeaning = 'resume';
      else if (/cover.*letter/i.test(fieldName) || /cover.*letter/i.test(label)) semanticMeaning = 'coverLetter';
      else if (/linkedin/i.test(fieldName) || /linkedin/i.test(label)) semanticMeaning = 'linkedIn';
      else if (/github/i.test(fieldName) || /github/i.test(label)) semanticMeaning = 'github';
      else if (/salary|compensation/i.test(fieldName) || /salary/i.test(label)) semanticMeaning = 'expectedSalary';
      else if (/authoriz|visa|sponsor/i.test(fieldName) || /authoriz|sponsor/i.test(label)) semanticMeaning = 'workAuthorization';

      fields.push({
        fieldId: fieldName,
        label,
        type,
        required,
        options: [],
        placeholder: label,
        currentValue: '',
        semanticMeaning,
        confidence: 0.95,
      });
    }

    return fields;
  }
}

export default FormAnalyzer;
