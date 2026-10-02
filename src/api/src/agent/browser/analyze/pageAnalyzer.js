import { logJobEvent, logError } from "../../../utils/logger.js";
import { PERCEPTION_PAGE_TYPES, DISABLED_BUTTON_REASONS } from "../../../constant/agent.constant.js";

/**
 * Page Analyzer: Extracts a rich, structured, LLM-optimized representation of any web page.
 * Observes forms, buttons, inputs, links, validation messages, iframes, and disabled elements.
 */
export const analyzePage = async (page, options = {}) => {
  if (!page || (typeof page.isClosed === "function" && page.isClosed())) {
    return {
      url: "",
      title: "",
      domain: "",
      pageType: PERCEPTION_PAGE_TYPES.UNKNOWN,
      visibleText: "",
      buttons: [],
      links: [],
      inputs: [],
      selects: [],
      checkboxes: [],
      radioButtons: [],
      forms: [],
      disabledElements: [],
      validationErrors: [],
      dialogs: [],
      iframes: [],
      screenshot: null,
      summary: "Page is not available or closed",
    };
  }

  const { includeScreenshot = false, maxTextLength = 2000 } = options;

  try {
    const url = page.url();
    const title = (await page.title().catch(() => "")) || "Untitled";
    let domain = "";
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = "";
    }

    // In-browser DOM extraction
    const domData = await page.evaluate(() => {
      const isVisible = (el) => {
        if (!el) return false;
        if (el.type === "file") return true;
        if (el.offsetParent !== null) return true;
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
        const style = window.getComputedStyle(el);
        return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
      };

      const resolveLabel = (el) => {
        if (!el) return "";
        const ariaLabel = el.getAttribute("aria-label");
        if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

        const ariaLabelledBy = el.getAttribute("aria-labelledby");
        if (ariaLabelledBy) {
          const lEl = document.getElementById(ariaLabelledBy);
          if (lEl && lEl.textContent.trim()) return lEl.textContent.trim();
        }

        if (el.id) {
          try {
            const lFor = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (lFor && lFor.textContent.trim()) return lFor.textContent.trim();
          } catch {}
        }

        const parentLabel = el.closest("label");
        if (parentLabel && parentLabel.textContent.trim()) {
          return parentLabel.textContent.trim();
        }

        const container = el.closest(".form-group, .form-field, [class*='field'], [class*='question'], [data-automation-id*='formField'], div");
        if (container) {
          const titleEl = container.querySelector("label, .label, h1, h2, h3, h4, h5, p, span.title, [data-automation-id*='label' i]");
          if (titleEl && titleEl !== el && titleEl.textContent.trim()) {
            return titleEl.textContent.trim();
          }
        }

        const placeholder = el.getAttribute("placeholder");
        if (placeholder && placeholder.trim()) return placeholder.trim();

        const name = el.getAttribute("name");
        if (name && name.trim()) return name.trim();

        return el.getAttribute("id") || "";
      };

      // 1. Validation Errors visible in DOM
      const validationErrors = [];
      const errorEls = document.querySelectorAll(
        ".error, .error-message, .invalid-feedback, [aria-invalid='true'], [class*='errorMessage' i], [class*='error-text' i], .text-danger, .alert-danger, [role='alert']"
      );
      errorEls.forEach((el) => {
        if (isVisible(el)) {
          const txt = (el.textContent || "").trim().replace(/\s+/g, " ");
          if (txt && txt.length < 200 && !validationErrors.includes(txt)) {
            validationErrors.push(txt);
          }
        }
      });

      // 2. Buttons
      const buttons = [];
      const buttonEls = Array.from(
        document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a.btn, a[class*="button" i]')
      );
      buttonEls.forEach((b, i) => {
        if (!isVisible(b)) return;
        const text = (b.textContent || b.value || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
        const isDisabled = b.disabled || b.getAttribute("aria-disabled") === "true" || /disabled/i.test(b.className || "");
        const autoId = b.getAttribute("data-automation-id") || "";
        const selector = b.id
          ? `#${b.id}`
          : autoId
            ? `[data-automation-id="${autoId}"]`
            : text
              ? `button:has-text("${text.slice(0, 30)}")`
              : `button_${i}`;

        const isSubmit = /submit|apply|save & apply|confirm|finish|send/i.test(text) || b.type === "submit";
        const isNext = /next|continue|proceed|step/i.test(text);

        buttons.push({
          index: i + 1,
          text,
          selector,
          disabled: Boolean(isDisabled),
          isSubmit,
          isNext,
          role: b.getAttribute("role") || "button",
          dataAutomationId: autoId,
        });
      });

      // 3. Inputs (text, email, tel, file, password, number)
      const inputs = [];
      const inputEls = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="radio"]):not([type="checkbox"]), textarea'));
      inputEls.forEach((inp, i) => {
        if (!isVisible(inp)) return;
        const label = resolveLabel(inp).replace(/\s+/g, " ").trim();
        const placeholder = inp.getAttribute("placeholder") || "";
        const type = inp.tagName.toLowerCase() === "textarea" ? "textarea" : (inp.getAttribute("type") || "text").toLowerCase();
        const autoId = inp.getAttribute("data-automation-id") || "";
        const isDisabled = inp.disabled || inp.getAttribute("aria-disabled") === "true";
        const isRequired = inp.required || inp.getAttribute("aria-required") === "true" || label.includes("*");

        const selector = inp.id
          ? `#${inp.id}`
          : inp.name
            ? `[name="${inp.name}"]`
            : autoId
              ? `[data-automation-id="${autoId}"]`
              : placeholder
                ? `[placeholder="${placeholder}"]`
                : `input_${i}`;

        inputs.push({
          index: i + 1,
          label: label || placeholder || inp.name || `Field ${i + 1}`,
          name: inp.name || inp.id || "",
          type,
          value: inp.value || "",
          placeholder,
          required: Boolean(isRequired),
          disabled: Boolean(isDisabled),
          selector,
          dataAutomationId: autoId,
        });
      });

      // 4. Selects
      const selects = [];
      const selectEls = Array.from(document.querySelectorAll("select, [role='combobox']"));
      selectEls.forEach((sel, i) => {
        if (!isVisible(sel)) return;
        const label = resolveLabel(sel).replace(/\s+/g, " ").trim();
        const autoId = sel.getAttribute("data-automation-id") || "";
        const isDisabled = sel.disabled || sel.getAttribute("aria-disabled") === "true";
        const isRequired = sel.required || sel.getAttribute("aria-required") === "true" || label.includes("*");

        const options = [];
        sel.querySelectorAll("option").forEach((o) => {
          const val = (o.textContent || o.value || "").trim();
          if (val && !/select/i.test(val)) options.push(val);
        });

        const selector = sel.id
          ? `#${sel.id}`
          : sel.name
            ? `[name="${sel.name}"]`
            : autoId
              ? `[data-automation-id="${autoId}"]`
              : `select_${i}`;

        selects.push({
          index: i + 1,
          label: label || sel.name || `Select ${i + 1}`,
          name: sel.name || sel.id || "",
          options: options.slice(0, 30),
          selectedValue: sel.value || "",
          required: Boolean(isRequired),
          disabled: Boolean(isDisabled),
          selector,
        });
      });

      // 5. Checkboxes
      const checkboxes = [];
      const checkEls = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
      checkEls.forEach((chk, i) => {
        if (!isVisible(chk)) return;
        const label = resolveLabel(chk).replace(/\s+/g, " ").trim();
        const autoId = chk.getAttribute("data-automation-id") || "";
        const isChecked = chk.checked || chk.getAttribute("aria-checked") === "true";
        const isTerms = /terms|privacy|policy|consent|agree|accept|conditions|acknowledge/i.test(label);
        const isRequired = chk.required || chk.getAttribute("aria-required") === "true" || isTerms;

        const selector = chk.id
          ? `#${chk.id}`
          : chk.name
            ? `[name="${chk.name}"]`
            : autoId
              ? `[data-automation-id="${autoId}"]`
              : `checkbox_${i}`;

        checkboxes.push({
          index: i + 1,
          label: label || chk.name || `Checkbox ${i + 1}`,
          name: chk.name || chk.id || "",
          checked: Boolean(isChecked),
          isTermsConsent: Boolean(isTerms),
          required: Boolean(isRequired),
          disabled: Boolean(chk.disabled),
          selector,
        });
      });

      // 6. Radio buttons
      const radioButtons = [];
      const radioEls = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"]'));
      radioEls.forEach((r, i) => {
        if (!isVisible(r)) return;
        const label = resolveLabel(r).replace(/\s+/g, " ").trim();
        const selector = r.id ? `#${r.id}` : r.name ? `input[name="${r.name}"][value="${r.value}"]` : `radio_${i}`;
        radioButtons.push({
          index: i + 1,
          label,
          group: r.name || "",
          value: r.value || "",
          checked: Boolean(r.checked),
          selector,
        });
      });

      // 7. Links
      const links = [];
      const linkEls = Array.from(document.querySelectorAll("a[href]")).slice(0, 30);
      linkEls.forEach((a, i) => {
        if (!isVisible(a)) return;
        const text = (a.textContent || a.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
        if (text && text.length < 80) {
          links.push({
            index: i + 1,
            text,
            href: a.href,
            selector: a.id ? `#${a.id}` : `a:has-text("${text.slice(0, 30)}")`,
            isExternal: Boolean(a.target === "_blank" || (a.hostname && a.hostname !== window.location.hostname)),
          });
        }
      });

      // 8. Dialogs / Modals
      const dialogs = [];
      const dialogEls = document.querySelectorAll('[role="dialog"], [role="alertdialog"], .modal, .modal-dialog, [class*="dialog" i], [class*="drawer" i]');
      dialogEls.forEach((d) => {
        if (isVisible(d)) {
          const dTitle = d.querySelector("h1, h2, h3, h4, .modal-title, [class*='title' i]")?.textContent?.trim() || "Active Dialog";
          dialogs.push({ title: dTitle });
        }
      });

      // 9. Forms
      const forms = [];
      document.querySelectorAll("form").forEach((f, i) => {
        if (isVisible(f)) {
          forms.push({
            index: i + 1,
            id: f.id || "",
            action: f.action || "",
            method: (f.method || "POST").toUpperCase(),
            fieldCount: f.querySelectorAll("input, select, textarea").length,
          });
        }
      });

      // 10. Disabled elements analysis
      const disabledElements = [];
      buttons
        .filter((b) => b.disabled)
        .forEach((b) => {
          disabledElements.push({
            type: "button",
            text: b.text,
            selector: b.selector,
            isSubmit: b.isSubmit,
          });
        });

      // Visible text sample
      const visibleText = (document.body ? document.body.innerText : "")
        .slice(0, 1800)
        .replace(/\s+/g, " ")
        .trim();

      return {
        buttons,
        links,
        inputs,
        selects,
        checkboxes,
        radioButtons,
        forms,
        disabledElements,
        validationErrors,
        dialogs,
        visibleText,
      };
    });

    // Detect iframes via Playwright API
    const iframes = [];
    try {
      const frames = page.frames();
      frames.forEach((f, i) => {
        const fUrl = f.url() || "";
        if (f !== page.mainFrame()) {
          iframes.push({
            index: i,
            url: fUrl,
            name: f.name() || `frame_${i}`,
            isCaptcha: /captcha|recaptcha|hcaptcha|turnstile/i.test(fUrl),
            isGoogleForm: /docs\.google\.com\/forms|forms\.gle/i.test(fUrl),
          });
        }
      });
    } catch {}

    // Screenshot capture if requested
    let screenshotBase64 = null;
    if (includeScreenshot) {
      const buffer = await page.screenshot({ fullPage: false }).catch(() => null);
      if (buffer) screenshotBase64 = buffer.toString("base64");
    }

    // Infer page type
    const pageType = classifyPageType(url, title, domData, iframes);

    // Compute Disabled Button Reasoning
    const disabledButtonReasoning = analyzeDisabledButtonPrerequisites(domData);

    const result = {
      url,
      title,
      domain,
      pageType,
      visibleText: domData.visibleText.slice(0, maxTextLength),
      buttons: domData.buttons,
      links: domData.links,
      inputs: domData.inputs,
      selects: domData.selects,
      checkboxes: domData.checkboxes,
      radioButtons: domData.radioButtons,
      forms: domData.forms,
      disabledElements: domData.disabledElements,
      disabledButtonReasoning,
      validationErrors: domData.validationErrors,
      dialogs: domData.dialogs,
      iframes,
      screenshot: screenshotBase64,
    };

    return result;
  } catch (error) {
    await logError("pageAnalyzer.analyzePage", error.message);
    return {
      url: page.url() || "",
      title: "",
      domain: "",
      pageType: PERCEPTION_PAGE_TYPES.UNKNOWN,
      visibleText: "",
      buttons: [],
      links: [],
      inputs: [],
      selects: [],
      checkboxes: [],
      radioButtons: [],
      forms: [],
      disabledElements: [],
      validationErrors: [],
      dialogs: [],
      iframes: [],
      screenshot: null,
      error: error.message,
    };
  }
};

/**
 * Classifies the semantic page type from URL and DOM structures
 */
const classifyPageType = (url, title, domData, iframes) => {
  const combined = `${url} ${title} ${domData.visibleText}`.toLowerCase();

  // 1. Success confirmation
  if (
    /thank you for applying|application submitted|successfully applied|received your application|application complete/i.test(
      combined
    )
  ) {
    return PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS;
  }

  // 2. Security Challenge / CAPTCHA
  if (
    iframes.some((f) => f.isCaptcha) ||
    /security check|verify you are human|recaptcha|hcaptcha|cf-turnstile/i.test(combined)
  ) {
    return PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED;
  }

  // 3. Login / Account Creation
  const hasPasswordField = domData.inputs.some((i) => i.type === "password");
  if (hasPasswordField) {
    if (/sign up|create account|register/i.test(combined)) {
      return PERCEPTION_PAGE_TYPES.SIGNUP;
    }
    return PERCEPTION_PAGE_TYPES.LOGIN;
  }

  // 4. Application Form
  const hasResumeUpload = domData.inputs.some((i) => i.type === "file");
  const hasFormInputs = domData.inputs.length >= 2;
  const hasSubmitBtn = domData.buttons.some((b) => b.isSubmit || b.isNext);

  if (hasResumeUpload || (hasFormInputs && hasSubmitBtn)) {
    return PERCEPTION_PAGE_TYPES.APPLICATION_FORM;
  }

  // 5. Job Detail / Listing
  if (/career|jobs|positions|openings/i.test(url) && domData.buttons.some((b) => /apply/i.test(b.text))) {
    return PERCEPTION_PAGE_TYPES.JOB_DETAIL;
  }

  return PERCEPTION_PAGE_TYPES.UNKNOWN;
};

/**
 * Disabled Apply / Submit Button Reasoning Engine:
 * Analyzes WHY an Apply/Submit button is disabled and identifies the missing prerequisite.
 */
export const analyzeDisabledButtonPrerequisites = (domData) => {
  const disabledSubmitBtn = domData.buttons.find((b) => b.disabled && (b.isSubmit || b.isNext));
  if (!disabledSubmitBtn) {
    return { hasDisabledSubmit: false, reason: null, suggestedPrerequisiteAction: null };
  }

  // 1. Check for visible validation errors
  if (domData.validationErrors.length > 0) {
    return {
      hasDisabledSubmit: true,
      buttonText: disabledSubmitBtn.text,
      reason: DISABLED_BUTTON_REASONS.VALIDATION_ERROR,
      message: `Active validation error: "${domData.validationErrors[0]}"`,
      suggestedPrerequisiteAction: {
        type: "correctError",
        errorText: domData.validationErrors[0],
      },
    };
  }

  // 2. Check for empty required inputs
  const emptyRequiredInput = domData.inputs.find((i) => i.required && !i.value.trim());
  if (emptyRequiredInput) {
    return {
      hasDisabledSubmit: true,
      buttonText: disabledSubmitBtn.text,
      reason: DISABLED_BUTTON_REASONS.REQUIRED_FIELD_EMPTY,
      message: `Required field is empty: "${emptyRequiredInput.label}"`,
      suggestedPrerequisiteAction: {
        type: emptyRequiredInput.type === "file" ? "upload" : "type",
        target: emptyRequiredInput.selector,
        field: emptyRequiredInput.label,
      },
    };
  }

  // 3. Check for unchecked required terms / consent checkbox
  const uncheckedConsent = domData.checkboxes.find((c) => (c.required || c.isTermsConsent) && !c.checked);
  if (uncheckedConsent) {
    return {
      hasDisabledSubmit: true,
      buttonText: disabledSubmitBtn.text,
      reason: DISABLED_BUTTON_REASONS.TERMS_UNCHECKED,
      message: `Required consent checkbox is not checked: "${uncheckedConsent.label}"`,
      suggestedPrerequisiteAction: {
        type: "check",
        target: uncheckedConsent.selector,
        field: uncheckedConsent.label,
      },
    };
  }

  // 4. Check for unselected required dropdown
  const unselectedSelect = domData.selects.find((s) => s.required && !s.selectedValue);
  if (unselectedSelect) {
    return {
      hasDisabledSubmit: true,
      buttonText: disabledSubmitBtn.text,
      reason: DISABLED_BUTTON_REASONS.LOCATION_UNSELECTED,
      message: `Required selection is not chosen: "${unselectedSelect.label}"`,
      suggestedPrerequisiteAction: {
        type: "select",
        target: unselectedSelect.selector,
        field: unselectedSelect.label,
        options: unselectedSelect.options,
      },
    };
  }

  return {
    hasDisabledSubmit: true,
    buttonText: disabledSubmitBtn.text,
    reason: DISABLED_BUTTON_REASONS.PERMANENTLY_DISABLED,
    message: `Button is disabled by employer page conditions.`,
    suggestedPrerequisiteAction: null,
  };
};

/**
 * Serializes the page analysis into the exact structured format for Gemini LLM.
 */
export const formatAnalysisForLlm = (analysis) => {
  if (!analysis) return "No page data available.";

  const lines = [];
  lines.push(`PAGE TYPE: ${analysis.pageType}`);
  lines.push(`URL: ${analysis.url}`);
  lines.push(`TITLE: ${analysis.title}`);
  lines.push("");

  lines.push("ELEMENTS:");
  let counter = 1;

  // Inputs
  (analysis.inputs || []).forEach((inp) => {
    const status = inp.value ? `[Filled: "${inp.value.slice(0, 20)}"]` : "[Empty]";
    const req = inp.required ? "(Required)" : "";
    lines.push(`${counter++}. ${inp.label} ${req} → ${inp.type} ${status} [selector: ${inp.selector}]`);
  });

  // Selects
  (analysis.selects || []).forEach((sel) => {
    const status = sel.selectedValue ? `[Selected: "${sel.selectedValue}"]` : "[Unselected]";
    const req = sel.required ? "(Required)" : "";
    const opts = sel.options && sel.options.length > 0 ? ` (Options: ${sel.options.slice(0, 5).join(", ")})` : "";
    lines.push(`${counter++}. ${sel.label} ${req} → select ${status}${opts} [selector: ${sel.selector}]`);
  });

  // Checkboxes
  (analysis.checkboxes || []).forEach((chk) => {
    const status = chk.checked ? "[Checked]" : "[Unchecked]";
    const req = chk.required || chk.isTermsConsent ? "(Required Terms)" : "";
    lines.push(`${counter++}. ${chk.label} ${req} → checkbox ${status} [selector: ${chk.selector}]`);
  });

  // Radio buttons
  (analysis.radioButtons || []).forEach((r) => {
    const status = r.checked ? "[Checked]" : "[Unchecked]";
    lines.push(`${counter++}. ${r.label || r.value} (${r.group}) → radio ${status} [selector: ${r.selector}]`);
  });

  // Buttons
  (analysis.buttons || []).forEach((b) => {
    const state = b.disabled ? "disabled button" : "button";
    const tag = b.isSubmit ? "[Submit]" : b.isNext ? "[Next]" : "";
    lines.push(`${counter++}. "${b.text}" ${tag} → ${state} [selector: ${b.selector}]`);
  });

  // Validation
  lines.push("");
  lines.push("VALIDATION:");
  if (analysis.validationErrors && analysis.validationErrors.length > 0) {
    analysis.validationErrors.forEach((err) => lines.push(`- ${err}`));
  } else {
    lines.push("- None detected");
  }

  // Disabled Apply / Button Reasoning
  if (analysis.disabledButtonReasoning?.hasDisabledSubmit) {
    lines.push("");
    lines.push("DISABLED BUTTON PREREQUISITE ANALYSIS:");
    lines.push(`- Button: "${analysis.disabledButtonReasoning.buttonText}" is DISABLED.`);
    lines.push(`- Identified Cause: ${analysis.disabledButtonReasoning.reason} - ${analysis.disabledButtonReasoning.message}`);
    if (analysis.disabledButtonReasoning.suggestedPrerequisiteAction) {
      lines.push(
        `- Required Prerequisite Action: ${analysis.disabledButtonReasoning.suggestedPrerequisiteAction.type} on ${analysis.disabledButtonReasoning.suggestedPrerequisiteAction.target || analysis.disabledButtonReasoning.suggestedPrerequisiteAction.field}`
      );
    }
  }

  // Active Dialogs
  if (analysis.dialogs && analysis.dialogs.length > 0) {
    lines.push("");
    lines.push(`ACTIVE MODAL / DIALOG: ${analysis.dialogs.map((d) => d.title).join(", ")}`);
  }

  return lines.join("\n");
};

export default {
  analyzePage,
  analyzeDisabledButtonPrerequisites,
  formatAnalysisForLlm,
};
