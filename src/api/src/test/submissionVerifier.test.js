import { chromium } from "playwright";
import {
  verifySubmission,
  VERIFICATION_STATUS,
} from "../browser/verifier/submissionVerifier.js";
import { checkPlaywrightAvailable } from "./helpers/playwrightAvailable.js";
import assert from "assert";

async function runSubmissionVerifierTests() {
  console.log("--- STARTING SUBMISSION VERIFIER TESTS ---");
  if (!(await checkPlaywrightAvailable())) {
    console.log("SKIP: Chromium is unavailable.");
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Mock page with Level 4 receipt code
    const htmlSuccess = `
      <!DOCTYPE html>
      <html>
      <head><title>Thank you!</title></head>
      <body>
        <h1>Application Received</h1>
        <p>Thank you for applying. Your Reference ID is: <b>REF-887722</b></p>
      </body>
      </html>
    `;
    await page.setContent(htmlSuccess);

    // Test 1: Full success detection at Level 4 (Positive Test)
    console.log(
      "Test 1: Confirms APPLICATION_COMPLETED with strong Level 4 evidence...",
    );
    const preState = { url: "https://company.com/jobs/apply" };
    const res1 = await verifySubmission(page, preState);
    assert.strictEqual(res1.status, VERIFICATION_STATUS.APPLICATION_COMPLETED);
    assert.strictEqual(res1.level, 4);
    assert.strictEqual(res1.confidence, 1.0);
    console.log("✅ Test 1 Passed.");

    // Mock page with ambiguous state (only URL changed to success but body says nothing)
    const htmlAmbiguous = `
      <!DOCTYPE html>
      <html>
      <head><title>Stuck Page</title></head>
      <body>
        <p>Please click submit button to continue.</p>
      </body>
      </html>
    `;
    await page.goto("https://example.com");
    await page.setContent(htmlAmbiguous);

    // Test 2: Ambiguous/Weak state rejection (Negative Test)
    console.log(
      "Test 2: Rejects URL-only changes and routes to APPLICATION_REQUIRES_HUMAN...",
    );
    // We navigate to a URL that has confirmation in it, but body text is blank/unconfirming
    await page.evaluate(() => {
      window.history.pushState({}, "", "/jobs/confirmation");
    });

    const res2 = await verifySubmission(page, preState);
    assert.strictEqual(
      res2.status,
      VERIFICATION_STATUS.APPLICATION_REQUIRES_HUMAN,
    );
    assert.strictEqual(res2.level, 1); // URL matches, but body is empty/unconfirming
    console.log("✅ Test 2 Passed.");

    // Mock page with visible validation errors
    const htmlErrors = `
      <!DOCTYPE html>
      <html>
      <head><title>Jobs</title></head>
      <body>
        <h1>Application Portal</h1>
        <div class="error">The email address field is required.</div>
        <p>Your application has been received successfully!</p> <!-- contains success text, but also validation error on top -->
      </body>
      </html>
    `;
    await page.setContent(htmlErrors);

    // Test 3: Validation Error Overrides Success (Negative Test)
    console.log(
      "Test 3: Correctly flags APPLICATION_REQUIRES_HUMAN if validation errors are detected alongside success text...",
    );
    const res3 = await verifySubmission(page, preState);
    assert.strictEqual(
      res3.status,
      VERIFICATION_STATUS.APPLICATION_REQUIRES_HUMAN,
    );
    assert.ok(res3.details.includes("validation errors"));
    console.log("✅ Test 3 Passed.");

    console.log("🎉 ALL SUBMISSION VERIFIER TESTS PASSED SUCCESSFULLY.");
  } catch (error) {
    console.error("❌ Submission Verifier Tests Failed:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runSubmissionVerifierTests();
