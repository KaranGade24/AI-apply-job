import crypto from 'crypto';
import { logJobEvent } from '../../../utils/logger.js';

/**
 * Computes a deterministic SHA-256 review hash for the candidate pre-submission review.
 * Ensures strict integrity between user-approved state and live submitted form fields.
 *
 * @param {Array<object>} fields
 * @param {Array<object>} [attachments=[]]
 * @param {Array<object>} [generatedContent=[]]
 * @returns {string}
 */
export const computeReviewHash = (fields = [], attachments = [], generatedContent = []) => {
  const normalizedFields = (fields || [])
    .map((f) => `${f.question || f.name || f.questionId || ''}:${String(f.answer ?? f.value ?? '')}`)
    .sort()
    .join('|');

  const normalizedAttachments = (attachments || [])
    .map((a) => `${a.name || ''}:${a.size || ''}`)
    .sort()
    .join('|');

  const normalizedGenContent = (generatedContent || [])
    .map((g) => `${g.title || g.type || ''}:${String(g.text || '')}`)
    .sort()
    .join('|');

  const raw = `FIELDS[${normalizedFields}]::ATTACHMENTS[${normalizedAttachments}]::GEN[${normalizedGenContent}]`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
};

/**
 * Builds the comprehensive pre-submission Final Review structure.
 *
 * @param {object} params
 * @param {object} [params.observation] - Current browser page observation
 * @param {Array<object>} [params.formFields=[]] - Normalized form fields
 * @param {Array<object>} [params.answers=[]] - Candidate answer mappings
 * @param {Array<object>} [params.attachments=[]] - Uploaded attachments/resume files
 * @param {Array<object>} [params.generatedContent=[]] - AI generated answers or cover letters
 * @returns {object} The finalReview payload
 */
export const buildFinalReview = ({
  observation = {},
  formFields = [],
  answers = [],
  attachments = [],
  generatedContent = [],
} = {}) => {
  const fields = [];

  // 1. Merge formFields with answer mappings
  for (const field of formFields) {
    const matchedAnswer = answers.find(
      (a) => a.fieldIndex === field.index || (a.questionId && (a.questionId === field.name || a.questionId === field.label))
    );

    const answerValue = matchedAnswer ? matchedAnswer.value ?? matchedAnswer.answer : field.currentValue ?? '';
    const source = matchedAnswer?.source || (field.currentValue ? 'page_default' : 'unanswered');

    fields.push({
      fieldIndex: field.index,
      name: field.name || '',
      question: field.label || field.placeholder || field.name || `Field [${field.index}]`,
      answer: answerValue,
      source,
      type: field.type || field.tag || 'text',
      required: Boolean(field.required),
      editable: field.type !== 'file',
      options: field.options || [],
    });
  }

  // 2. Include any standalone candidate answers not directly tied to a visible form field
  for (const ans of answers) {
    const alreadyIncluded = fields.some(
      (f) => f.fieldIndex === ans.fieldIndex || (ans.questionId && f.name === ans.questionId)
    );
    if (!alreadyIncluded && ans.answer !== undefined) {
      fields.push({
        fieldIndex: ans.fieldIndex ?? null,
        name: ans.questionId || '',
        question: ans.question || ans.questionId || 'Additional Question',
        answer: ans.answer,
        source: ans.source || 'profile',
        type: 'text',
        required: false,
        editable: true,
      });
    }
  }

  const reviewHash = computeReviewHash(fields, attachments, generatedContent);
  const createdAt = new Date().toISOString();

  logJobEvent('reviewBuilder', 'FINAL_REVIEW_BUILT', `Built review with ${fields.length} fields. Hash: ${reviewHash}`);

  return {
    fields,
    generatedContent,
    attachments,
    reviewHash,
    createdAt,
    approved: false,
    approvedAt: null,
    url: observation.url || '',
    title: observation.title || '',
  };
};

/**
 * Applies user edits to an existing final review, detects value differences,
 * generates required browser actions to synchronize the live form, and regenerates the reviewHash.
 *
 * @param {object} params
 * @param {object} params.currentReview - Existing finalReview object
 * @param {Array<{ fieldIndex?: number, question?: string, name?: string, answer: any }>} params.edits - User edits
 * @returns {{ updatedReview: object, changedFields: Array<object>, diffActions: Array<object> }}
 */
export const applyUserEditsToReview = ({ currentReview, edits = [] } = {}) => {
  if (!currentReview) return { updatedReview: null, changedFields: [], diffActions: [] };

  const updatedFields = currentReview.fields.map((f) => ({ ...f }));
  const changedFields = [];
  const diffActions = [];

  for (const edit of edits) {
    const target = updatedFields.find(
      (f) =>
        (edit.fieldIndex !== undefined && f.fieldIndex === edit.fieldIndex) ||
        (edit.name && f.name === edit.name) ||
        (edit.question && f.question === edit.question)
    );

    if (target && target.answer !== edit.answer) {
      const prevAnswer = target.answer;
      target.answer = edit.answer;
      target.source = 'user_edited';

      changedFields.push({
        fieldIndex: target.fieldIndex,
        name: target.name,
        previousAnswer: prevAnswer,
        newAnswer: edit.answer,
      });

      // Build live form diff action if element has valid numeric index
      if (typeof target.fieldIndex === 'number' && target.fieldIndex >= 0) {
        if (target.type === 'select') {
          diffActions.push({ type: 'select', index: target.fieldIndex, option: String(edit.answer) });
        } else if (target.type === 'checkbox') {
          diffActions.push({ type: edit.answer ? 'check' : 'uncheck', index: target.fieldIndex });
        } else if (target.type === 'radio') {
          if (edit.answer) diffActions.push({ type: 'check', index: target.fieldIndex });
        } else {
          diffActions.push({ type: 'fill', index: target.fieldIndex, value: String(edit.answer), source: 'user_edited' });
        }
      }
    }
  }

  const newHash = computeReviewHash(updatedFields, currentReview.attachments, currentReview.generatedContent);

  const updatedReview = {
    ...currentReview,
    fields: updatedFields,
    reviewHash: newHash,
    // Reset approval if answers were modified
    approved: changedFields.length === 0 ? currentReview.approved : false,
    approvedAt: changedFields.length === 0 ? currentReview.approvedAt : null,
    updatedAt: new Date().toISOString(),
  };

  logJobEvent(
    'reviewBuilder',
    'USER_EDITS_APPLIED',
    `Applied ${changedFields.length} edits. New ReviewHash: ${newHash}`
  );

  return {
    updatedReview,
    changedFields,
    diffActions,
  };
};

export default {
  computeReviewHash,
  buildFinalReview,
  applyUserEditsToReview,
};
