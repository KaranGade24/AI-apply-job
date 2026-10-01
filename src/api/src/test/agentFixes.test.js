import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';

import { submitAnswersRequestSchema, confirmReviewRequestSchema } from '../agent/schema/agentStateSchema.js';
import { applyUserEditsToReview, computeReviewHash } from '../agent/browser/review/reviewBuilder.js';

describe('Phase A — Fix Commit Unit & Schema Test Suite', () => {
  it('1. Validates Zod 4 issues on bad payloads (submitAnswers)', () => {
    const invalidPayload = { answers: [] };
    const parsed = submitAnswersRequestSchema.safeParse(invalidPayload);
    assert.strictEqual(parsed.success, false);
    assert.ok(parsed.error.issues && parsed.error.issues.length > 0);
  });

  it('2. Validates Zod 4 issues on bad payloads (confirmReview)', () => {
    const invalidPayload = { approved: false, hash: '' };
    const parsed = confirmReviewRequestSchema.safeParse(invalidPayload);
    assert.strictEqual(parsed.success, false);
    assert.ok(parsed.error.issues && parsed.error.issues.length > 0);

    const validPayload = { approved: true, hash: 'abc12345' };
    const validParsed = confirmReviewRequestSchema.safeParse(validPayload);
    assert.strictEqual(validParsed.success, true);
  });

  it('3. Review builder and edit synchronization correctly recalculates reviewHash', () => {
    const initialReview = {
      fields: [
        { fieldIndex: 1, name: 'name', question: 'Name', answer: 'Alice', type: 'text' },
      ],
      attachments: [],
      generatedContent: [],
      reviewHash: computeReviewHash([
        { fieldIndex: 1, name: 'name', question: 'Name', answer: 'Alice', type: 'text' },
      ]),
      approved: true,
    };

    const edits = [{ fieldIndex: 1, answer: 'Bob' }];
    const { updatedReview, changedFields, diffActions } = applyUserEditsToReview({
      currentReview: initialReview,
      edits,
    });

    assert.strictEqual(changedFields.length, 1);
    assert.strictEqual(changedFields[0].newAnswer, 'Bob');
    assert.strictEqual(updatedReview.approved, false); // approval reset on edit
    assert.notStrictEqual(updatedReview.reviewHash, initialReview.reviewHash);
    assert.strictEqual(diffActions.length, 1);
    assert.strictEqual(diffActions[0].value, 'Bob');
  });
});
