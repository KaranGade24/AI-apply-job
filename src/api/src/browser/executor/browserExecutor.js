import { BROWSER_ACTIONS } from '../../constant/application.constant.js';
import { validateAction } from './actionValidator.js';
import { resolveElement } from '../observer/elementResolver.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * High-reliability browser action executor.
 * Conforms strictly to validated instructions and condition-based waiting.
 *
 * @param {import('playwright').Page} page
 * @param {object} action - Action to execute
 * @param {object} pageObservation - Current page observation context
 * @param {object} [executionContext] - Retry limits, history, and application states
 * @returns {Promise<object>} Structured execution result
 */
export async function executeAction(page, action, pageObservation, executionContext = {}) {
  const startedAt = new Date();
  const actionType = action?.type;
  const target = action?.target || {};
  const value = action?.value;

  // 1. Validate action prior to execution
  const validation = validateAction(action, pageObservation, executionContext);
  if (!validation.valid) {
    return {
      ok: false,
      actionId: action?.actionId,
      actionType,
      target,
      executionEvidence: {
        validated: false,
        validationReasons: validation.reasons
      },
      browserStateChanged: false,
      startedAt,
      completedAt: new Date(),
      error: `Validation rejected: ${validation.reasons.join('; ')}`
    };
  }

  const executionEvidence = {
    validated: true,
    forced: false,
    elevatedRisk: false,
    tagName: null,
    initialUrl: page.url(),
    finalUrl: null
  };

  try {
    const isNavigation = actionType === BROWSER_ACTIONS.NAVIGATE;
    const isGoBack = actionType === BROWSER_ACTIONS.GO_BACK;
    const isPassive = [BROWSER_ACTIONS.WAIT, BROWSER_ACTIONS.SCROLL].includes(actionType);
    const requiresTarget = !isNavigation && !isGoBack && !isPassive;

    let locator = null;

    if (requiresTarget) {
      // Resolve the live target safely using elementResolver
      const resolved = await resolveElement(page, target);
      if (!resolved || resolved.resolved === false) {
        throw new Error(`Target resolution failed: ${resolved?.reason || 'NOT_FOUND'}`);
      }

      locator = resolved;

      // Ensure target is attached, visible, and enabled
      await locator.waitFor({ state: 'attached', timeout: 5000 });
      await locator.waitFor({ state: 'visible', timeout: 5000 });

      const isEnabled = await locator.isEnabled().catch(() => false);
      if (!isEnabled) {
        throw new Error('Target element is attached and visible but disabled');
      }

      executionEvidence.tagName = await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => null);
    }

    // Execute actions
    switch (actionType) {
      case BROWSER_ACTIONS.NAVIGATE: {
        const url = target.url || target.href || value;
        if (!url) throw new Error('NAVIGATE action missing target URL');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        break;
      }

      case BROWSER_ACTIONS.CLICK: {
        try {
          // Normal click with direct locator timeout
          await locator.click({ timeout: 4000 });
        } catch (normalClickError) {
          // Exceptional fallback: forced click
          await logJobEvent('browserExecutor', 'WARNING', `Standard click failed: ${normalClickError.message}. Attempting forced click.`);
          await locator.click({ force: true, timeout: 3000 });
          executionEvidence.forced = true;
          executionEvidence.elevatedRisk = true;
        }
        break;
      }

      case BROWSER_ACTIONS.FILL: {
        const strVal = String(value ?? '');
        await locator.fill(strVal);
        break;
      }

      case BROWSER_ACTIONS.TYPE: {
        const strVal = String(value ?? '');
        await locator.focus();
        await locator.pressSequentially(strVal, { delay: 30 });
        break;
      }

      case BROWSER_ACTIONS.SELECT: {
        const strVal = String(value ?? '');
        await locator.selectOption({ label: strVal }).catch(async () => {
          await locator.selectOption({ value: strVal }).catch(async () => {
            await locator.selectOption(strVal);
          });
        });
        break;
      }

      case BROWSER_ACTIONS.CHECK: {
        await locator.check();
        break;
      }

      case BROWSER_ACTIONS.UNCHECK: {
        await locator.uncheck();
        break;
      }

      case BROWSER_ACTIONS.UPLOAD: {
        if (!value) throw new Error('UPLOAD action missing file path');
        await locator.setInputFiles(value);
        break;
      }

      case BROWSER_ACTIONS.SCROLL: {
        const delta = typeof value === 'number' ? value : 400;
        await page.evaluate((y) => window.scrollBy(0, y), delta);
        break;
      }

      case BROWSER_ACTIONS.WAIT: {
        const delay = typeof value === 'number' ? value : 1000;
        await page.waitForTimeout(delay);
        break;
      }

      case BROWSER_ACTIONS.GO_BACK: {
        await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
        break;
      }

      case BROWSER_ACTIONS.CLOSE_MODAL: {
        await page.keyboard.press('Escape');
        break;
      }

      default:
        throw new Error(`Unrecognized action type: ${actionType}`);
    }

    // Wait for DOM content loading or potential navigation settling
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    executionEvidence.finalUrl = page.url();

    const browserStateChanged = executionEvidence.initialUrl !== executionEvidence.finalUrl;

    return {
      ok: true,
      actionId: action?.actionId,
      actionType,
      target,
      executionEvidence,
      browserStateChanged,
      startedAt,
      completedAt: new Date(),
      error: null
    };
  } catch (error) {
    await logError('browserExecutor.executeAction', error.message);
    executionEvidence.finalUrl = page.url();

    return {
      ok: false,
      actionId: action?.actionId,
      actionType,
      target,
      executionEvidence,
      browserStateChanged: false,
      startedAt,
      completedAt: new Date(),
      error: error.message
    };
  }
}
