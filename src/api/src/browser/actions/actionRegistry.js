import {
  registeredActionSchema,
  actionTargetTypes,
  REGISTERED_ACTIONS,
} from "./actionSchema.js";
import { executeAction } from "../executor/browserExecutor.js";
import { validateAction } from "../executor/actionValidator.js";
import { resolveElement } from "../observer/elementResolver.js";
import { BROWSER_ACTIONS } from "../../constant/application.constant.js";

const legacyTypeMap = Object.freeze({
  navigate: BROWSER_ACTIONS.NAVIGATE,
  back: BROWSER_ACTIONS.GO_BACK,
  forward: BROWSER_ACTIONS.GO_FORWARD,
  click: BROWSER_ACTIONS.CLICK,
  fill: BROWSER_ACTIONS.FILL,
  type: BROWSER_ACTIONS.TYPE,
  selectOption: BROWSER_ACTIONS.SELECT,
  check: BROWSER_ACTIONS.CHECK,
  uncheck: BROWSER_ACTIONS.UNCHECK,
  uploadFile: BROWSER_ACTIONS.UPLOAD,
  scroll: BROWSER_ACTIONS.SCROLL,
  wait: BROWSER_ACTIONS.WAIT,
  openLink: BROWSER_ACTIONS.CLICK,
});

const findObservedTarget = (action, observation) => {
  if (!action.target) return null;
  return (
    (observation?.interactiveElements || []).find(
      (element) =>
        (action.target.elementId &&
          element.elementId === action.target.elementId) ||
        (action.target.elementFingerprint &&
          element.elementFingerprint === action.target.elementFingerprint),
    ) || null
  );
};

export const validateRegisteredAction = (
  action,
  observation = {},
  context = {},
) => {
  const parsed = registeredActionSchema.safeParse(action);
  if (!parsed.success) {
    return {
      valid: false,
      reasons: parsed.error.issues.map((issue) => issue.message),
      action: null,
    };
  }

  const normalized = parsed.data;
  const reasons = [];
  if (
    normalized.observationRevision &&
    normalized.observationRevision !== observation.pageRevision
  ) {
    reasons.push(
      "Action observation revision does not match the current page revision.",
    );
  }
  if (actionTargetTypes.has(normalized.type)) {
    const target = findObservedTarget(normalized, observation);
    if (!target)
      reasons.push("Target element is not present in the current observation.");
    else {
      if (!target.visible) reasons.push("Target element is not visible.");
      if (!target.enabled) reasons.push("Target element is disabled.");
      if (
        normalized.type === "fill" ||
        normalized.type === "type" ||
        normalized.type === "clear"
      ) {
        const sensitive =
          target.type === "password" ||
          /otp|one[- ]?time|verification code/i.test(
            `${target.labelText} ${target.name}`,
          );
        if (sensitive && context.valueSource !== "human")
          reasons.push("Sensitive values must originate from human input.");
      }
      if (
        normalized.type === "check" &&
        /consent|terms|privacy|marketing|agree|authorization|legal/i.test(
          `${target.labelText} ${target.normalizedText}`,
        )
      ) {
        reasons.push(
          "Consent, terms, privacy, marketing, and legal checkboxes require human input.",
        );
      }
    }
  }
  if (
    normalized.type === "navigate" &&
    !normalized.target?.url &&
    typeof normalized.value !== "string"
  ) {
    reasons.push("Navigate requires target.url or a string value.");
  }
  if (
    ["fill", "type", "selectOption", "uploadFile", "pressKey"].includes(
      normalized.type,
    ) &&
    normalized.value === undefined
  ) {
    reasons.push(`${normalized.type} requires a value.`);
  }
  if (
    ["HIGH", "CRITICAL"].includes(normalized.riskLevel) &&
    !normalized.requiresHumanConfirmation &&
    !context.humanConfirmed
  ) {
    reasons.push("High-risk actions require explicit human confirmation.");
  }

  return { valid: reasons.length === 0, reasons, action: normalized };
};

const toLegacyAction = (action, observedTarget) => ({
  actionId: action.actionId,
  type: legacyTypeMap[action.type],
  intent: action.intent,
  target: {
    ...action.target,
    elementFingerprint:
      action.target?.elementFingerprint || observedTarget?.elementFingerprint,
    frameId: action.target?.frameId || observedTarget?.frameId,
  },
  value: action.value,
  expectedOutcome: action.expectedOutcome,
  riskLevel: action.riskLevel,
  requiresHumanConfirmation: action.requiresHumanConfirmation,
  observationRevision: action.observationRevision,
});

export const executeRegisteredAction = async (
  page,
  action,
  observation = {},
  context = {},
) => {
  const validation = validateRegisteredAction(action, observation, context);
  if (!validation.valid) {
    return {
      ok: false,
      actionId: action?.actionId,
      actionType: action?.type,
      error: validation.reasons.join("; "),
      validation,
    };
  }

  const normalized = validation.action;
  if (legacyTypeMap[normalized.type])
    return executeAction(
      page,
      toLegacyAction(normalized, findObservedTarget(normalized, observation)),
      observation,
      context,
    );

  const target = normalized.target
    ? findObservedTarget(normalized, observation)
    : null;
  const locator = target ? await resolveElement(page, target) : null;
  if (target && (!locator || locator.resolved === false)) {
    return {
      ok: false,
      actionId: normalized.actionId,
      actionType: normalized.type,
      error: `Target resolution failed: ${locator?.reason || "NOT_FOUND"}`,
    };
  }

  try {
    switch (normalized.type) {
      case "reload":
        await page.reload({ waitUntil: "domcontentloaded" });
        break;
      case "doubleClick":
        await locator.dblclick();
        break;
      case "clear":
        await locator.fill("");
        break;
      case "pressKey":
        if (locator) await locator.press(String(normalized.value));
        else await page.keyboard.press(String(normalized.value));
        break;
      case "scrollToElement":
        await locator.scrollIntoViewIfNeeded();
        break;
      case "hover":
        await locator.hover();
        break;
      case "focus":
        await locator.focus();
        break;
      case "waitForNavigation":
        await page.waitForLoadState("domcontentloaded");
        break;
      case "waitForElement":
        await locator.waitFor({ state: "visible" });
        break;
      case "switchTab":
        await context.session?.switchToPage(normalized.value);
        break;
      case "closeTab":
        await page.close();
        break;
      case "extract":
        return {
          ok: true,
          actionId: normalized.actionId,
          actionType: normalized.type,
          data: observation,
        };
      case "screenshot":
        return {
          ok: true,
          actionId: normalized.actionId,
          actionType: normalized.type,
          screenshot: await page.screenshot({ type: "png" }),
        };
      default:
        throw new Error(
          `Unregistered action implementation: ${normalized.type}`,
        );
    }
    return {
      ok: true,
      actionId: normalized.actionId,
      actionType: normalized.type,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      actionId: normalized.actionId,
      actionType: normalized.type,
      error: error.message,
    };
  }
};

export const actionRegistry = Object.freeze(
  Object.fromEntries(
    REGISTERED_ACTIONS.map((name) => [
      name,
      {
        name,
        description: `Execute ${name} against the current browser state.`,
      },
    ]),
  ),
);
