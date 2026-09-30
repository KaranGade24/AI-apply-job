import { BROWSER_ACTIONS } from "../../constant/application.constant.js";
import { resolveElementLocator } from "../observer/elementResolver.js";
import { logJobEvent, logError } from "../../utils/logger.js";

/**
 * Deterministically executes a browser action.
 * The LLM only proposes actions; the executor executes them and collects evidence.
 *
 * @param {import('playwright').Page} page
 * @param {object} action
 * @param {object} [options]
 * @returns {Promise<object>} Action result contract
 */
export const executeBrowserAction = async (page, action, options = {}) => {
  const startedAt = new Date();
  const actionId = action.actionId || `act_${Date.now()}`;
  const type = action.type;
  const target = action.target || {};
  const value = action.value;

  try {
    await logJobEvent(
      "browserExecutor",
      "ACTION_START",
      `Executing ${type} on target: ${JSON.stringify(target.elementId || target.role || target.text || target.selector || "none")}`
    );

    let executionEvidence = {};
    let browserStateChanged = false;

    switch (type) {
      case BROWSER_ACTIONS.NAVIGATE: {
        const destUrl = target.url || target.href || (typeof target === "string" ? target : value);
        if (!destUrl) throw new Error("NAVIGATE missing destination URL");
        await page.goto(destUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1000);
        executionEvidence = { navigatedTo: page.url() };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.CLICK: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.click({ timeout: 5000 }).catch(async () => {
          // Force click fallback if obstructed by subtle overlay
          await locator.click({ force: true, timeout: 3000 });
        });
        await page.waitForTimeout(600); // Allow brief UI animation/transition
        executionEvidence = { resolvedVia, clicked: true };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.FILL: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        const strVal = String(value ?? "");
        await locator.fill(strVal);
        const actualVal = await locator.inputValue().catch(() => null);
        executionEvidence = { resolvedVia, filledValue: strVal, actualValueAfterFill: actualVal };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.TYPE: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.focus().catch(() => {});
        const strVal = String(value ?? "");
        await locator.pressSequentially(strVal, { delay: 35 });
        const actualVal = await locator.inputValue().catch(() => null);
        executionEvidence = { resolvedVia, typedValue: strVal, actualValueAfterType: actualVal };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.SELECT: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        const strVal = String(value ?? "");
        // Attempt label, then value, then index
        await locator.selectOption({ label: strVal }).catch(async () => {
          await locator.selectOption({ value: strVal }).catch(async () => {
            await locator.selectOption(strVal);
          });
        });
        const selectedVal = await locator.inputValue().catch(() => null);
        executionEvidence = { resolvedVia, selectedOption: strVal, actualValue: selectedVal };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.CHECK: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.check({ timeout: 4000 }).catch(async () => {
          await locator.click({ force: true });
        });
        const isChecked = await locator.isChecked().catch(() => true);
        executionEvidence = { resolvedVia, checked: isChecked };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.UNCHECK: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.scrollIntoViewIfNeeded().catch(() => {});
        await locator.uncheck({ timeout: 4000 }).catch(async () => {
          await locator.click({ force: true });
        });
        const isChecked = await locator.isChecked().catch(() => false);
        executionEvidence = { resolvedVia, checked: isChecked };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.UPLOAD: {
        const filePath = action.filePath || value || options.resumePdfPath;
        if (!filePath) throw new Error("UPLOAD action missing file path");

        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.setInputFiles(filePath);
        await page.waitForTimeout(1000); // Allow upload processing
        executionEvidence = { resolvedVia, uploadedPath: filePath };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.SCROLL: {
        const deltaY = action.deltaY || (action.direction === "up" ? -500 : 500);
        await page.mouse.wheel(0, deltaY);
        await page.waitForTimeout(400);
        executionEvidence = { scrolled: true, deltaY };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.PRESS_KEY: {
        const key = action.key || value || "Enter";
        await page.keyboard.press(key);
        await page.waitForTimeout(500);
        executionEvidence = { key };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.HOVER: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.hover();
        await page.waitForTimeout(400);
        executionEvidence = { resolvedVia, hovered: true };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.FOCUS: {
        const { locator, resolvedVia } = await resolveElementLocator(page, target, options);
        await locator.focus();
        executionEvidence = { resolvedVia, focused: true };
        break;
      }

      case BROWSER_ACTIONS.WAIT: {
        const waitMs = Math.min(action.durationMs || 1500, 10000);
        await page.waitForTimeout(waitMs);
        executionEvidence = { waitedMs: waitMs };
        break;
      }

      case BROWSER_ACTIONS.GO_BACK: {
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        executionEvidence = { newUrl: page.url() };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.GO_FORWARD: {
        await page.goForward({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        executionEvidence = { newUrl: page.url() };
        browserStateChanged = true;
        break;
      }

      case BROWSER_ACTIONS.CLOSE_MODAL: {
        const closeBtn = page.locator('button[aria-label*="close" i], button.close, [class*="modal-close"]').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
          await page.waitForTimeout(500);
          executionEvidence = { modalClosedViaButton: true };
        } else {
          await page.keyboard.press("Escape");
          await page.waitForTimeout(500);
          executionEvidence = { modalClosedViaEscape: true };
        }
        browserStateChanged = true;
        break;
      }

      default:
        throw new Error(`Execution not implemented for action type: ${type}`);
    }

    const completedAt = new Date();

    return {
      ok: true,
      actionId,
      actionType: type,
      target,
      startedAt,
      completedAt,
      executionEvidence,
      browserStateChanged,
      error: null,
    };
  } catch (error) {
    await logError("browserExecutor.executeBrowserAction", error.message);
    const completedAt = new Date();
    return {
      ok: false,
      actionId,
      actionType: type,
      target,
      startedAt,
      completedAt,
      executionEvidence: null,
      browserStateChanged: false,
      error: error.message,
    };
  }
};
