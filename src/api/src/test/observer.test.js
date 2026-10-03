import { chromium } from "../services/browser/useBrowserJs.js";
import { observeDOM } from "../browser/observer/domObserver.js";
import { resolveElement } from "../browser/observer/elementResolver.js";
import { checkPlaywrightAvailable } from "./helpers/playwrightAvailable.js";
import assert from "assert";

async function runTests() {
  console.log("--- STARTING AMBIGUITY-SAFE ELEMENT RESOLUTION TESTS ---");
  if (!(await checkPlaywrightAvailable())) {
    console.log("SKIP: Chromium is unavailable.");
    return;
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // ----------------------------------------------------
    // Scenario 1: Setup elements with unique and duplicate characteristics
    // ----------------------------------------------------
    const html = `
      <!DOCTYPE html>
      <html>
      <head><title>Ambiguity Sandbox</title></head>
      <body>
        <!-- Section A -->
        <div id="section-a">
          <h3>Section A</h3>
          <button class="action-btn" name="submit-action">Continue</button>
          <label for="input-dup">Email Address</label>
          <input type="text" id="input-dup" name="email_field" placeholder="Enter email" />
        </div>

        <!-- Section B (Duplicated button label, hidden/visible input elements) -->
        <div id="section-b">
          <h3>Section B</h3>
          <button class="action-btn" name="submit-action">Continue</button>
          
          <!-- Duplicate input text labels but one is hidden -->
          <label for="input-dup-hidden">Email Address</label>
          <input type="text" id="input-dup-hidden" name="email_field" placeholder="Enter email" style="display: none;" />

          <label for="input-dup-visible">Email Address</label>
          <input type="text" id="input-dup-visible" name="email_field" placeholder="Enter email" />
        </div>

        <!-- Stable Frame Simulation -->
        <iframe id="iframe-correct" srcdoc="
          <html>
            <body>
              <button id='action-btn-frame'>Action in Frame</button>
            </body>
          </html>
        "></iframe>
      </body>
      </html>
    `;

    await page.setContent(html);

    // Test 1: One strong candidate (Successful Resolution)
    console.log(
      "Running Test 1: Exactly one strong candidate resolves successfully...",
    );
    const allObs = await observeDOM(page);
    const correctFrameBtnObs = allObs.find(
      (el) => el.id === "action-btn-frame",
    );
    assert.ok(
      correctFrameBtnObs,
      "Should locate frame button during initial observation",
    );

    const resolvedFrameBtn = await resolveElement(page, correctFrameBtnObs);
    assert.strictEqual(
      resolvedFrameBtn.resolved,
      true,
      "Frame button should resolve with true status",
    );
    assert.strictEqual(
      resolvedFrameBtn.reason,
      "SUCCESS",
      "Should return SUCCESS reason",
    );
    console.log("✅ Test 1 Passed.");

    // Test 2: Two identical buttons (Ambiguity Detection)
    console.log(
      "Running Test 2: Multi-candidate identical elements fail with TARGET_AMBIGUOUS...",
    );
    // We observe the "Continue" button in Section A. It has identical siblings in Section B.
    const continueBtnObs = allObs.find(
      (el) => el.normalizedText === "Continue",
    );
    assert.ok(continueBtnObs, "Should locate Continue button");

    // Attempt to resolve it. Since the two buttons share identical traits, they are ambiguous.
    const resolveAmbBtn = await resolveElement(page, continueBtnObs);
    assert.strictEqual(
      resolveAmbBtn.resolved,
      false,
      "Should flag duplicate elements as unresolved",
    );
    assert.strictEqual(
      resolveAmbBtn.reason,
      "TARGET_AMBIGUOUS",
      "Reason should be TARGET_AMBIGUOUS",
    );
    assert.ok(
      resolveAmbBtn.candidates.length >= 2,
      "Should capture all matching candidates",
    );
    console.log("✅ Test 2 Passed.");

    // Test 3: Hidden Candidate vs Visible Candidate (Prefers Visible)
    console.log(
      "Running Test 3: Prefers visible element over hidden element with identical attributes...",
    );
    const dupInputObs = allObs.find((el) => el.id === "input-dup-visible");
    assert.ok(dupInputObs, "Should locate the visible duplicate input element");

    const resolvedInput = await resolveElement(page, dupInputObs);
    assert.strictEqual(
      resolvedInput.resolved,
      true,
      "Should resolve candidate because the other is hidden (display: none)",
    );
    assert.strictEqual(
      resolvedInput.reason,
      "SUCCESS",
      "Should return SUCCESS since visible score safely overrides hidden element score",
    );
    console.log("✅ Test 3 Passed.");

    // Test 4: Removed/Stale Element (TARGET_NOT_FOUND)
    console.log(
      "Running Test 4: Removed unique element resolves to TARGET_NOT_FOUND...",
    );
    // We remove the unique frame button so no matching descriptors remain
    const frame = page
      .frames()
      .find(
        (f) =>
          f.name() === "iframe-correct" || f.url().includes("iframe-correct"),
      );
    await frame.evaluate(() => {
      const btn = document.getElementById("action-btn-frame");
      if (btn) btn.remove();
    });

    const resolvedRemoved = await resolveElement(page, correctFrameBtnObs);
    assert.strictEqual(
      resolvedRemoved.resolved,
      false,
      "Resolution should fail on missing elements",
    );
    assert.strictEqual(
      resolvedRemoved.reason,
      "TARGET_NOT_FOUND",
      "Should return TARGET_NOT_FOUND error code",
    );
    console.log("✅ Test 4 Passed.");

    // Test 5: Wrong Iframe Separation
    console.log(
      "Running Test 5: Frame isolation prevents leaking element resolution to wrong context...",
    );
    // Alter frameId to map to an invalid/non-existent frame
    const corruptedFrameBtn = {
      ...correctFrameBtnObs,
      frameId: "iframe-invalid-wrong",
    };

    const resolveCorrupted = await resolveElement(page, corruptedFrameBtn);
    assert.strictEqual(
      resolveCorrupted.resolved,
      false,
      "Should fail to resolve elements in wrong/missing iframe context",
    );
    console.log("✅ Test 5 Passed.");

    console.log("🎉 ALL AMBIGUITY-SAFE RESOLUTION TESTS PASSED.");
  } catch (error) {
    console.error("❌ Tests Failed:", error);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

runTests();
