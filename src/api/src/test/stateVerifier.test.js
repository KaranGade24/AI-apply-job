import { chromium } from "../services/browser/useBrowserJs.js";
import { verifyStateTransition } from "../browser/verifier/stateVerifier.js";
import { BROWSER_ACTIONS } from "../constant/application.constant.js";
import { checkPlaywrightAvailable } from "./helpers/playwrightAvailable.js";
import assert from "assert";

async function runVerifierTests() {
  console.log("--- STARTING HIGH-RELIABILITY STATE VERIFIER TESTS ---");
  if (!(await checkPlaywrightAvailable())) {
    console.log("SKIP: Chromium is unavailable.");
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Prepare a mock interactive page setup
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Verifier Sandbox</title></head>
      <body>
        <div>
          <!-- Field with input value reset bug (simulating broken business state) -->
          <input type="text" id="bad-input" value="original" />
          
          <button id="submit-button">Submit Application</button>

          <!-- Success elements hidden by default -->
          <div id="status-box">Ready to Apply</div>
        </div>
      </body>
      </html>
    `;
    await page.setContent(html);

    // Mock before-state observation
    const beforeObservation = {
      url: page.url(),
      modalOpen: false,
    };

    // ----------------------------------------------------
    // Scenario 1: FILL action succeeds, but business value does not match (Negative Test)
    // ----------------------------------------------------
    console.log(
      "Test 1: Rejects FILL action when live input value does not match target value...",
    );
    const fillAction = {
      actionId: "act_fill_neg",
      type: BROWSER_ACTIONS.FILL,
      intent: "fill_bad",
      target: { selector: "#bad-input" },
      value: "expected_typed_value",
      expectedOutcome: "field_value_matches",
    };

    const execResultSuccess = { ok: true, error: null }; // Low-level playwright fill executed fine

    // In this test, the bad-input field still has 'original', not 'expected_typed_value'.
    const res1 = await verifyStateTransition(
      page,
      fillAction,
      beforeObservation,
      beforeObservation,
      execResultSuccess,
    );
    assert.strictEqual(res1.verified, false, "Should fail verification");
    assert.strictEqual(res1.actualOutcome, "field_value_mismatch");
    assert.ok(res1.reason.includes("Value verification failed"));
    console.log("✅ Test 1 Passed.");

    // ----------------------------------------------------
    // Scenario 2: CLICK submit, but confirmation text is missing (Negative Test)
    // ----------------------------------------------------
    console.log(
      "Test 2: Rejects CLICK submit when expected confirmation banner is missing from the body...",
    );
    const clickSubmitAction = {
      actionId: "act_click_submit",
      type: BROWSER_ACTIONS.CLICK,
      intent: "submit_form",
      target: { selector: "#submit-button" },
      expectedOutcome: "submission_confirmation",
    };

    const res2 = await verifyStateTransition(
      page,
      clickSubmitAction,
      beforeObservation,
      beforeObservation,
      execResultSuccess,
    );
    assert.strictEqual(res2.verified, false, "Should fail verification");
    assert.strictEqual(
      res2.actualOutcome,
      "submission_missing_success_indicator",
    );
    assert.ok(res2.reason.includes("no success message/receipt was found"));
    console.log("✅ Test 2 Passed.");

    // ----------------------------------------------------
    // Scenario 3: Successful Navigation Verification (Positive Test)
    // ----------------------------------------------------
    console.log("Test 3: Verifies successful navigation target...");
    const navAction = {
      actionId: "act_nav",
      type: BROWSER_ACTIONS.NAVIGATE,
      target: { url: "about:blank" },
      value: "about:blank",
      expectedOutcome: "navigation_success",
    };

    // Go to target url
    await page.goto("about:blank");

    const res3 = await verifyStateTransition(
      page,
      navAction,
      beforeObservation,
      beforeObservation,
      execResultSuccess,
    );
    assert.strictEqual(res3.verified, true);
    assert.strictEqual(res3.actualOutcome, "navigation_success");
    assert.ok(res3.reason.includes("Host domains match successfully"));
    console.log("✅ Test 3 Passed.");

    // ----------------------------------------------------
    // Scenario 4: Weak startsWith("http") Prevention (Negative/Correction Test)
    // ----------------------------------------------------
    console.log('Test 4: Rejects weak "http" / generic verification checks...');
    const weakNavAction = {
      actionId: "act_weak_nav",
      type: BROWSER_ACTIONS.NAVIGATE,
      target: { url: "http" },
      value: "http",
      expectedOutcome: "navigation_success",
    };

    const res4 = await verifyStateTransition(
      page,
      weakNavAction,
      beforeObservation,
      beforeObservation,
      execResultSuccess,
    );
    assert.strictEqual(res4.verified, false);
    assert.ok(res4.reason.includes("Weak verification rejected"));
    console.log("✅ Test 4 Passed.");

    console.log("🎉 ALL STATE VERIFIER TESTS PASSED SUCCESSFULLY.");
  } catch (error) {
    console.error("❌ State Verifier Tests Failed:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runVerifierTests();
