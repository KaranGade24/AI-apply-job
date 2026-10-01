import { describe, it } from 'node:test';
import assert from 'node:assert';

process.env.NODE_ENV = 'test';

import { executeAction, resolveLocator, validateUploadPath, classifyActionError } from '../agent/browser/actions/executor.js';
import { evaluateActionResult } from '../agent/browser/actions/resultEvaluator.js';
import { ACTION_FAILURE_TYPES, PERCEPTION_PAGE_TYPES } from '../constant/agent.constant.js';

describe('Phase 7 Action Executor & Result Evaluator Test Suite', () => {
  // Test Suite 1: Locator Resolution & Execution
  describe('1. Executor Locator Resolution & Actions', () => {
    it('resolves locator using data-aij-ref selector', async () => {
      let querySelectorUsed = null;

      const mockPage = {
        locator: (sel) => {
          querySelectorUsed = sel;
          return {
            count: async () => 1,
            first: () => ({ isMockLocator: true }),
          };
        },
        frames: () => [],
      };

      const observation = {
        snapshotId: 'snap_456',
        elements: [{ index: 2, tag: 'input', label: 'Email' }],
      };

      const loc = await resolveLocator(mockPage, { index: 2 }, observation);
      assert.ok(loc);
      assert.strictEqual(querySelectorUsed, '[data-aij-ref="snap_456-2"]');
    });

    it('executes fill and click actions on mock page locators', async () => {
      let clicked = false;
      let filledValue = null;

      const mockLocator = {
        count: async () => 1,
        first: () => mockLocator,
        click: async () => {
          clicked = true;
        },
        fill: async (val) => {
          filledValue = val;
        },
      };

      const mockPage = {
        locator: () => mockLocator,
        frames: () => [],
        waitForLoadState: async () => {},
        waitForTimeout: async () => {},
      };

      const observation = {
        snapshotId: 'snap_456',
        pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
        elements: [
          { index: 0, tag: 'input', type: 'text', label: 'Name', visible: true },
          { index: 1, tag: 'button', text: 'Submit', visible: true },
        ],
      };

      // Test fill
      const fillRes = await executeAction(mockPage, { type: 'fill', index: 0, value: 'Karan Gade' }, observation);
      assert.strictEqual(fillRes.success, true);
      assert.strictEqual(filledValue, 'Karan Gade');

      // Test click
      const clickRes = await executeAction(mockPage, { type: 'click', index: 1 }, observation);
      assert.strictEqual(clickRes.success, true);
      assert.strictEqual(clicked, true);
    });

    it('validates uploadFile security and blocks directory traversal', () => {
      assert.throws(() => {
        validateUploadPath('../../../etc/shadow');
      }, /forbidden/i);

      assert.throws(() => {
        validateUploadPath('/etc/passwd');
      }, /forbidden/i);

      const safe = validateUploadPath('uploads/user_resume_123.pdf');
      assert.strictEqual(safe, 'uploads/user_resume_123.pdf');

      const explicitAllowed = validateUploadPath('arbitrary.pdf', { allowedFilePath: '/var/app/safe_resume.pdf' });
      assert.strictEqual(explicitAllowed, '/var/app/safe_resume.pdf');
    });
  });

  // Test Suite 2: Error Classification
  describe('2. Failure Classification Mapping', () => {
    it('classifies canonical failure types correctly', () => {
      assert.strictEqual(classifyActionError('Timeout 10000ms exceeded waiting for locator'), ACTION_FAILURE_TYPES.TIMEOUT);
      assert.strictEqual(classifyActionError('Action snapshotId does not match current observation (STALE_SNAPSHOT)'), ACTION_FAILURE_TYPES.STALE_SNAPSHOT);
      assert.strictEqual(classifyActionError('Target element could not be found (ELEMENT_GONE)'), ACTION_FAILURE_TYPES.ELEMENT_GONE);
      assert.strictEqual(classifyActionError('Element [2] is disabled and cannot be clicked'), ACTION_FAILURE_TYPES.DISABLED);
      assert.strictEqual(classifyActionError('net::ERR_NAME_NOT_RESOLVED'), ACTION_FAILURE_TYPES.NAVIGATION_FAILED);
      assert.strictEqual(classifyActionError('Page blocked by Turnstile CAPTCHA challenge'), ACTION_FAILURE_TYPES.BLOCKED);
    });

    it('returns ELEMENT_GONE when target element count is 0 in DOM', async () => {
      const mockPage = {
        locator: () => ({
          count: async () => 0,
        }),
        frames: () => [],
      };

      const observation = {
        snapshotId: 'snap_456',
        pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
        elements: [{ index: 0, tag: 'input', label: 'Name' }],
      };

      const res = await executeAction(mockPage, { type: 'click', index: 0 }, observation);
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.errorType, ACTION_FAILURE_TYPES.ELEMENT_GONE);
    });
  });

  // Test Suite 3: Result Evaluator
  describe('3. Result Evaluator Observations Comparison', () => {
    it('detects URL change and transition to next step in multi-step form', () => {
      const before = {
        url: 'https://careers.corp.com/apply/step-1',
        activeTabId: 'tab_1',
        elements: [{ index: 0, tag: 'input', label: 'Name' }],
        visibleTextTrimmed: 'Step 1: Personal Info',
      };

      const after = {
        url: 'https://careers.corp.com/apply/step-2',
        activeTabId: 'tab_1',
        elements: [{ index: 0, tag: 'input', type: 'file', label: 'Resume' }],
        visibleTextTrimmed: 'Step 2: Upload Resume',
      };

      const evalResult = evaluateActionResult({
        beforeObservation: before,
        afterObservation: after,
        executedAction: { type: 'click', index: 1 },
        executionResult: { success: true },
      });

      assert.strictEqual(evalResult.success, true);
      assert.strictEqual(evalResult.urlChanged, true);
      assert.strictEqual(evalResult.pageChanged, true);
      assert.strictEqual(evalResult.domChanged, true);
    });

    it('detects dynamic DOM changes when opening a modal dialog', () => {
      const before = {
        url: 'https://company.com/job/1',
        visibleTextTrimmed: 'Job Details page',
        elements: [{ index: 0, tag: 'button', text: 'Apply Now' }],
      };

      const after = {
        url: 'https://company.com/job/1',
        visibleTextTrimmed: 'Job Details page Modal: Submit your application',
        elements: [
          { index: 0, tag: 'button', text: 'Apply Now' },
          { index: 1, tag: 'input', label: 'First Name' },
          { index: 2, tag: 'input', label: 'Email' },
        ],
      };

      const evalResult = evaluateActionResult({
        beforeObservation: before,
        afterObservation: after,
        executedAction: { type: 'click', index: 0 },
        executionResult: { success: true },
      });

      assert.strictEqual(evalResult.success, true);
      assert.strictEqual(evalResult.urlChanged, false);
      assert.strictEqual(evalResult.domChanged, true);
      assert.strictEqual(evalResult.pageChanged, true);
    });

    it('flags failure when landing on a CAPTCHA or blocked page', () => {
      const before = {
        url: 'https://careers.corp.com/apply',
        pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
      };

      const after = {
        url: 'https://careers.corp.com/challenge',
        pageType: PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED,
        visibleTextTrimmed: 'Verify you are human',
      };

      const evalResult = evaluateActionResult({
        beforeObservation: before,
        afterObservation: after,
        executedAction: { type: 'click', index: 5 },
        executionResult: { success: true },
      });

      assert.strictEqual(evalResult.success, false);
      assert.strictEqual(evalResult.errorType, ACTION_FAILURE_TYPES.BLOCKED);
    });
  });
});
