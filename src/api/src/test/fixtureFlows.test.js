import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright";
import { checkPlaywrightAvailable } from "./helpers/playwrightAvailable.js";
import { createTestServer } from "./fixtures/testServer.js";
import { observeBrowser } from "../browser/observer/browserObserver.js";

const playwrightAvailable = await checkPlaywrightAvailable();

test(
  "local browser fixtures cover the generic application flow surface",
  {
    skip: !playwrightAvailable,
  },
  async () => {
    const fixtureServer = await createTestServer();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await page.goto(`${fixtureServer.baseUrl}/multi-step-form`);
      assert.equal(await page.locator('input[name="fname"]').count(), 1);
      const initialObservation = await observeBrowser(page);
      assert.ok(
        initialObservation.interactiveElements.some(
          (element) => element.elementId,
        ),
      );
      assert.match(initialObservation.visibleTextTrimmed, /First Name/i);
      assert.equal(initialObservation.iframeCount, 0);
      const nextStep = page.waitForURL(/\/multi-step-form\?fname=/);
      await page.locator('button[type="submit"]').click();
      await nextStep;
      assert.equal(await page.locator('input[type="file"]').count(), 1);

      await page.goto(`${fixtureServer.baseUrl}/modal`);
      await page.locator("#open-modal").click();
      assert.equal(await page.locator('[role="dialog"]').isVisible(), true);
      await page.locator("#close-modal").click();
      assert.equal(await page.locator('[role="dialog"]').isVisible(), false);

      await page.goto(`${fixtureServer.baseUrl}/iframe`);
      assert.equal(await page.frames().length, 2);
      assert.equal(
        await page
          .frameLocator('iframe[name="application-frame"]')
          .locator("#frame-email")
          .count(),
        1,
      );

      await page.goto(`${fixtureServer.baseUrl}/new-tab`);
      const newTabPromise = context.waitForEvent("page");
      await page.locator("#open-new-tab").click();
      const newTab = await newTabPromise;
      await newTab.waitForLoadState("domcontentloaded");
      assert.match(newTab.url(), /new-tab-target$/);
      await newTab.close();

      await page.goto(`${fixtureServer.baseUrl}/redirect`);
      assert.match(page.url(), /redirect-target$/);

      await page.goto(`${fixtureServer.baseUrl}/captcha`);
      assert.match(await page.locator("body").innerText(), /captcha/i);

      await page.goto(`${fixtureServer.baseUrl}/validation-error`);
      await page.locator("#validation-submit").click();
      assert.equal(await page.locator('[role="alert"]').isVisible(), true);

      await page.goto(`${fixtureServer.baseUrl}/consent`);
      assert.equal(await page.locator("#consent").isChecked(), false);

      await page.goto(`${fixtureServer.baseUrl}/upload`);
      await page.locator("#resume-upload").setInputFiles({
        name: "resume.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4 fixture"),
      });
      assert.match(
        await page.locator("#resume-upload").inputValue(),
        /fakepath/i,
      );
    } finally {
      await browser.close();
      await new Promise((resolve) => fixtureServer.server.close(resolve));
    }
  },
);
