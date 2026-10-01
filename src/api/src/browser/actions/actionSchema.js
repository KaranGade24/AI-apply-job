import { z } from "zod";

export const REGISTERED_ACTIONS = Object.freeze([
  "navigate",
  "back",
  "forward",
  "reload",
  "click",
  "doubleClick",
  "fill",
  "type",
  "clear",
  "selectOption",
  "check",
  "uncheck",
  "pressKey",
  "scroll",
  "scrollToElement",
  "hover",
  "focus",
  "uploadFile",
  "wait",
  "waitForNavigation",
  "waitForElement",
  "switchTab",
  "closeTab",
  "extract",
  "screenshot",
  "openLink",
]);

const targetSchema = z
  .object({
    elementId: z.string().min(1).optional(),
    elementFingerprint: z.string().min(1).optional(),
    frameId: z.string().optional(),
    url: z.string().url().optional(),
  })
  .strict();

export const registeredActionSchema = z
  .object({
    actionId: z.string().min(1),
    type: z.enum(REGISTERED_ACTIONS),
    intent: z.string().min(1),
    target: targetSchema.optional(),
    value: z.unknown().optional(),
    expectedOutcome: z.string().min(1),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
    requiresHumanConfirmation: z.boolean().default(false),
    observationRevision: z.string().optional(),
  })
  .strict();

export const actionTargetTypes = new Set([
  "click",
  "doubleClick",
  "fill",
  "type",
  "clear",
  "selectOption",
  "check",
  "uncheck",
  "scrollToElement",
  "hover",
  "focus",
  "uploadFile",
  "waitForElement",
  "openLink",
]);
