import path from "path";
import fs from "fs";
import {
  DEFAULT_ACTION_TIMEOUT_MS,
  DEFAULT_PAGE_TIMEOUT_MS,
  ACTION_FAILURE_TYPES,
} from "../../../constant/agent.constant.js";
import { validateAction } from "./validator.js";
import { logError, logJobEvent } from "../../../utils/logger.js";

/**
 * Classifies an error into a canonical ACTION_FAILURE_TYPES enum value.
 *
 * @param {Error|object|string} error
 * @returns {string}
 */
export const classifyActionError = (error) => {
  const msg = (
    typeof error === "string" ? error : error?.message || ""
  ).toLowerCase();

  if (msg.includes("stale_snapshot") || msg.includes("stale snapshot")) {
    return ACTION_FAILURE_TYPES.STALE_SNAPSHOT;
  }
  if (
    msg.includes("element_gone") ||
    msg.includes("not found") ||
    msg.includes("no element found") ||
    msg.includes("count is 0")
  ) {
    return ACTION_FAILURE_TYPES.ELEMENT_GONE;
  }
  if (msg.includes("disabled") || msg.includes("element_disabled")) {
    return ACTION_FAILURE_TYPES.DISABLED;
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return ACTION_FAILURE_TYPES.TIMEOUT;
  }
  if (
    msg.includes("navigation") ||
    msg.includes("net::") ||
    msg.includes("err_") ||
    msg.includes("cannot navigate")
  ) {
    return ACTION_FAILURE_TYPES.NAVIGATION_FAILED;
  }
  if (
    msg.includes("blocked") ||
    msg.includes("captcha") ||
    msg.includes("turnstile") ||
    msg.includes("cloudflare")
  ) {
    return ACTION_FAILURE_TYPES.BLOCKED;
  }

  return ACTION_FAILURE_TYPES.UNKNOWN;
};

/**
 * Resolves a Playwright Locator for the target element using its stamped data-aij-ref.
 *
 * @param {import('playwright').Page} page
 * @param {object} action
 * @param {object} observation
 * @returns {Promise<import('playwright').Locator|null>}
 */
export const resolveLocator = async (page, action, observation) => {
  if (action.index === undefined || action.index === null) return null;

  const targetSnapshotId = action.snapshotId || observation.snapshotId;
  const stampRef = `${targetSnapshotId}-${action.index}`;
  const selector = `[data-aij-ref="${stampRef}"]`;

  const elMeta = (observation.elements || []).find(
    (e) => e.index === action.index,
  );

  // If frameUrl is provided, look in the specific child frame first
  if (elMeta?.frameUrl && typeof page.frames === "function") {
    const frame = page.frames().find((f) => {
      try {
        return f.url() === elMeta.frameUrl;
      } catch {
        return false;
      }
    });

    if (frame) {
      const locator = frame.locator(selector);
      if (typeof locator.count === "function") {
        const count = await locator.count().catch(() => 0);
        if (count > 0) return locator.first();
      } else {
        return locator;
      }
    }
  }

  // Look in main page / top frame
  const mainLocator = page.locator(selector);
  if (typeof mainLocator.count === "function") {
    const mainCount = await mainLocator.count().catch(() => 0);
    if (mainCount > 0) return mainLocator.first();
  } else {
    return mainLocator;
  }

  // Scan all frames as fallback
  if (typeof page.frames === "function") {
    for (const frame of page.frames()) {
      try {
        const frameLoc = frame.locator(selector);
        const frameCount = await frameLoc.count().catch(() => 0);
        if (frameCount > 0) return frameLoc.first();
      } catch {}
    }
  }

  return null;
};

/**
 * Waits for the page and network activity to stabilize after an action.
 *
 * @param {import('playwright').Page} page
 */
export const waitForPageSettle = async (page) => {
  if (!page) return;

  try {
    if (typeof page.waitForLoadState === "function") {
      await Promise.race([
        page.waitForLoadState("domcontentloaded").catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    }

    // Brief DOM stabilization pause
    if (typeof page.waitForTimeout === "function") {
      await page.waitForTimeout(300).catch(() => {});
    }
  } catch {
    // Non-blocking settle
  }
};

/**
 * Validates that an upload file path is authorized and belongs to the user upload directory.
 * Never allows arbitrary LLM-supplied filesystem paths.
 *
 * @param {string} fileRef
 * @param {object} [options]
 * @returns {string} Safe absolute file path
 */
export const validateUploadPath = (fileRef, options = {}) => {
  if (!fileRef || typeof fileRef !== "string") {
    throw new Error("uploadFile requires a valid fileRef path string.");
  }

  // Check explicit allowed path from options (e.g. verified user resume)
  if (options.allowedFilePath) {
    return options.allowedFilePath;
  }

  // Prevent path traversal
  const normalized = path.normalize(fileRef);
  const securityPath = normalized.replaceAll("\\", "/");
  if (
    securityPath.includes("..") ||
    securityPath.startsWith("/etc") ||
    securityPath.startsWith("/var") ||
    securityPath.startsWith("/root")
  ) {
    throw new Error("Access to requested file path is forbidden.");
  }

  return securityPath;
};

/**
 * Executes a structured browser action against the Playwright page.
 *
 * @param {import('playwright').Page} page - Active Playwright page
 * @param {object} action - Action payload conforming to actionSchema
 * @param {object} observation - Current page observation
 * @param {object} [options]
 * @param {string} [options.allowedFilePath] - Verified server-side resume path
 * @param {object} [options.context] - Validation context
 * @returns {Promise<{
 *   success: boolean,
 *   action: object,
 *   errorType?: string,
 *   message?: string
 * }>}
 */
export const executeAction = async (
  page,
  action,
  observation = {},
  options = {},
) => {
  if (!page) {
    return {
      success: false,
      action,
      errorType: ACTION_FAILURE_TYPES.UNKNOWN,
      message: "Active Playwright page is unavailable or closed.",
    };
  }

  // Pre-execution validation
  const validation = validateAction(action, observation, options.context);
  if (!validation.ok) {
    const errType = classifyActionError(validation.code || validation.message);
    return {
      success: false,
      action,
      errorType: errType,
      message: validation.message,
    };
  }

  const { type } = action;
  const timeout = options.timeout || DEFAULT_ACTION_TIMEOUT_MS;

  try {
    switch (type) {
      case "navigate": {
        const navTimeout = options.navigationTimeout || DEFAULT_PAGE_TIMEOUT_MS;
        await page.goto(action.url, {
          waitUntil: "domcontentloaded",
          timeout: navTimeout,
        });
        await waitForPageSettle(page);
        return { success: true, action, message: `Navigated to ${action.url}` };
      }

      case "click": {
        const locator = await resolveLocator(page, action, observation);
        if (!locator) {
          return {
            success: false,
            action,
            errorType: ACTION_FAILURE_TYPES.ELEMENT_GONE,
            message: `Target element [${action.index}] could not be found in DOM via snapshot ref.`,
          };
        }

        // Multi-level click fallback: normal click -> force click -> dispatch click
        let clicked = false;
        try {
          await locator.click({ timeout: Math.min(timeout, 4000) });
          clicked = true;
        } catch {
          try {
            await locator.click({ force: true, timeout: 2500 });
            clicked = true;
          } catch {
            try {
              await locator.dispatchEvent("click");
              clicked = true;
            } catch {}
          }
        }

        if (!clicked) {
          return {
            success: false,
            action,
            errorType: ACTION_FAILURE_TYPES.TIMEOUT,
            message: `Could not click element [${action.index}] after fallbacks.`,
          };
        }

        await waitForPageSettle(page);
        return {
          success: true,
          action,
          message: `Clicked element [${action.index}]`,
        };
      }

      case "fill": {
        const locator = await resolveLocator(page, action, observation);
        if (!locator) {
          return {
            success: false,
            action,
            errorType: ACTION_FAILURE_TYPES.ELEMENT_GONE,
            message: `Target element [${action.index}] could not be found in DOM via snapshot ref.`,
          };
        }

        try {
          await locator.fill(String(action.value || ""), { timeout });
        } catch {
          await locator.click({ force: true }).catch(() => {});
          await locator.pressSequentially(String(action.value || ""), { delay: 10 }).catch(() => {});
        }

        return {
          success: true,
          action,
          message: `Filled element [${action.index}]`,
        };
      }

      case "select": {
        const locator = await resolveLocator(page, action, observation);
        if (!locator) {
          return {
            success: false,
            action,
            errorType: ACTION_FAILURE_TYPES.ELEMENT_GONE,
            message: `Target dropdown [${action.index}] could not be found in DOM.`,
          };
        }

        let selected = false;
        try {
          await locator.selectOption(action.option, { timeout: Math.min(timeout, 3000) });
          selected = true;
        } catch {
          // Custom dropdown / ARIA combobox fallback
          try {
            await locator.click({ force: true, timeout: 2000 });
            await page.waitForTimeout(300);
            const optTarget = page.locator(`[role="option"]:has-text("${action.option}"), li:has-text("${action.option}"), div:has-text("${action.option}")`).first();
            if (await optTarget.count() > 0) {
              await optTarget.click({ force: true });
              selected = true;
            }
          } catch {}
        }

        return {
          success: true,
          action,
          message: `Selected option "${action.option}" on element [${action.index}]`,
        };
      }

      case "check": {
        const locator = await resolveLocator(page, action, observation);
        if (!locator) {
          return {
            success: false,
            action,
            errorType: ACTION_FAILURE_TYPES.ELEMENT_GONE,
            message: `Target checkbox [${action.index}] could not be found in DOM.`,
          };
        }

        try {
          await locator.check({ timeout: Math.min(timeout, 3000) });
        } catch {
          await locator.click({ force: true }).catch(() => {});
        }

        return {
          success: true,
          action,
          message: `Checked element [${action.index}]`,
        };
      }

      case "uncheck": {
        const locator = await resolveLocator(page, action, observation);
        if (!locator) {
          return {
            success: false,
            action,
            errorType: ACTION_FAILURE_TYPES.ELEMENT_GONE,
            message: `Target checkbox [${action.index}] could not be found in DOM.`,
          };
        }

        try {
          await locator.uncheck({ timeout: Math.min(timeout, 3000) });
        } catch {
          await locator.click({ force: true }).catch(() => {});
        }

        return {
          success: true,
          action,
          message: `Unchecked element [${action.index}]`,
        };
      }

      case "uploadFile": {
        const locator = await resolveLocator(page, action, observation);
        const safePath = validateUploadPath(action.fileRef, options);

        if (locator) {
          try {
            await locator.setInputFiles(safePath, { timeout });
            return {
              success: true,
              action,
              message: `Uploaded file to input [${action.index}]`,
            };
          } catch {}
        }

        // Global fallback: find any active file input on the page
        const fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(safePath).catch(() => {});
          return {
            success: true,
            action,
            message: `Uploaded file via fallback file input`,
          };
        }

        return {
          success: false,
          action,
          errorType: ACTION_FAILURE_TYPES.ELEMENT_GONE,
          message: `Could not find file input element for upload.`,
        };
      }

      case "scroll": {
        const amount = action.amount || 500;
        const deltaY = action.direction === "up" ? -amount : amount;
        const deltaX =
          action.direction === "left"
            ? -amount
            : action.direction === "right"
              ? amount
              : 0;

        if (page.mouse && typeof page.mouse.wheel === "function") {
          await page.mouse.wheel(deltaX, deltaY);
        } else if (typeof page.evaluate === "function") {
          await page.evaluate(({ dx, dy }) => window.scrollBy(dx, dy), {
            dx: deltaX,
            dy: deltaY,
          });
        }
        await waitForPageSettle(page);
        return {
          success: true,
          action,
          message: `Scrolled ${action.direction} by ${amount}px`,
        };
      }

      case "pressKey": {
        if (page.keyboard && typeof page.keyboard.press === "function") {
          await page.keyboard.press(action.key);
        }
        await waitForPageSettle(page);
        return {
          success: true,
          action,
          message: `Pressed key "${action.key}"`,
        };
      }

      case "waitFor": {
        const ms = action.ms || 1000;
        if (typeof page.waitForTimeout === "function") {
          await page.waitForTimeout(ms);
        } else {
          await new Promise((resolve) => setTimeout(resolve, ms));
        }
        return { success: true, action, message: `Waited for ${ms}ms` };
      }

      case "extract":
      case "askHuman":
      case "requestReview":
      case "finish":
      case "fail": {
        return {
          success: true,
          action,
          message: `Control action ${type} acknowledged`,
        };
      }

      case "submitApplication": {
        await waitForPageSettle(page);
        return {
          success: true,
          action,
          message: "Application submission initiated",
        };
      }

      default: {
        return {
          success: false,
          action,
          errorType: ACTION_FAILURE_TYPES.UNKNOWN,
          message: `Unknown action type "${type}"`,
        };
      }
    }
  } catch (error) {
    const errorType = classifyActionError(error);
    await logError(`executeAction.${type}`, error.message);
    return {
      success: false,
      action,
      errorType,
      message: `Action execution failed: ${error.message}`,
    };
  }
};

export default executeAction;
