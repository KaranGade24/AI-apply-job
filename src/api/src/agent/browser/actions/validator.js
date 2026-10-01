import { PERCEPTION_PAGE_TYPES } from '../../../constant/agent.constant.js';
import { actionSchema } from '../../schema/actionSchema.js';

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^169\.254\./,
];

/**
 * Validates a single action against the current observation, page type, and execution context.
 * Never throws exceptions for expected validation errors; returns { ok, code, message }.
 *
 * @param {object} action - Action payload conforming to actionSchema
 * @param {object} observation - Current page observation
 * @param {object} [context] - Execution context (e.g. finalReview status, answers hash)
 * @returns {{ ok: boolean, code?: string, message?: string }}
 */
export const validateAction = (action, observation = {}, context = {}) => {
  // 1. Zod schema validation
  const parsed = actionSchema.safeParse(action);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID_ACTION_SCHEMA',
      message: `Action schema error: ${parsed.error.errors.map((e) => e.message).join(', ')}`,
    };
  }

  const { type } = action;
  const pageType = observation.pageType || PERCEPTION_PAGE_TYPES.UNKNOWN;
  const elements = observation.elements || [];

  // 2. CAPTCHA / Blocked page rule
  if (pageType === PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED) {
    const allowedOnBlocked = ['askHuman', 'fail', 'waitFor'];
    if (!allowedOnBlocked.includes(type)) {
      return {
        ok: false,
        code: 'BLOCKED_BY_CAPTCHA',
        message: `Action "${type}" rejected: Page is blocked by CAPTCHA/bot challenge. Automated interaction is suspended.`,
      };
    }
  }

  // 3. PageType specific rules (no fills on Error or Completed Success pages)
  if (pageType === PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS) {
    if (['fill', 'select', 'check', 'uncheck', 'uploadFile', 'submitApplication'].includes(type)) {
      return {
        ok: false,
        code: 'ALREADY_SUBMITTED',
        message: `Action "${type}" rejected: Application is already successfully submitted.`,
      };
    }
  }

  // 4. Navigation URL validation
  if (type === 'navigate') {
    const { url } = action;
    if (!url || typeof url !== 'string') {
      return { ok: false, code: 'MISSING_URL', message: 'Navigate action requires a valid URL.' };
    }

    const trimmed = url.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return {
        ok: false,
        code: 'DISALLOWED_PROTOCOL',
        message: `Navigation rejected: URL must use HTTP or HTTPS protocol (received: "${trimmed.slice(0, 30)}").`,
      };
    }

    try {
      const parsedUrl = new URL(trimmed);
      const hostname = parsedUrl.hostname.toLowerCase();

      const isBlockedHost = BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
      if (isBlockedHost) {
        return {
          ok: false,
          code: 'FORBIDDEN_HOST',
          message: `Navigation to local/private network host "${hostname}" is prohibited for security.`,
        };
      }
    } catch {
      return { ok: false, code: 'MALFORMED_URL', message: `Malformed navigation URL: "${trimmed}"` };
    }

    return { ok: true };
  }

  // 5. Final Submission Protection
  if (type === 'submitApplication') {
    const finalReview = context.finalReview || context.preSubmissionReview || {};
    const isApproved = finalReview.approved === true || finalReview.userConfirmed === true;

    if (!isApproved) {
      return {
        ok: false,
        code: 'SUBMISSION_NOT_APPROVED',
        message: 'submitApplication rejected: Application has not been approved by user in final review.',
      };
    }

    const reviewHash = finalReview.reviewHash || finalReview.hash;
    const currentHash = context.reviewHash || context.currentAnswersHash || context.hash;

    if (reviewHash && currentHash && reviewHash !== currentHash) {
      return {
        ok: false,
        code: 'ANSWERS_CHANGED_AFTER_REVIEW',
        message: 'submitApplication rejected: Form answers were modified after user approval was granted.',
      };
    }

    return { ok: true };
  }

  // 6. Actions that do not target specific DOM element indices
  if (['scroll', 'pressKey', 'waitFor', 'extract', 'askHuman', 'requestReview', 'finish', 'fail'].includes(type)) {
    return { ok: true };
  }

  // 7. Element-targeting actions (click, fill, select, check, uncheck, uploadFile)
  const targetIndex = action.index;
  if (targetIndex === undefined || typeof targetIndex !== 'number') {
    return { ok: false, code: 'MISSING_ELEMENT_INDEX', message: `Action "${type}" requires a numeric element index.` };
  }

  // Check Snapshot Stale Check if action includes snapshotId
  if (action.snapshotId && observation.snapshotId && action.snapshotId !== observation.snapshotId) {
    return {
      ok: false,
      code: 'STALE_SNAPSHOT',
      message: `Action snapshotId (${action.snapshotId}) does not match current observation (${observation.snapshotId}). Page must be re-observed.`,
    };
  }

  const el = elements.find((e) => e.index === targetIndex);
  if (!el) {
    return {
      ok: false,
      code: 'ELEMENT_NOT_FOUND',
      message: `Element [${targetIndex}] does not exist in the current page observation.`,
    };
  }

  if (el.disabled) {
    return {
      ok: false,
      code: 'ELEMENT_DISABLED',
      message: `Element [${targetIndex}] (${el.label || el.tag}) is disabled and cannot be interacted with.`,
    };
  }

  const tag = (el.tag || '').toLowerCase();
  const elType = (el.type || '').toLowerCase();
  const role = (el.role || '').toLowerCase();

  // 8. Element Type Compatibility & Specific Value Validations
  switch (type) {
    case 'fill': {
      const allowedFillTags = ['input', 'textarea'];
      const isContentEditable = role === 'textbox' || el.contenteditable;
      const disallowedInputTypes = ['file', 'radio', 'checkbox', 'button', 'submit', 'reset', 'image'];

      if (!allowedFillTags.includes(tag) && !isContentEditable) {
        return {
          ok: false,
          code: 'INCOMPATIBLE_ELEMENT_TYPE',
          message: `Cannot fill element [${targetIndex}] of type <${tag}>. Fill is only valid for inputs, textareas, and editable textboxes.`,
        };
      }

      if (tag === 'input' && disallowedInputTypes.includes(elType)) {
        return {
          ok: false,
          code: 'INCOMPATIBLE_INPUT_TYPE',
          message: `Cannot fill <input type="${elType}">. Use check, select, or uploadFile actions instead.`,
        };
      }

      // Sensitive field protection (password/OTP)
      if (el.isSensitive || elType === 'password') {
        const allowedSources = ['human', 'user'];
        if (!allowedSources.includes(action.source)) {
          return {
            ok: false,
            code: 'SENSITIVE_FIELD_PROTECTED',
            message: `Direct AI fill on sensitive field [${targetIndex}] (${el.label || elType}) is blocked. Value must originate from human answer.`,
          };
        }
      }

      // Value format sanity checks
      if (elType === 'email' && action.value) {
        if (!action.value.includes('@') || !action.value.includes('.')) {
          return {
            ok: false,
            code: 'INVALID_EMAIL_FORMAT',
            message: `Value "${action.value}" is not a valid email address for email input [${targetIndex}].`,
          };
        }
      }

      if (elType === 'number' && action.value) {
        if (isNaN(Number(action.value))) {
          return {
            ok: false,
            code: 'INVALID_NUMBER_FORMAT',
            message: `Value "${action.value}" is not a valid number for numeric input [${targetIndex}].`,
          };
        }
      }

      break;
    }

    case 'select': {
      if (tag !== 'select' && role !== 'combobox' && role !== 'listbox') {
        return {
          ok: false,
          code: 'INCOMPATIBLE_ELEMENT_TYPE',
          message: `Cannot select on element [${targetIndex}] of type <${tag}>. Target must be a <select> or combobox.`,
        };
      }

      // If select has known options, check if option exists
      if (Array.isArray(el.options) && el.options.length > 0 && action.option) {
        const targetOpt = action.option.toLowerCase().trim();
        const matchesOption = el.options.some((opt) => {
          const val = (opt.value || '').toLowerCase().trim();
          const txt = (opt.text || '').toLowerCase().trim();
          return val === targetOpt || txt === targetOpt || txt.includes(targetOpt) || val.includes(targetOpt);
        });

        if (!matchesOption) {
          const available = el.options.map((o) => o.text || o.value).filter(Boolean);
          return {
            ok: false,
            code: 'INVALID_OPTION',
            message: `Option "${action.option}" not found in dropdown [${targetIndex}]. Available options: ${JSON.stringify(available)}`,
          };
        }
      }
      break;
    }

    case 'check':
    case 'uncheck': {
      const isCheckable =
        (tag === 'input' && (elType === 'checkbox' || elType === 'radio')) ||
        role === 'checkbox' ||
        role === 'radio' ||
        role === 'switch';

      if (!isCheckable) {
        return {
          ok: false,
          code: 'INCOMPATIBLE_ELEMENT_TYPE',
          message: `Cannot ${type} element [${targetIndex}] of type <${tag} type="${elType}">. Target must be a checkbox, radio, or switch.`,
        };
      }
      break;
    }

    case 'uploadFile': {
      if (tag !== 'input' || elType !== 'file') {
        return {
          ok: false,
          code: 'INCOMPATIBLE_ELEMENT_TYPE',
          message: `Cannot uploadFile to element [${targetIndex}] (<${tag} type="${elType}">). Target must be an <input type="file">.`,
        };
      }

      if (!action.fileRef || typeof action.fileRef !== 'string') {
        return {
          ok: false,
          code: 'MISSING_FILE_REF',
          message: 'uploadFile action requires a valid fileRef path string.',
        };
      }
      break;
    }

    case 'click': {
      // Click is allowed on all interactive elements
      break;
    }
  }

  return { ok: true };
};

/**
 * Validates a batch of sequential actions for a single step (enforces max 1 page-changing action).
 *
 * @param {Array<object>} actions
 * @param {object} observation
 * @param {object} [context]
 * @returns {{ ok: boolean, code?: string, message?: string, validatedActions?: Array<object> }}
 */
export const validateActionBatch = (actions = [], observation = {}, context = {}) => {
  if (!Array.isArray(actions) || actions.length === 0) {
    return { ok: false, code: 'EMPTY_ACTIONS_BATCH', message: 'Action batch must contain at least 1 action.' };
  }

  if (actions.length > 3) {
    return { ok: false, code: 'EXCEEDED_MAX_ACTIONS', message: 'Action batch cannot exceed 3 actions per step.' };
  }

  let pageChangingCount = 0;
  const elements = observation.elements || [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const validation = validateAction(action, observation, context);
    if (!validation.ok) {
      return {
        ok: false,
        code: validation.code,
        message: `Action [${i}] (${action.type}) validation failed: ${validation.message}`,
      };
    }

    // Determine if action is page-changing
    let isPageChanging = false;
    if (action.type === 'navigate' || action.type === 'submitApplication') {
      isPageChanging = true;
    } else if (action.type === 'click') {
      const el = elements.find((e) => e.index === action.index);
      if (el) {
        const tag = (el.tag || '').toLowerCase();
        const type = (el.type || '').toLowerCase();
        const text = (el.text || el.label || '').toLowerCase();
        if (tag === 'a' || type === 'submit' || text.includes('apply now') || text.includes('submit')) {
          isPageChanging = true;
        }
      }
    }

    if (isPageChanging) {
      pageChangingCount++;
    }
  }

  if (pageChangingCount > 1) {
    return {
      ok: false,
      code: 'MULTIPLE_PAGE_CHANGING_ACTIONS',
      message: `Action batch contains ${pageChangingCount} page-changing actions. At most 1 page-changing action is allowed per step.`,
    };
  }

  return { ok: true, validatedActions: actions };
};

export default {
  validateAction,
  validateActionBatch,
};
