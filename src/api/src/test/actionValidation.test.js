import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';

import { actionSchema, agentStepOutputSchema } from '../agent/schema/actionSchema.js';
import { validateAction, validateActionBatch } from '../agent/browser/actions/validator.js';
import { PERCEPTION_PAGE_TYPES } from '../constant/agent.constant.js';

describe('Phase 6 Action Schema & Validator Test Suite', () => {
  // Test Suite 1: Action Schema & Discriminated Union
  describe('1. Action Schema Validation', () => {
    it('parses all supported action types correctly', () => {
      const actions = [
        { type: 'navigate', url: 'https://careers.google.com/jobs' },
        { type: 'click', index: 5 },
        { type: 'fill', index: 2, value: 'John Doe', source: 'profile' },
        { type: 'select', index: 4, option: 'United States' },
        { type: 'check', index: 7 },
        { type: 'uncheck', index: 8 },
        { type: 'uploadFile', index: 9, fileRef: '/path/to/resume.pdf' },
        { type: 'scroll', direction: 'down', amount: 500 },
        { type: 'pressKey', key: 'Enter' },
        { type: 'waitFor', ms: 1000 },
        { type: 'extract', goal: 'Extract job salary and requirements' },
        { type: 'askHuman', questionId: 'q1', question: 'Do you require visa sponsorship?', reason: 'missing_info', required: true },
        { type: 'requestReview' },
        { type: 'submitApplication' },
        { type: 'finish', summary: 'Application completed' },
        { type: 'fail', reason: 'Form closed' },
      ];

      for (const act of actions) {
        const parsed = actionSchema.safeParse(act);
        assert.strictEqual(parsed.success, true, `Failed to parse action type: ${act.type}`);
      }
    });

    it('validates agent step output schema with 1 to 3 actions', () => {
      const stepOutput = {
        evaluationOfPreviousAction: 'Successfully filled personal info fields',
        memory: 'On step 2 of 3 in application portal',
        nextGoal: 'Upload tailored resume PDF',
        actions: [
          { type: 'uploadFile', index: 3, fileRef: '/uploads/resume.pdf' },
          { type: 'click', index: 10 },
        ],
      };

      const parsed = agentStepOutputSchema.safeParse(stepOutput);
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.data.actions.length, 2);
    });

    it('rejects step output with 0 or >3 actions', () => {
      const empty = {
        evaluationOfPreviousAction: 'eval',
        memory: 'mem',
        nextGoal: 'goal',
        actions: [],
      };
      assert.strictEqual(agentStepOutputSchema.safeParse(empty).success, false);

      const tooMany = {
        evaluationOfPreviousAction: 'eval',
        memory: 'mem',
        nextGoal: 'goal',
        actions: [
          { type: 'click', index: 1 },
          { type: 'click', index: 2 },
          { type: 'click', index: 3 },
          { type: 'click', index: 4 },
        ],
      };
      assert.strictEqual(agentStepOutputSchema.safeParse(tooMany).success, false);
    });
  });

  // Test Suite 2: Validator - Element & Stale Snapshot Rules
  describe('2. Element & Stale Snapshot Validation', () => {
    const mockObservation = {
      snapshotId: 'snap_123',
      pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
      elements: [
        { index: 0, tag: 'input', type: 'text', label: 'Full Name', visible: true, disabled: false },
        { index: 1, tag: 'input', type: 'email', label: 'Email', visible: true, disabled: false },
        { index: 2, tag: 'button', text: 'Submit', visible: true, disabled: true }, // disabled
        { index: 3, tag: 'input', type: 'text', label: 'Hidden Field', visible: false, disabled: false }, // not visible
        { index: 4, tag: 'input', type: 'password', label: 'Password', isSensitive: true, visible: true, disabled: false },
        { index: 5, tag: 'select', name: 'country', options: [{ value: 'US', text: 'United States' }, { value: 'IN', text: 'India' }], visible: true, disabled: false },
        { index: 6, tag: 'input', type: 'checkbox', label: 'Terms', visible: true, disabled: false },
        { index: 7, tag: 'input', type: 'file', label: 'Resume', visible: true, disabled: false },
      ],
    };

    it('rejects action referencing a stale snapshotId', () => {
      const action = { type: 'click', index: 0, snapshotId: 'snap_old_999' };
      const res = validateAction(action, mockObservation);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'STALE_SNAPSHOT');
    });

    it('rejects action targeting non-existent element index', () => {
      const action = { type: 'click', index: 99 };
      const res = validateAction(action, mockObservation);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'ELEMENT_NOT_FOUND');
    });

    it('rejects action targeting disabled element', () => {
      const action = { type: 'click', index: 2 };
      const res = validateAction(action, mockObservation);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'ELEMENT_DISABLED');
    });
  });

  // Test Suite 3: Validator - Type Compatibility & Value Formats
  describe('3. Type Compatibility & Value Validation', () => {
    const mockObservation = {
      snapshotId: 'snap_123',
      pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
      elements: [
        { index: 0, tag: 'input', type: 'text', label: 'Full Name', visible: true, disabled: false },
        { index: 1, tag: 'input', type: 'email', label: 'Email', visible: true, disabled: false },
        { index: 2, tag: 'input', type: 'number', label: 'Years of Experience', visible: true, disabled: false },
        { index: 3, tag: 'select', name: 'country', options: [{ value: 'US', text: 'United States' }, { value: 'IN', text: 'India' }], visible: true, disabled: false },
        { index: 4, tag: 'input', type: 'checkbox', label: 'Terms', visible: true, disabled: false },
        { index: 5, tag: 'input', type: 'file', label: 'Resume', visible: true, disabled: false },
        { index: 6, tag: 'button', text: 'Save', visible: true, disabled: false },
      ],
    };

    it('rejects fill on a select or button element', () => {
      const res1 = validateAction({ type: 'fill', index: 3, value: 'United States' }, mockObservation);
      assert.strictEqual(res1.ok, false);
      assert.strictEqual(res1.code, 'INCOMPATIBLE_ELEMENT_TYPE');

      const res2 = validateAction({ type: 'fill', index: 6, value: 'Some text' }, mockObservation);
      assert.strictEqual(res2.ok, false);
      assert.strictEqual(res2.code, 'INCOMPATIBLE_ELEMENT_TYPE');
    });

    it('rejects select action on a text input', () => {
      const res = validateAction({ type: 'select', index: 0, option: 'United States' }, mockObservation);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'INCOMPATIBLE_ELEMENT_TYPE');
    });

    it('rejects check/uncheck on a text input', () => {
      const res = validateAction({ type: 'check', index: 0 }, mockObservation);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'INCOMPATIBLE_ELEMENT_TYPE');
    });

    it('rejects uploadFile on a text input or checkbox', () => {
      const res = validateAction({ type: 'uploadFile', index: 0, fileRef: '/file.pdf' }, mockObservation);
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'INCOMPATIBLE_ELEMENT_TYPE');
    });

    it('rejects invalid email and invalid number formats on typed inputs', () => {
      const badEmail = validateAction({ type: 'fill', index: 1, value: 'not-an-email' }, mockObservation);
      assert.strictEqual(badEmail.ok, false);
      assert.strictEqual(badEmail.code, 'INVALID_EMAIL_FORMAT');

      const badNumber = validateAction({ type: 'fill', index: 2, value: 'five-years' }, mockObservation);
      assert.strictEqual(badNumber.ok, false);
      assert.strictEqual(badNumber.code, 'INVALID_NUMBER_FORMAT');

      const goodEmail = validateAction({ type: 'fill', index: 1, value: 'dev@company.com' }, mockObservation);
      assert.strictEqual(goodEmail.ok, true);
    });

    it('validates select option presence in dropdown', () => {
      const badOption = validateAction({ type: 'select', index: 3, option: 'Germany' }, mockObservation);
      assert.strictEqual(badOption.ok, false);
      assert.strictEqual(badOption.code, 'INVALID_OPTION');

      const goodOption = validateAction({ type: 'select', index: 3, option: 'United States' }, mockObservation);
      assert.strictEqual(goodOption.ok, true);
    });
  });

  // Test Suite 4: Security - URLs, Sensitive Fields, Submission Protection
  describe('4. Security & Safety Rules', () => {
    const mockObservation = {
      snapshotId: 'snap_123',
      pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
      elements: [
        { index: 0, tag: 'input', type: 'password', label: 'Password', isSensitive: true, visible: true, disabled: false },
      ],
    };

    it('rejects navigation to non-HTTP protocols and local/private network hosts', () => {
      const badProtocols = ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html;base64,abc'];
      for (const url of badProtocols) {
        const res = validateAction({ type: 'navigate', url }, mockObservation);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'DISALLOWED_PROTOCOL');
      }

      const badHosts = [
        'http://localhost:3000/admin',
        'http://127.0.0.1:5000/leak',
        'http://192.168.1.1/router',
        'http://10.0.0.1/internal',
        'http://169.254.169.254/latest/meta-data',
      ];
      for (const url of badHosts) {
        const res = validateAction({ type: 'navigate', url }, mockObservation);
        assert.strictEqual(res.ok, false);
        assert.strictEqual(res.code, 'FORBIDDEN_HOST');
      }

      const validUrl = validateAction({ type: 'navigate', url: 'https://jobs.apple.com/us/apply' }, mockObservation);
      assert.strictEqual(validUrl.ok, true);
    });

    it('rejects AI direct fill on sensitive fields unless source is human/user', () => {
      const aiFill = validateAction({ type: 'fill', index: 0, value: 'secret123', source: 'ai' }, mockObservation);
      assert.strictEqual(aiFill.ok, false);
      assert.strictEqual(aiFill.code, 'SENSITIVE_FIELD_PROTECTED');

      const humanFill = validateAction({ type: 'fill', index: 0, value: 'secret123', source: 'human' }, mockObservation);
      assert.strictEqual(humanFill.ok, true);
    });

    it('rejects submitApplication unless user review is approved and answer hash matches', () => {
      // 1. Unapproved
      const unapproved = validateAction({ type: 'submitApplication' }, mockObservation, { finalReview: { approved: false } });
      assert.strictEqual(unapproved.ok, false);
      assert.strictEqual(unapproved.code, 'SUBMISSION_NOT_APPROVED');

      // 2. Hash mismatch (answers modified after review)
      const hashMismatch = validateAction(
        { type: 'submitApplication' },
        mockObservation,
        {
          finalReview: { approved: true, hash: 'hash_abc' },
          currentAnswersHash: 'hash_xyz',
        }
      );
      assert.strictEqual(hashMismatch.ok, false);
      assert.strictEqual(hashMismatch.code, 'ANSWERS_CHANGED_AFTER_REVIEW');

      // 3. Valid approved submission
      const approved = validateAction(
        { type: 'submitApplication' },
        mockObservation,
        {
          finalReview: { approved: true, hash: 'hash_abc' },
          currentAnswersHash: 'hash_abc',
        }
      );
      assert.strictEqual(approved.ok, true);
    });

    it('blocks automated actions when page is CAPTCHA_OR_BLOCKED', () => {
      const blockedObservation = {
        snapshotId: 'snap_blocked',
        pageType: PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED,
        elements: [{ index: 0, tag: 'button', text: 'Verify' }],
      };

      const fillRes = validateAction({ type: 'click', index: 0 }, blockedObservation);
      assert.strictEqual(fillRes.ok, false);
      assert.strictEqual(fillRes.code, 'BLOCKED_BY_CAPTCHA');

      // askHuman is permitted on blocked pages to request user assistance
      const askHumanRes = validateAction(
        { type: 'askHuman', questionId: 'captcha_help', question: 'Please solve the CAPTCHA in browser', reason: 'captcha' },
        blockedObservation
      );
      assert.strictEqual(askHumanRes.ok, true);
    });
  });

  // Test Suite 5: Batch Validation & Max 1 Page-Changing Action Rule
  describe('5. Batch Action Validation & Page-Changing Limits', () => {
    const mockObservation = {
      snapshotId: 'snap_123',
      pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
      elements: [
        { index: 0, tag: 'input', type: 'text', label: 'First Name', visible: true, disabled: false },
        { index: 1, tag: 'input', type: 'text', label: 'Last Name', visible: true, disabled: false },
        { index: 2, tag: 'a', text: 'Next Page', visible: true, disabled: false }, // link -> page-changing
        { index: 3, tag: 'button', type: 'submit', text: 'Submit Application', visible: true, disabled: false }, // submit -> page-changing
      ],
    };

    it('permits multiple form fills in a single batch', () => {
      const batch = [
        { type: 'fill', index: 0, value: 'Karan', source: 'profile' },
        { type: 'fill', index: 1, value: 'Gade', source: 'profile' },
      ];

      const res = validateActionBatch(batch, mockObservation);
      assert.strictEqual(res.ok, true);
    });

    it('permits 1 page-changing action at the end of a batch', () => {
      const batch = [
        { type: 'fill', index: 0, value: 'Karan', source: 'profile' },
        { type: 'click', index: 2 }, // 1 page changing click
      ];

      const res = validateActionBatch(batch, mockObservation);
      assert.strictEqual(res.ok, true);
    });

    it('rejects batch containing more than 1 page-changing action', () => {
      const batch = [
        { type: 'navigate', url: 'https://example.com/step1' },
        { type: 'submitApplication' },
      ];

      const res = validateActionBatch(batch, mockObservation, { finalReview: { approved: true } });
      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.code, 'MULTIPLE_PAGE_CHANGING_ACTIONS');
    });
  });
});
