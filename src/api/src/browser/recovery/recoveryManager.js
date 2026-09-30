import { FAILURE_TYPES, RETRY_BUDGETS } from "../../constant/application.constant.js";
import { logJobEvent } from "../../utils/logger.js";

/**
 * Executes a structured recovery strategy for a classified failure.
 *
 * @param {import('playwright').Page} page
 * @param {object} failure - Classified failure from classifyFailure
 * @param {object} action - Failed action
 * @param {number} attemptCount - Attempts so far for this action
 * @returns {Promise<object>} Recovery result contract
 */
export const executeRecoveryStrategy = async (page, failure, action, attemptCount = 1) => {
  const risk = action?.riskLevel || "LOW";
  const budget = RETRY_BUDGETS[risk] ?? 2;

  await logJobEvent(
    "recoveryManager",
    "RECOVERY_ATTEMPT",
    `Failure type: ${failure.type} | Attempt: ${attemptCount}/${budget} | Strategy: ${failure.strategy}`
  );

  // Check budget
  if (attemptCount >= budget) {
    return {
      recovered: false,
      retry: false,
      strategy: "exhausted_budget",
      reason: `Maximum retry budget (${budget}) exceeded for action risk level (${risk})`,
      newObservationRequired: true,
      humanRequired: true,
    };
  }

  // Handle immediate human escalation
  if (failure.requiresHuman) {
    return {
      recovered: false,
      retry: false,
      strategy: failure.strategy,
      reason: failure.message,
      newObservationRequired: true,
      humanRequired: true,
    };
  }

  switch (failure.type) {
    case FAILURE_TYPES.STALE_ELEMENT: {
      // Invalidate cache and wait for DOM stabilization
      await page.waitForTimeout(1000);
      return {
        recovered: true,
        retry: true,
        strategy: "stale_element_refresh",
        reason: "Stale reference invalidated; target will be re-resolved from fresh observation",
        newObservationRequired: true,
        humanRequired: false,
      };
    }

    case FAILURE_TYPES.TARGET_NOT_VISIBLE: {
      // Scroll page to reveal elements
      await page.mouse.wheel(0, 400).catch(() => {});
      await page.waitForTimeout(800);
      return {
        recovered: true,
        retry: true,
        strategy: "viewport_scroll",
        reason: "Scrolled viewport to bring hidden element into view",
        newObservationRequired: true,
        humanRequired: false,
      };
    }

    case FAILURE_TYPES.PAGE_NOT_READY:
    case FAILURE_TYPES.NETWORK_TIMEOUT: {
      // Wait for network idle or DOM stabilization
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1500);
      return {
        recovered: true,
        retry: true,
        strategy: "wait_for_idle",
        reason: "Waited for page readiness and network stabilization",
        newObservationRequired: true,
        humanRequired: false,
      };
    }

    case FAILURE_TYPES.VALIDATION_ERROR: {
      // A field was rejected by client-side validation
      return {
        recovered: true,
        retry: true,
        strategy: "replan_field_value",
        reason: "Validation error captured; replanning answer mapping",
        newObservationRequired: true,
        humanRequired: false,
      };
    }

    case FAILURE_TYPES.LOOP_DETECTED: {
      return {
        recovered: false,
        retry: false,
        strategy: "break_loop",
        reason: "Execution loop detected: identical actions are repeatedly failing",
        newObservationRequired: true,
        humanRequired: true,
      };
    }

    default: {
      await page.waitForTimeout(1000);
      return {
        recovered: true,
        retry: true,
        strategy: "default_reobserve",
        reason: "Re-observing page before replanning next action",
        newObservationRequired: true,
        humanRequired: false,
      };
    }
  }
};
