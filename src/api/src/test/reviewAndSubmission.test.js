import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';

import {
  computeReviewHash,
  buildFinalReview,
  applyUserEditsToReview,
} from '../agent/browser/review/reviewBuilder.js';
import {
  verifySubmissionState,
  buildRedactedSubmissionSummary,
} from '../agent/browser/review/verifySubmission.js';
import { validateAction } from '../agent/browser/actions/validator.js';

describe('Phase 11 — Final Review, Submission & Verification Test Suite', () => {
  // 1. reviewBuilder Unit Tests
  describe('1. Review Builder & Live Edit Synchronization', () => {
    const mockFields = [
      { index: 1, name: 'fullName', label: 'Full Name', currentValue: 'Alice Smith', type: 'text', required: true },
      { index: 2, name: 'email', label: 'Email Address', currentValue: 'alice@example.com', type: 'email', required: true },
      { index: 3, name: 'yearsExp', label: 'Years of Experience', currentValue: '5', type: 'number', required: false },
      { index: 4, name: 'authorized', label: 'Authorized to work in US?', currentValue: true, type: 'checkbox', required: true },
      { index: 5, name: 'resumeFile', label: 'Upload Resume', currentValue: 'resume.pdf', type: 'file', required: true },
    ];

    const mockAnswers = [
      { fieldIndex: 1, questionId: 'fullName', value: 'Alice Smith', source: 'profile' },
      { fieldIndex: 2, questionId: 'email', value: 'alice@example.com', source: 'profile' },
      { fieldIndex: 3, questionId: 'yearsExp', value: '5', source: 'resume' },
      { fieldIndex: 4, questionId: 'authorized', value: true, source: 'profile' },
    ];

    it('builds finalReview with normalized fields, hash, and metadata without submitting', () => {
      const review = buildFinalReview({
        observation: { url: 'https://careers.example.com/apply', title: 'Submit Job Application' },
        formFields: mockFields,
        answers: mockAnswers,
        attachments: [{ name: 'resume.pdf', size: 10240 }],
        generatedContent: [{ type: 'custom_answer', title: 'Why Us?', text: 'Passionate team' }],
      });

      assert.ok(review);
      assert.strictEqual(review.approved, false);
      assert.strictEqual(review.approvedAt, null);
      assert.ok(typeof review.reviewHash === 'string' && review.reviewHash.length === 16);
      assert.strictEqual(review.fields.length, 5);

      // Verify file field is not directly editable inline
      const fileField = review.fields.find((f) => f.name === 'resumeFile');
      assert.strictEqual(fileField.editable, false);

      // Text fields are editable
      const nameField = review.fields.find((f) => f.name === 'fullName');
      assert.strictEqual(nameField.editable, true);
      assert.strictEqual(nameField.answer, 'Alice Smith');
    });

    it('applies user edits, regenerates reviewHash, and outputs diffActions for live form sync', () => {
      const initialReview = buildFinalReview({
        observation: { url: 'https://careers.example.com/apply' },
        formFields: mockFields,
        answers: mockAnswers,
      });

      const initialHash = initialReview.reviewHash;

      // User modifies years of experience from 5 to 7
      const edits = [
        { fieldIndex: 3, answer: '7' },
      ];

      const { updatedReview, changedFields, diffActions } = applyUserEditsToReview({
        currentReview: initialReview,
        edits,
      });

      assert.strictEqual(changedFields.length, 1);
      assert.strictEqual(changedFields[0].fieldIndex, 3);
      assert.strictEqual(changedFields[0].previousAnswer, '5');
      assert.strictEqual(changedFields[0].newAnswer, '7');

      // Hash regenerated and differs from initial
      assert.notStrictEqual(updatedReview.reviewHash, initialHash);
      assert.strictEqual(updatedReview.approved, false);

      // Diff action generated to re-fill field on live page
      assert.strictEqual(diffActions.length, 1);
      assert.strictEqual(diffActions[0].type, 'fill');
      assert.strictEqual(diffActions[0].index, 3);
      assert.strictEqual(diffActions[0].value, '7');
    });
  });

  // 2. Action Validator Submission Protection Tests
  describe('2. Validator Pre-Submission Enforcement', () => {
    const observation = {
      elements: [
        { index: 10, type: 'submit', text: 'Submit Application' },
      ],
    };

    it('rejects submitApplication when finalReview is unapproved', () => {
      const result = validateAction(
        { type: 'submitApplication' },
        observation,
        {
          finalReview: { approved: false, reviewHash: 'hash_abc123' },
          currentAnswersHash: 'hash_abc123',
        }
      );

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'SUBMISSION_NOT_APPROVED');
    });

    it('rejects submitApplication when answers were modified after approval (hash mismatch)', () => {
      const result = validateAction(
        { type: 'submitApplication' },
        observation,
        {
          finalReview: { approved: true, reviewHash: 'hash_approved_old' },
          currentAnswersHash: 'hash_modified_new',
        }
      );

      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.code, 'ANSWERS_CHANGED_AFTER_REVIEW');
    });

    it('allows submitApplication when review is approved and hash matches current answers', () => {
      const result = validateAction(
        { type: 'submitApplication' },
        observation,
        {
          finalReview: { approved: true, reviewHash: 'hash_valid_match' },
          currentAnswersHash: 'hash_valid_match',
        }
      );

      assert.strictEqual(result.ok, true);
    });
  });

  // 3. verifySubmission Tests Against Multi-Scenario Fixtures
  describe('3. Submission Verification (Never Assume Success)', () => {
    it('detects confirmed submission with thank-you text and confirmation number', () => {
      const obs = {
        url: 'https://workday.com/portal/success',
        title: 'Thank You',
        visibleTextTrimmed: 'Thank you for applying to Acme Corp! Your application has been submitted. Application ID: ACME-987654. We will contact you soon.',
        elements: [],
      };

      const result = verifySubmissionState(obs);

      assert.strictEqual(result.status, 'SUBMITTED');
      assert.strictEqual(result.outcome, 'SUBMITTED');
      assert.strictEqual(result.confirmationNumber, 'ACME-987654');
      assert.strictEqual(result.errors.length, 0);
    });

    it('detects confirmed submission by success confirmation URL alone', () => {
      const obs = {
        url: 'https://careers.google.com/jobs/submitted/thank-you',
        title: 'Application Received',
        visibleTextTrimmed: 'Your profile has been shared with the hiring manager.',
        elements: [],
      };

      const result = verifySubmissionState(obs);

      assert.strictEqual(result.status, 'SUBMITTED');
      assert.ok(result.confirmationNumber);
    });

    it('detects validation errors and marks status as FAILED', () => {
      const obs = {
        url: 'https://company.greenhouse.io/jobs/12345/apply',
        title: 'Job Application',
        visibleTextTrimmed: 'Please fix the following errors before proceeding: Phone number is invalid. Required field is missing.',
        elements: [
          { index: 5, role: 'alert', text: 'Phone number is invalid.' },
        ],
      };

      const result = verifySubmissionState(obs);

      assert.strictEqual(result.status, 'FAILED');
      assert.strictEqual(result.outcome, 'FAILED');
      assert.strictEqual(result.confirmationNumber, null);
      assert.ok(result.errors.length > 0);
    });

    it('marks ambiguous landing/catalog redirect as UNVERIFIED (never assumes success)', () => {
      const obs = {
        url: 'https://company.greenhouse.io/careers',
        title: 'Open Positions',
        visibleTextTrimmed: 'Explore our open engineering and sales positions worldwide.',
        elements: [
          { index: 1, text: 'Search Jobs' },
        ],
      };

      const result = verifySubmissionState(obs);

      assert.strictEqual(result.status, 'UNVERIFIED');
      assert.strictEqual(result.outcome, 'UNVERIFIED');
      assert.strictEqual(result.confirmationNumber, null);
    });

    it('redacts sensitive fields in the submission summary', () => {
      const finalReview = {
        fields: [
          { question: 'Full Name', answer: 'John Doe' },
          { question: 'Social Security Number (SSN)', name: 'ssn', answer: '123-45-6789' },
          { question: 'Account Password', name: 'password', answer: 'SecretPass123!' },
          { question: 'Years Experience', answer: '4' },
        ],
        attachments: [
          { name: 'JohnDoeResume.pdf', size: '250KB' },
        ],
      };

      const summary = buildRedactedSubmissionSummary(finalReview);

      assert.ok(summary.includes('John Doe'));
      assert.ok(summary.includes('JohnDoeResume.pdf'));
      // SSN and password must be redacted
      assert.ok(!summary.includes('123-45-6789'));
      assert.ok(!summary.includes('SecretPass123!'));
      assert.ok(summary.includes('[REDACTED]'));
    });
  });
});
