import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { checkPlaywrightAvailable } from "./helpers/playwrightAvailable.js";
import { createTestServer } from "./fixtures/testServer.js";
import { observeBrowser } from "../browser/observer/browserObserver.js";
import {
  executeRegisteredAction,
  validateRegisteredAction,
} from "../browser/actions/actionRegistry.js";

const playwrightAvailable = await checkPlaywrightAvailable();

test(
  "registered browser actions validate and execute against observed element IDs",
  { skip: !playwrightAvailable },
  async () => {
    const fixtureServer = await createTestServer();
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
      await page.goto(`${fixtureServer.baseUrl}/simple-form`);
      const observation = await observeBrowser(page);
      const email = observation.interactiveElements.find(
        (element) => element.id === "email",
      );
      const submit = observation.interactiveElements.find(
        (element) => element.normalizedText === "Submit Application",
      );
      assert.ok(email?.elementId);
      assert.ok(submit?.elementId);

      const fillAction = {
        actionId: "fill-email",
        type: "fill",
        intent: "fill_email",
        target: { elementId: email.elementId },
        value: "candidate@example.com",
        expectedOutcome: "email_filled",
      };
      assert.equal(
        validateRegisteredAction(fillAction, observation).valid,
        true,
      );
      const fillResult = await executeRegisteredAction(
        page,
        fillAction,
        observation,
      );
      assert.equal(fillResult.ok, true);
      assert.equal(
        await page.locator("#email").inputValue(),
        "candidate@example.com",
      );

      const stale = validateRegisteredAction(
        { ...fillAction, observationRevision: "stale-revision" },
        observation,
      );
      assert.equal(stale.valid, false);

      const clickResult = await executeRegisteredAction(
        page,
        {
          actionId: "click-submit",
          type: "click",
          intent: "submit_application",
          target: { elementId: submit.elementId },
          expectedOutcome: "submission_started",
          riskLevel: "HIGH",
          requiresHumanConfirmation: true,
        },
        observation,
        { humanConfirmed: true, applicationState: { readyToSubmit: true } },
      );
      assert.equal(clickResult.ok, true);
    } finally {
      await browser.close();
      await new Promise((resolve) => fixtureServer.server.close(resolve));
    }
  },
);
