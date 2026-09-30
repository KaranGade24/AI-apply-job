import { logError, logJobEvent } from "../../utils/logger.js";

/**
 * Resolves a Playwright Locator using multi-tier fallback strategy.
 * Never relies on brittle generated CSS selectors alone.
 *
 * Preferred targeting order:
 * 1. Unique element ID (#id)
 * 2. Accessible role + accessible name (page.getByRole)
 * 3. Associated label (page.getByLabel)
 * 4. Placeholder / Test ID
 * 5. Text content + tag context
 * 6. CSS selector candidates
 * 7. XPath fallback
 *
 * @param {import('playwright').Page | import('playwright').Frame} pageOrFrame
 * @param {object} target - Target element specification
 * @param {object} [options] - Options (e.g. timeout)
 * @returns {Promise<{ locator: import('playwright').Locator, resolvedVia: string }>}
 */
export const resolveElementLocator = async (pageOrFrame, target, options = {}) => {
  const timeout = options.timeout || 4000;

  if (!target || typeof target !== "object") {
    throw new Error("Invalid target specification: target must be an object");
  }

  // 1. Stable unique attribute (#id)
  if (target.id && !/^\d/.test(target.id)) {
    try {
      const loc = pageOrFrame.locator(`#${CSS.escape(target.id)}`).first();
      await loc.waitFor({ state: "attached", timeout: 1500 });
      return { locator: loc, resolvedVia: "id_attribute" };
    } catch {
      // Continue to next tier
    }
  }

  // 2. Accessible role + accessible name
  if (target.role && (target.ariaLabel || target.text || target.name)) {
    const accessibleName = target.ariaLabel || target.text || target.name;
    try {
      const loc = pageOrFrame.getByRole(target.role, { name: accessibleName, exact: false }).first();
      await loc.waitFor({ state: "attached", timeout: 1500 });
      return { locator: loc, resolvedVia: "accessible_role_and_name" };
    } catch {
      // Continue to next tier
    }
  }

  // 3. Associated Label (for inputs/textareas/selects)
  if (target.label) {
    try {
      const loc = pageOrFrame.getByLabel(target.label, { exact: false }).first();
      await loc.waitFor({ state: "attached", timeout: 1500 });
      return { locator: loc, resolvedVia: "associated_label" };
    } catch {
      // Continue
    }
  }

  // 4. Placeholder
  if (target.placeholder) {
    try {
      const loc = pageOrFrame.getByPlaceholder(target.placeholder, { exact: false }).first();
      await loc.waitFor({ state: "attached", timeout: 1500 });
      return { locator: loc, resolvedVia: "placeholder" };
    } catch {
      // Continue
    }
  }

  // 5. Text content + structural tag context
  if (target.text && target.text.length > 1) {
    try {
      const textToMatch = target.text.slice(0, 80);
      const loc = pageOrFrame.getByText(textToMatch, { exact: false }).first();
      await loc.waitFor({ state: "attached", timeout: 1500 });
      return { locator: loc, resolvedVia: "text_content" };
    } catch {
      // Continue
    }
  }

  // 6. Selector Candidates from snapshot
  if (Array.isArray(target.selectorCandidates) && target.selectorCandidates.length > 0) {
    for (const sel of target.selectorCandidates) {
      try {
        const loc = pageOrFrame.locator(sel).first();
        await loc.waitFor({ state: "attached", timeout: 1000 });
        return { locator: loc, resolvedVia: `selector_candidate:${sel}` };
      } catch {
        // Try next candidate
      }
    }
  }

  // 7. Direct selector fallback
  if (target.selector) {
    try {
      const loc = pageOrFrame.locator(target.selector).first();
      await loc.waitFor({ state: "attached", timeout });
      return { locator: loc, resolvedVia: "direct_selector" };
    } catch {
      // Fallback failed
    }
  }

  // 8. XPath fallback
  if (target.xpath) {
    try {
      const loc = pageOrFrame.locator(`xpath=${target.xpath}`).first();
      await loc.waitFor({ state: "attached", timeout });
      return { locator: loc, resolvedVia: "xpath" };
    } catch {
      // Fallback failed
    }
  }

  throw new Error(
    `Unable to resolve locator for element (${target.elementId || target.role || target.text || "unknown"}). Target not found or stale.`
  );
};
