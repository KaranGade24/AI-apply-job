import { buildFormModel } from '../form/formModel.js';
import { resolveFieldAnswer } from '../answer/answerResolver.js';
import { logJobEvent } from '../../utils/logger.js';

/**
 * Plans a set of browser actions to fill the current form section,
 * handling dependent fields, validation reads, and multi-step continuations.
 *
 * @param {object} state - BrowserState
 * @param {object} candidateFacts - Candidate JSON profile facts
 * @param {object} jobFacts - Job document details
 * @param {object} approvedAnswers - Previously human approved answers
 * @param {object} session - In-memory browser session
 * @returns {Array<object>} List of planned browser actions
 */
export const planFormFilling = (state, candidateFacts, jobFacts, approvedAnswers, session) => {
  session.filledQuestions = session.filledQuestions || new Set();
  const formModel = buildFormModel(state.elements);
  const plannedActions = [];

  // Group all fields in page order
  const allFields = formModel.sections.flatMap(sec => sec.fields);

  for (const field of allFields) {
    const questionId = `${field.tag}_${field.type || ''}_${field.accessibleName}`;
    
    // Avoid double-filling if already processed in previous steps
    if (session.filledQuestions.has(questionId)) {
      continue;
    }

    const answer = resolveFieldAnswer(field, candidateFacts, jobFacts, approvedAnswers);

    if (answer.source === 'human' || answer.needsReview) {
      // Escalate immediately
      plannedActions.push({
        type: 'askHuman',
        question: `Could you help fill this field: "${field.accessibleName}"?`,
        fieldIndex: field.id,
        reason: answer.reason || 'Needs human input or validation verification.',
        required: field.required
      });
      break; // Stop and ask the human first
    }

    // Formulate fill action
    if (field.tag === 'input' && (field.type === 'checkbox' || field.type === 'radio')) {
      if (answer.value) {
        plannedActions.push({ type: 'check', index: field.id });
        session.filledQuestions.add(questionId);
      }
    } else if (field.tag === 'select') {
      plannedActions.push({ type: 'selectOption', index: field.id, option: String(answer.value) });
      session.filledQuestions.add(questionId);
    } else {
      plannedActions.push({ type: 'input', index: field.id, text: String(answer.value) });
      session.filledQuestions.add(questionId);
    }

    // Stop and re-observe if we planned up to 4 fill actions to ensure stability and re-observation
    if (plannedActions.length >= 4) {
      break;
    }
  }

  // Handle multi-step navigation:
  // If we have filled all current step fields, and there is a Next/Continue button, click it
  if (plannedActions.length === 0 && formModel.stepIndicators.nextButtons.length > 0) {
    const nextBtn = formModel.stepIndicators.nextButtons[0];
    logJobEvent('fillPlanner', 'NEXT_STEP', `No empty fields left. Transitioning to next step using: ${nextBtn.accessibleName}`);
    plannedActions.push({
      type: 'click',
      index: nextBtn.id
    });
  }

  return plannedActions;
};

export default {
  planFormFilling
};
