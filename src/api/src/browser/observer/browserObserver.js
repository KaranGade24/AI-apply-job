import { observeDOM } from "./domObserver.js";
import { observeAccessibility } from "./accessibilityObserver.js";
import { logJobEvent, logError } from "../../utils/logger.js";
import crypto from "crypto";

/**
 * Creates a unique page snapshot signature based on the visible elements.
 */
function computePageRevision(elements, url) {
  const payload = elements
    .filter((el) => el.visible)
    .map(
      (el) =>
        `${el.elementFingerprint}:${el.boundingBox.x},${el.boundingBox.y}`,
    )
    .sort()
    .join("|");

  return crypto
    .createHash("sha256")
    .update(url + "|" + payload)
    .digest("hex");
}

/**
 * Coordinates observation components to generate a complete PageObservation.
 * @param {import('playwright').Page} page
 * @returns {Promise<object>} PageObservation object
 */
export async function observeBrowser(page) {
  try {
    const url = page.url();
    const title = await page.title().catch(() => "");
    const visibleText = await page
      .evaluate(() => document.body?.innerText || "")
      .catch(() => "");

    // 1. Gather all raw DOM elements
    const rawElements = await observeDOM(page);

    // 2. Enrich with accessibility data
    const enrichedElements = await observeAccessibility(page, rawElements);

    // 3. Build snapshot properties
    const pageObservationId = `obs_${crypto.randomUUID().substring(0, 8)}`;
    const pageRevision = computePageRevision(enrichedElements, url);

    // 4. Categorize interactive elements for easy consumption
    const forms = enrichedElements.filter((el) => el.tagName === "form");
    const buttons = enrichedElements.filter(
      (el) =>
        el.tagName === "button" ||
        el.role === "button" ||
        el.type === "button" ||
        el.type === "submit",
    );
    const inputs = enrichedElements.filter(
      (el) =>
        el.tagName === "input" &&
        !["checkbox", "radio", "file", "button", "submit"].includes(el.type),
    );
    const selects = enrichedElements.filter((el) => el.tagName === "select");
    const checkboxes = enrichedElements.filter(
      (el) => el.tagName === "input" && el.type === "checkbox",
    );
    const radios = enrichedElements.filter(
      (el) => el.tagName === "input" && el.type === "radio",
    );
    const fileInputs = enrichedElements.filter(
      (el) => el.tagName === "input" && el.type === "file",
    );

    // 5. Detect modal / dialog elements on page
    const modalOpen = await page.evaluate(() => {
      const modals = Array.from(
        document.querySelectorAll(
          '.modal, .dialog, [role="dialog"], [aria-modal="true"]',
        ),
      );
      return modals.some((m) => {
        const rect = m.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          window.getComputedStyle(m).display !== "none"
        );
      });
    });

    const dialogs = await page
      .evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '.modal, .dialog, [role="dialog"], [aria-modal="true"]',
          ),
        )
          .filter((dialog) => {
            const rect = dialog.getBoundingClientRect();
            const style = window.getComputedStyle(dialog);
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== "none" &&
              style.visibility !== "hidden"
            );
          })
          .map((dialog) => ({
            role: dialog.getAttribute("role") || "dialog",
            title:
              dialog
                .querySelector("h1, h2, h3, [aria-label]")
                ?.textContent?.trim()
                .slice(0, 200) || "",
            text: dialog.innerText?.trim().slice(0, 500) || "",
          }))
          .slice(0, 10),
      )
      .catch(() => []);

    const validationMessages = await page
      .evaluate(() =>
        Array.from(
          document.querySelectorAll(
            '[role="alert"], .error, .errors, [aria-invalid="true"]',
          ),
        )
          .map(
            (element) =>
              element.innerText || element.getAttribute("aria-label") || "",
          )
          .filter(Boolean)
          .slice(0, 20),
      )
      .catch(() => []);

    const successDetected =
      /thank\s+you|application\s+(?:has\s+been\s+)?received|successfully\s+submitted|confirmation\s*(?:number|#|id)/i.test(
        visibleText,
      );
    const errorDetected =
      validationMessages.length > 0 ||
      /captcha|access denied|application error|something went wrong/i.test(
        visibleText,
      );

    const pageObservation = {
      pageObservationId,
      pageRevision,
      url,
      title,
      visibleText: visibleText.slice(0, 4000),
      visibleTextTrimmed: visibleText.slice(0, 2000),
      interactiveElements: enrichedElements,
      forms,
      buttons,
      inputs,
      selects,
      checkboxes,
      radios,
      fileInputs,
      modalOpen,
      dialogs,
      validationMessages,
      successDetected,
      errorDetected,
      iframeCount: page.frames().length - 1, // Exclude main frame
      timestamp: new Date(),
    };

    await logJobEvent(
      "browserObserver",
      "OBSERVE_PAGE",
      `URL: ${url} | Title: "${title}" | Elements: ${enrichedElements.length} | Revision: ${pageRevision.substring(0, 10)}`,
    );

    return pageObservation;
  } catch (error) {
    await logError("browserObserver.observeBrowser", error.message);
    throw error;
  }
}

export default observeBrowser;
