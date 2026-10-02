import { logJobEvent, logError } from "../../utils/logger.js";
import { DEEP_DIVE_ACTIONS } from "../../constant/agent.constant.js";

/**
 * Action Executor: Centralized, robust Playwright action runner.
 * Resolves targets, checks interactability, executes actions, waits for settle, and returns structured result.
 */
export const executeDeepDiveAction = async (page, action, context = {}) => {
  const startTime = Date.now();
  const preUrl = page.url ? page.url() : "";

  if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
    return {
      success: false,
      action,
      error: "Page is closed or unavailable",
      durationMs: Date.now() - startTime,
      preUrl,
      postUrl: preUrl,
    };
  }

  const { type, target, value, reason } = action;

  await logJobEvent(
    "actionExecutor",
    "EXECUTE_START",
    `Executing [${type}] on target: "${target || "page"}" (${reason || "No reason specified"})`
  );

  try {
    switch (type) {
      case DEEP_DIVE_ACTIONS.NAVIGATE: {
        const urlToNav = value || target;
        await page.goto(urlToNav, { waitUntil: "domcontentloaded", timeout: 30000 });
        await waitForPageSettle(page, 2000);
        break;
      }

      case DEEP_DIVE_ACTIONS.CLICK:
      case DEEP_DIVE_ACTIONS.SUBMIT: {
        const locator = await resolveElementLocator(page, target);
        if (!locator) throw new Error(`Target element not found for selector: "${target}"`);

        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(300);

        // Click with fallback for covered elements or custom triggers
        try {
          await locator.click({ timeout: 10000 });
        } catch (clickErr) {
          // Fallback force click if obscured by sticky header or overlay
          await locator.click({ force: true, timeout: 5000 });
        }

        await waitForPageSettle(page, 2500);
        break;
      }

      case DEEP_DIVE_ACTIONS.TYPE: {
        const locator = await resolveElementLocator(page, target);
        if (!locator) throw new Error(`Target input not found for selector: "${target}"`);

        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ timeout: 5000 }).catch(() => {});
        await locator.fill(String(value ?? ""), { timeout: 8000 });
        await page.waitForTimeout(300);
        break;
      }

      case DEEP_DIVE_ACTIONS.SELECT: {
        const locator = await resolveElementLocator(page, target);
        if (!locator) throw new Error(`Target select not found for selector: "${target}"`);

        await locator.scrollIntoViewIfNeeded().catch(() => {});
        try {
          await locator.selectOption({ label: String(value) }, { timeout: 8000 });
        } catch {
          try {
            await locator.selectOption({ value: String(value) }, { timeout: 5000 });
          } catch {
            await locator.selectOption({ index: 1 }, { timeout: 5000 });
          }
        }
        await page.waitForTimeout(300);
        break;
      }

      case DEEP_DIVE_ACTIONS.CHECK: {
        const locator = await resolveElementLocator(page, target);
        if (!locator) throw new Error(`Target checkbox not found for selector: "${target}"`);

        await locator.scrollIntoViewIfNeeded().catch(() => {});
        try {
          await locator.check({ timeout: 5000 });
        } catch {
          await locator.click({ force: true, timeout: 5000 });
        }
        await page.waitForTimeout(300);
        break;
      }

      case DEEP_DIVE_ACTIONS.UNCHECK: {
        const locator = await resolveElementLocator(page, target);
        if (!locator) throw new Error(`Target checkbox not found for selector: "${target}"`);

        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.uncheck({ timeout: 5000 }).catch(() => locator.click({ force: true }));
        await page.waitForTimeout(300);
        break;
      }

      case DEEP_DIVE_ACTIONS.UPLOAD: {
        const locator = await resolveElementLocator(page, target || 'input[type="file"]');
        if (!locator) throw new Error(`Target file input not found for selector: "${target}"`);

        const filePath = value || context.resumePdfPath;
        if (!filePath) throw new Error("No resume file path provided for upload action");

        await locator.setInputFiles(filePath, { timeout: 15000 });
        await page.waitForTimeout(1500);
        break;
      }

      case DEEP_DIVE_ACTIONS.SCROLL: {
        const direction = value === "up" ? -400 : 400;
        await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), direction);
        await page.waitForTimeout(800);
        break;
      }

      case DEEP_DIVE_ACTIONS.WAIT: {
        const ms = parseInt(value, 10) || 2000;
        await page.waitForTimeout(Math.min(ms, 10000));
        break;
      }

      case DEEP_DIVE_ACTIONS.PRESS: {
        const key = value || "Enter";
        if (target) {
          const locator = await resolveElementLocator(page, target);
          if (locator) await locator.press(key);
          else await page.keyboard.press(key);
        } else {
          await page.keyboard.press(key);
        }
        await waitForPageSettle(page, 1500);
        break;
      }

      case DEEP_DIVE_ACTIONS.GOBACK: {
        await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
        await waitForPageSettle(page, 2000);
        break;
      }

      case DEEP_DIVE_ACTIONS.FINISH:
      case DEEP_DIVE_ACTIONS.HUMAN_INTERVENTION: {
        // State actions require no direct DOM manipulation
        break;
      }

      default:
        throw new Error(`Unsupported action type: "${type}"`);
    }

    const postUrl = page.url ? page.url() : preUrl;
    const durationMs = Date.now() - startTime;

    await logJobEvent(
      "actionExecutor",
      "EXECUTE_SUCCESS",
      `Action [${type}] completed successfully in ${durationMs}ms (URL: ${postUrl})`
    );

    return {
      success: true,
      action,
      durationMs,
      error: null,
      preUrl,
      postUrl,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    await logError("actionExecutor.executeDeepDiveAction", `Failed: ${error.message}`);

    return {
      success: false,
      action,
      durationMs,
      error: error.message,
      preUrl,
      postUrl: page.url ? page.url() : preUrl,
    };
  }
};

/**
 * Resolves a locator on the page with multi-strategy fallback
 */
export const resolveElementLocator = async (page, target) => {
  if (!target) return null;

  // 1. Direct CSS / ID / Attribute Selector
  try {
    const direct = page.locator(target).first();
    const count = await direct.count().catch(() => 0);
    if (count > 0) return direct;
  } catch {}

  // 2. Button text fallback
  try {
    const textBtn = page.locator(`button:has-text("${target}"), a:has-text("${target}"), [role="button"]:has-text("${target}")`).first();
    if (await textBtn.count().catch(() => 0) > 0) return textBtn;
  } catch {}

  // 3. Name or placeholder fallback
  try {
    const nameInput = page.locator(`[name="${target}"], [placeholder="${target}"], [aria-label="${target}"]`).first();
    if (await nameInput.count().catch(() => 0) > 0) return nameInput;
  } catch {}

  // 4. Data-automation-id fallback
  try {
    const autoEl = page.locator(`[data-automation-id="${target}"]`).first();
    if (await autoEl.count().catch(() => 0) > 0) return autoEl;
  } catch {}

  return null;
};

/**
 * Waits for DOM and network requests to settle after an interaction
 */
const waitForPageSettle = async (page, minWaitMs = 1500) => {
  try {
    await Promise.race([
      page.waitForLoadState("domcontentloaded", { timeout: 5000 }),
      new Promise((r) => setTimeout(r, 5000)),
    ]).catch(() => {});
  } catch {}
  await page.waitForTimeout(minWaitMs);
};

export default {
  executeDeepDiveAction,
  resolveElementLocator,
};
