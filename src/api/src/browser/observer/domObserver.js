import { logError } from "../../utils/logger.js";

/**
 * Extracts raw interactive DOM elements and page structure directly from Playwright Page or Frame.
 * Runs in-browser via evaluate to produce normalized element metadata with bounding boxes and selector candidates.
 *
 * @param {import('playwright').Page | import('playwright').Frame} frameOrPage
 * @returns {Promise<object>} Raw DOM extraction result
 */
export const extractDomSnapshot = async (frameOrPage) => {
  try {
    const snapshot = await frameOrPage.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.opacity === "0"
        ) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };

      const getAssociatedLabel = (el) => {
        if (el.id) {
          const labelFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
          if (labelFor && labelFor.textContent) return labelFor.textContent.trim();
        }
        const parentLabel = el.closest("label");
        if (parentLabel && parentLabel.textContent) {
          return parentLabel.textContent.trim();
        }
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel) return ariaLabel.trim();
        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
          const ref = document.getElementById(ariaLabelledBy);
          if (ref && ref.textContent) return ref.textContent.trim();
        }
        return null;
      };

      const generateSelectorCandidates = (el) => {
        const candidates = [];
        if (el.id && !/^\d/.test(el.id)) {
          candidates.push(`#${CSS.escape(el.id)}`);
        }
        const name = el.getAttribute("name");
        if (name) {
          candidates.push(`${el.tagName.toLowerCase()}[name="${CSS.escape(name)}"]`);
        }
        const dataTestId =
          el.getAttribute("data-testid") ||
          el.getAttribute("data-test") ||
          el.getAttribute("data-cy") ||
          el.getAttribute("data-qa");
        if (dataTestId) {
          candidates.push(`[data-testid="${CSS.escape(dataTestId)}"]`);
          candidates.push(`[data-test="${CSS.escape(dataTestId)}"]`);
        }
        const role = el.getAttribute("role");
        if (role) {
          candidates.push(`[role="${role}"]`);
        }
        if (el.className && typeof el.className === "string") {
          const classes = el.className
            .split(/\s+/)
            .filter((c) => c && !c.includes(":") && !c.includes("[") && !c.startsWith("css-") && c.length < 30);
          if (classes.length > 0) {
            candidates.push(`${el.tagName.toLowerCase()}.${classes.slice(0, 2).join(".")}`);
          }
        }
        return candidates;
      };

      // 1. Collect interactive elements
      const query = [
        "button",
        "input",
        "select",
        "textarea",
        "a[href]",
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[role="option"]',
        "[contenteditable]",
        "[tabindex]:not([tabindex='-1'])",
      ].join(", ");

      const rawElements = Array.from(document.querySelectorAll(query));
      let elementIndex = 0;
      const interactiveElements = [];

      for (const el of rawElements) {
        const visible = isVisible(el);
        if (!visible) continue;

        elementIndex += 1;
        const rect = el.getBoundingClientRect();
        const tagName = el.tagName.toLowerCase();
        const type = el.getAttribute("type") || (tagName === "textarea" ? "textarea" : tagName === "select" ? "select" : "text");
        const role = el.getAttribute("role") || (tagName === "button" ? "button" : tagName === "a" ? "link" : type);
        const text = (el.innerText || el.textContent || "").trim().slice(0, 150);
        const label = getAssociatedLabel(el);
        const placeholder = el.getAttribute("placeholder") || null;
        const value = el.value !== undefined ? String(el.value).slice(0, 100) : null;
        const checked = el.checked ?? null;
        const required = el.required || el.getAttribute("aria-required") === "true";
        const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
        const readonly = el.readOnly || el.getAttribute("aria-readonly") === "true";
        const selectorCandidates = generateSelectorCandidates(el);

        interactiveElements.push({
          elementId: `el_${elementIndex}`,
          tagName,
          role,
          type,
          text,
          label,
          ariaLabel: el.getAttribute("aria-label"),
          placeholder,
          name: el.getAttribute("name"),
          id: el.id || null,
          value,
          checked,
          required,
          enabled: !disabled && !readonly,
          visible: true,
          boundingBox: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          selectorCandidates,
        });
      }

      // 2. Collect validation error messages and banners
      const errorSelectors = [
        '[class*="error"]',
        '[class*="invalid"]',
        '[role="alert"]',
        '[aria-invalid="true"]',
        ".text-danger",
        ".feedback-error",
      ];
      const validationMessages = [];
      for (const sel of errorSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          if (isVisible(el)) {
            const txt = (el.innerText || "").trim();
            if (txt && txt.length > 2 && txt.length < 250 && !validationMessages.includes(txt)) {
              validationMessages.push(txt);
            }
          }
        });
      }

      // 3. Collect Headings
      const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4"))
        .filter(isVisible)
        .map((h) => (h.innerText || "").trim())
        .filter((t) => t.length > 0)
        .slice(0, 20);

      // 4. Loading indicators
      const loadingSelectors = [
        '[class*="spinner"]',
        '[class*="loading"]',
        '[aria-busy="true"]',
        ".loader",
      ];
      const hasLoadingIndicator = loadingSelectors.some((sel) => {
        const el = document.querySelector(sel);
        return isVisible(el);
      });

      // 5. Detect Dialogs / Modals
      const dialogs = Array.from(document.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"], .modal'))
        .filter(isVisible)
        .map((d) => ({
          title: (d.querySelector("h1, h2, h3, h4, .modal-title")?.innerText || "").trim(),
          hasCloseButton: !!d.querySelector('button[aria-label*="close" i], button.close'),
        }));

      // 6. Visible text snippet
      const visibleText = (document.body?.innerText || "").slice(0, 2000);

      return {
        interactiveElements,
        validationMessages,
        headings,
        dialogs,
        hasLoadingIndicator,
        visibleText,
      };
    });

    return snapshot;
  } catch (error) {
    await logError("domObserver.extractDomSnapshot", error.message);
    return {
      interactiveElements: [],
      validationMessages: [],
      headings: [],
      dialogs: [],
      hasLoadingIndicator: false,
      visibleText: "",
    };
  }
};
