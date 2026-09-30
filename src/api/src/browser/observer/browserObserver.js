import { extractDomSnapshot } from "./domObserver.js";
import { extractAccessibilitySnapshot } from "./accessibilityObserver.js";
import { logError } from "../../utils/logger.js";

/**
 * Captures comprehensive normalized page observation combining DOM, Accessibility, and viewport signals
 *
 * @param {import('playwright').Page} page - Active Playwright page
 * @param {object} [options]
 * @returns {Promise<object>} Normalized PageObservation
 */
export const observeBrowser = async (page, options = {}) => {
  try {
    const url = page.url();
    const title = await page.title().catch(() => "");

    // 1. Extract interactive DOM snapshot
    const dom = await extractDomSnapshot(page);

    // 2. Extract Accessibility tree snapshot
    const axNodes = await extractAccessibilitySnapshot(page);

    // 3. Detect iframes
    const frames = page.frames().map((f, idx) => ({
      frameId: `frame_${idx}`,
      url: f.url(),
      isMainFrame: f === page.mainFrame(),
    }));

    // 4. Categorize interactive elements for quick lookup
    const buttons = [];
    const links = [];
    const inputs = [];
    const selects = [];
    const checkboxes = [];
    const radioButtons = [];
    const textareas = [];
    const fileInputs = [];

    for (const el of dom.interactiveElements) {
      if (el.tagName === "button" || el.role === "button") {
        buttons.push(el);
      } else if (el.tagName === "a" || el.role === "link") {
        links.push(el);
      } else if (el.tagName === "textarea") {
        textareas.push(el);
      } else if (el.tagName === "select" || el.role === "combobox" || el.role === "listbox") {
        selects.push(el);
      } else if (el.type === "checkbox" || el.role === "checkbox") {
        checkboxes.push(el);
      } else if (el.type === "radio" || el.role === "radio") {
        radioButtons.push(el);
      } else if (el.type === "file") {
        fileInputs.push(el);
      } else {
        inputs.push(el);
      }
    }

    // 5. Detect Blockers / Interrupters
    const visibleTextLower = (dom.visibleText || "").toLowerCase();
    const captchaDetected =
      visibleTextLower.includes("recaptcha") ||
      visibleTextLower.includes("hcaptcha") ||
      visibleTextLower.includes("cf-turnstile") ||
      visibleTextLower.includes("verify you are human") ||
      visibleTextLower.includes("security check") ||
      dom.interactiveElements.some((e) => (e.selectorCandidates || []).some((s) => s.includes("captcha")));

    const loginDetected =
      (visibleTextLower.includes("sign in") ||
        visibleTextLower.includes("log in") ||
        visibleTextLower.includes("enter your password")) &&
      inputs.some((i) => i.type === "password");

    const otpDetected =
      visibleTextLower.includes("one-time password") ||
      visibleTextLower.includes("verification code") ||
      visibleTextLower.includes("enter otp") ||
      visibleTextLower.includes("sent a code to");

    // 6. Detect Success Indicators
    const successIndicators = [];
    const successTerms = [
      "application submitted",
      "thank you for applying",
      "application received",
      "your application has been submitted",
      "successfully applied",
      "we have received your application",
    ];
    for (const term of successTerms) {
      if (visibleTextLower.includes(term)) {
        successIndicators.push(term);
      }
    }

    const observation = {
      url,
      title,
      timestamp: new Date(),
      headings: dom.headings,
      buttons,
      links,
      inputs,
      selects,
      checkboxes,
      radioButtons,
      textareas,
      fileInputs,
      interactiveElements: dom.interactiveElements,
      accessibilityNodes: axNodes.slice(0, 50),
      validationMessages: dom.validationMessages,
      dialogs: dom.dialogs,
      frames,
      hasLoadingIndicator: dom.hasLoadingIndicator,
      visibleSnippet: (dom.visibleText || "").slice(0, 1000),
      blockers: {
        captcha: captchaDetected,
        login: loginDetected,
        otp: otpDetected,
      },
      successIndicators,
      hasForm: inputs.length + selects.length + textareas.length > 0 || fileInputs.length > 0,
      totalInteractiveCount: dom.interactiveElements.length,
    };

    return observation;
  } catch (error) {
    await logError("browserObserver.observeBrowser", error.message);
    return {
      url: page.url?.() || "",
      title: "",
      timestamp: new Date(),
      headings: [],
      buttons: [],
      links: [],
      inputs: [],
      selects: [],
      checkboxes: [],
      radioButtons: [],
      textareas: [],
      fileInputs: [],
      interactiveElements: [],
      accessibilityNodes: [],
      validationMessages: [],
      dialogs: [],
      frames: [],
      hasLoadingIndicator: false,
      visibleSnippet: "",
      blockers: { captcha: false, login: false, otp: false },
      successIndicators: [],
      hasForm: false,
      totalInteractiveCount: 0,
    };
  }
};
