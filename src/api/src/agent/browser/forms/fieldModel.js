import crypto from 'crypto';

/**
 * Normalizes and categorizes a form field from an element observation.
 *
 * @param {object} el - Interactive element object from page observation
 * @returns {object|null} Normalized field model or null if element is not a form field
 */
export const normalizeFormField = (el) => {
  if (!el) return null;

  const tag = (el.tag || '').toLowerCase();
  const type = (el.type || '').toLowerCase();
  const role = (el.role || '').toLowerCase();

  const isFormInput =
    tag === 'input' ||
    tag === 'select' ||
    tag === 'textarea' ||
    role === 'textbox' ||
    role === 'combobox' ||
    role === 'checkbox' ||
    role === 'radio';

  if (!isFormInput) return null;
  if (type === 'hidden' || type === 'submit' || type === 'reset' || type === 'button') return null;

  const label = (el.label || el.placeholder || el.name || el.text || '').trim();
  const name = (el.name || '').trim();
  const group = el.groupName || (type === 'radio' ? name : undefined);

  // Generate stable question identifier
  const baseKey = (group || name || label || `field_${el.index}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const stableQuestionId = baseKey || `field_${el.index}`;

  // Categorize the field
  const category = detectFieldCategory({ label, name, type, tag, options: el.options });

  return {
    index: el.index,
    tag,
    type: type || (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'text'),
    role: role || undefined,
    name: name || undefined,
    label,
    group,
    required: Boolean(el.required),
    disabled: Boolean(el.disabled),
    currentValue: el.value !== undefined ? el.value : '',
    checked: el.checked,
    options: el.options || [],
    isSensitive: Boolean(el.isSensitive || type === 'password'),
    stableQuestionId,
    category,
  };
};

/**
 * Categorizes a form field into high-risk or standard categories.
 *
 * @param {object} params
 * @returns {string} Category string
 */
export const detectFieldCategory = ({ label = '', name = '', type = '', tag = '', options = [] } = {}) => {
  const text = `${label} ${name}`.toLowerCase();

  // High-Risk Mandatory Human Review Categories
  if (
    text.includes('sponsorship') ||
    text.includes('authorized to work') ||
    text.includes('work authorization') ||
    text.includes('visa') ||
    text.includes('require sponsorship') ||
    text.includes('eligible to work') ||
    text.includes('legally authorized')
  ) {
    return 'work_authorization';
  }

  if (
    text.includes('salary') ||
    text.includes('compensation') ||
    text.includes('desired pay') ||
    text.includes('expected ctc') ||
    text.includes('current ctc') ||
    text.includes('hourly rate') ||
    text.includes('remuneration')
  ) {
    return 'salary';
  }

  if (
    text.includes('gender') ||
    text.includes('race') ||
    text.includes('ethnicity') ||
    text.includes('veteran') ||
    text.includes('disability') ||
    text.includes('equal opportunity') ||
    text.includes('demographic') ||
    text.includes('pronoun') ||
    text.includes('lgbtq') ||
    text.includes('hispanic')
  ) {
    return 'demographic';
  }

  if (
    text.includes('relocate') ||
    text.includes('relocation') ||
    text.includes('willing to move') ||
    text.includes('open to travel')
  ) {
    return 'relocation';
  }

  if (
    text.includes('notice period') ||
    text.includes('start date') ||
    text.includes('how soon can you start') ||
    text.includes('availability')
  ) {
    return 'notice_period';
  }

  if (
    text.includes('felony') ||
    text.includes('background check') ||
    text.includes('criminal') ||
    text.includes('non-compete') ||
    text.includes('agreement') ||
    text.includes('acknowledge and agree')
  ) {
    return 'legal';
  }

  // Standard Deterministic Categories
  if (text.includes('first name') || text.includes('given name') || text === 'first') {
    return 'first_name';
  }
  if (text.includes('last name') || text.includes('surname') || text.includes('family name') || text === 'last') {
    return 'last_name';
  }
  if (text.includes('full name') || text === 'name' || text.includes('applicant name')) {
    return 'full_name';
  }
  if (type === 'email' || text.includes('email') || text.includes('e-mail')) {
    return 'email';
  }
  if (type === 'tel' || text.includes('phone') || text.includes('mobile') || text.includes('contact number')) {
    return 'phone';
  }
  if (text.includes('address') || text.includes('street') || text.includes('city') || text.includes('location') || text.includes('zip') || text.includes('postal')) {
    return 'address';
  }
  if (text.includes('linkedin')) {
    return 'linkedin';
  }
  if (text.includes('github')) {
    return 'github';
  }
  if (text.includes('portfolio') || text.includes('website') || text.includes('personal site')) {
    return 'portfolio';
  }
  if (type === 'file' || text.includes('resume') || text.includes('cv') || text.includes('curriculum vitae')) {
    return 'resume_upload';
  }
  if (text.includes('education') || text.includes('degree') || text.includes('university') || text.includes('college') || text.includes('gpa')) {
    return 'education';
  }
  if (text.includes('experience') || text.includes('years of experience') || text.includes('current company') || text.includes('current title')) {
    return 'experience';
  }
  if (text.includes('skills') || text.includes('technologies') || text.includes('tech stack')) {
    return 'skills';
  }

  // Free-text open questions
  if (tag === 'textarea' || (type === 'text' && (text.includes('why') || text.includes('tell us') || text.includes('cover letter') || text.includes('summary')))) {
    return 'freetext';
  }

  return 'general';
};

/**
 * Normalizes all form fields from a page observation.
 *
 * @param {object} observation
 * @returns {Array<object>}
 */
export const extractFormFields = (observation = {}) => {
  const elements = observation.elements || [];
  return elements.map(normalizeFormField).filter(Boolean);
};

export default {
  normalizeFormField,
  extractFormFields,
  detectFieldCategory,
};
