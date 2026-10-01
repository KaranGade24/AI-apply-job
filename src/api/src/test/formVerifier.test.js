import { chromium } from "playwright";
import { verifyFilledFields } from "../application/form/formVerifier.js";
import { checkPlaywrightAvailable } from "./helpers/playwrightAvailable.js";
import assert from "assert";

async function runFormVerifierTests() {
  console.log("--- STARTING HIGH-RELIABILITY FORM VERIFIER TESTS ---");
  if (!(await checkPlaywrightAvailable())) {
    console.log("SKIP: Chromium is unavailable.");
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Setup form sandbox in playwright
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Form Sandbox</title></head>
      <body>
        <form>
          <input type="text" id="req-first-name" name="first_name" value="Jane" />
          <input type="text" id="req-last-name" name="last_name" value="" /> <!-- Left blank (required field failure) -->
          <input type="text" id="opt-middle-name" name="middle_name" value="" /> <!-- Left blank (optional field) -->
        </form>
      </body>
      </html>
    `;
    await page.setContent(html);

    // Form fields setup matching our DOM
    const formFields = [
      {
        fieldId: "#req-first-name",
        questionId: "q_first_name",
        label: "First Name",
        required: true,
        type: "text",
      },
      {
        fieldId: "#req-last-name",
        questionId: "q_last_name",
        label: "Last Name",
        required: true,
        type: "text",
      },
      {
        fieldId: "#opt-middle-name",
        questionId: "q_middle_name",
        label: "Middle Name",
        required: false,
        type: "text",
      },
    ];

    // Answers resolved
    const resolvedAnswers = [
      {
        fieldId: "#req-first-name",
        questionId: "q_first_name",
        question: "First Name",
        answer: "Jane",
        source: "user_profile",
      },
      {
        fieldId: "#req-last-name",
        questionId: "q_last_name",
        question: "Last Name",
        answer: "Smith", // We expected 'Smith' but DOM has empty string!
        source: "user_profile",
      },
      {
        fieldId: "#opt-middle-name",
        questionId: "q_middle_name",
        question: "Middle Name",
        answer: "Marie", // We expected 'Marie' but DOM has empty string (optional)
        source: "user_profile",
      },
    ];

    // 1. Run Verification
    console.log("Test 1: Verifies field states and maps detailed outputs...");
    const result = await verifyFilledFields(page, resolvedAnswers, formFields);

    assert.strictEqual(result.allFilled, false);
    assert.strictEqual(result.filledCount, 1); // Only Jane was verified
    assert.strictEqual(result.emptyFields.length, 2); // Smith and Marie are empty/mismatched

    // Find the fields in detail
    const firstNameDetail = result.fields.find(
      (f) => f.fieldId === "#req-first-name",
    );
    const lastNameDetail = result.fields.find(
      (f) => f.fieldId === "#req-last-name",
    );
    const middleNameDetail = result.fields.find(
      (f) => f.fieldId === "#opt-middle-name",
    );

    // Test 2: Field Details and Metadata Maintenance
    console.log(
      "Test 2: Asserts metadata, intended answers, and actual values are cleanly logged...",
    );
    assert.strictEqual(firstNameDetail.intendedAnswer, "Jane");
    assert.strictEqual(firstNameDetail.actualValue, "Jane");
    assert.strictEqual(firstNameDetail.verificationStatus, true);

    assert.strictEqual(lastNameDetail.intendedAnswer, "Smith");
    assert.strictEqual(lastNameDetail.actualValue, "");
    assert.strictEqual(lastNameDetail.verificationStatus, false);
    assert.strictEqual(lastNameDetail.required, true);

    assert.strictEqual(middleNameDetail.intendedAnswer, "Marie");
    assert.strictEqual(middleNameDetail.actualValue, "");
    assert.strictEqual(middleNameDetail.verificationStatus, false);
    assert.strictEqual(middleNameDetail.required, false);

    // Test 3: Required status classification matches target rules
    console.log(
      "Test 3: Identifies which failed fields are required vs optional...",
    );
    const failedRequired = result.emptyFields.filter((f) => f.required);
    const failedOptional = result.emptyFields.filter((f) => !f.required);

    assert.strictEqual(failedRequired.length, 1);
    assert.strictEqual(failedRequired[0].fieldId, "#req-last-name");

    assert.strictEqual(failedOptional.length, 1);
    assert.strictEqual(failedOptional[0].fieldId, "#opt-middle-name");

    console.log("🎉 ALL FORM VERIFIER DETAILED STATE TESTS PASSED.");
  } catch (err) {
    console.error("❌ Form Verifier Tests Failed:", err);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runFormVerifierTests();
