import { chromium } from 'playwright';
import { executeAction } from '../browser/executor/browserExecutor.js';
import { BROWSER_ACTIONS } from '../constant/application.constant.js';
import assert from 'assert';

async function runExecutorTests() {
  console.log('--- STARTING BROWSER EXECUTOR TESTS ---');
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Prepare sandbox page
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Executor Sandbox</title></head>
      <body>
        <div id="wrapper">
          <label for="username">Username</label>
          <input type="text" id="username" name="username" placeholder="Type here" />
          
          <button id="normal-btn">Click Me</button>

          <!-- Intercepted / Overlay covered button to trigger forced click -->
          <div style="position: relative; width: 200px; height: 50px;">
            <button id="obstructed-btn" style="width: 100%; height: 100%;">Hidden Target</button>
            <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10;">
              Overlay Shield
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
    await page.setContent(html);

    // Initial page observation mock matching our layout
    const pageObservation = {
      pageRevision: 'rev_hash_abc_123',
      interactiveElements: [
        {
          elementId: 'el_user',
          id: 'username',
          tagName: 'input',
          visible: true,
          enabled: true,
          elementFingerprint: 'finger_user'
        },
        {
          elementId: 'el_btn',
          id: 'normal-btn',
          tagName: 'button',
          visible: true,
          enabled: true,
          elementFingerprint: 'finger_btn'
        },
        {
          elementId: 'el_obstructed',
          id: 'obstructed-btn',
          tagName: 'button',
          visible: true,
          enabled: true,
          elementFingerprint: 'finger_obstructed'
        }
      ]
    };

    // Test 1: Action Validation Rejection (Stale observation revision)
    console.log('Test 1: Rejects execution of stale/mismatched revision...');
    const staleAction = {
      actionId: 'act_stale',
      type: BROWSER_ACTIONS.CLICK,
      intent: 'test',
      target: { elementId: 'el_btn', elementFingerprint: 'finger_btn', id: 'normal-btn' },
      expectedOutcome: 'next_page',
      riskLevel: 'LOW',
      observationRevision: 'rev_hash_stale_old'
    };

    const res1 = await executeAction(page, staleAction, pageObservation);
    assert.strictEqual(res1.ok, false);
    assert.strictEqual(res1.executionEvidence.validated, false);
    assert.ok(res1.error.includes('Validation rejected'));
    console.log('✅ Test 1 Passed.');

    // Test 2: Successful input typing
    console.log('Test 2: Successfully executes text input filling...');
    const fillAction = {
      actionId: 'act_fill',
      type: BROWSER_ACTIONS.FILL,
      intent: 'fill_username',
      target: { elementId: 'el_user', elementFingerprint: 'finger_user', id: 'username', tagName: 'input' },
      value: 'hello_world',
      expectedOutcome: 'field_value_matches',
      riskLevel: 'LOW',
      observationRevision: 'rev_hash_abc_123'
    };

    const res2 = await executeAction(page, fillAction, pageObservation);
    assert.strictEqual(res2.ok, true);
    assert.strictEqual(res2.executionEvidence.validated, true);
    assert.strictEqual(res2.executionEvidence.tagName, 'input');
    
    // Assert value is actually typed in live browser
    const inputValue = await page.locator('#username').inputValue();
    assert.strictEqual(inputValue, 'hello_world');
    console.log('✅ Test 2 Passed.');

    // Test 3: Exceptional Fallback (Forced click when standard click is intercepted)
    console.log('Test 3: Triggers forced click fallback on obscured elements...');
    const clickAction = {
      actionId: 'act_obstructed',
      type: BROWSER_ACTIONS.CLICK,
      intent: 'click_button',
      target: { elementId: 'el_obstructed', elementFingerprint: 'finger_obstructed', id: 'obstructed-btn', tagName: 'button' },
      expectedOutcome: 'next_page',
      riskLevel: 'LOW',
      observationRevision: 'rev_hash_abc_123'
    };

    const res3 = await executeAction(page, clickAction, pageObservation);
    assert.strictEqual(res3.ok, true);
    assert.strictEqual(res3.executionEvidence.forced, true);
    assert.strictEqual(res3.executionEvidence.elevatedRisk, true);
    console.log('✅ Test 3 Passed.');

    console.log('🎉 ALL BROWSER EXECUTOR TESTS PASSED SUCCESSFULLY.');
  } catch (error) {
    console.error('❌ Executor Tests Failed:', error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runExecutorTests();
