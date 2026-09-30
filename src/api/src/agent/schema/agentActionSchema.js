import { z } from 'zod';
import {
  BROWSER_ACTIONS,
  CONTROL_DECISIONS,
  PAGE_TYPES,
  HANDOFF_METHODS,
} from '../../constant/application.constant.js';

export const agentTargetSchema = z.object({
  elementId: z.string().nullable().optional(),
  elementFingerprint: z.string().nullable().optional(),
  frameId: z.string().nullable().optional(),
  selector: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
}).strict();

export const agentDecisionSchema = z.object({
  page: z.object({
    type: z.enum(Object.values(PAGE_TYPES)),
    confidence: z.number().min(0).max(1).default(0.5),
  }).strict(),
  
  decision: z.object({
    actionId: z.string().min(1, 'actionId is required'),
    type: z.enum([
      ...Object.values(BROWSER_ACTIONS),
      ...Object.values(CONTROL_DECISIONS),
    ]),
    intent: z.string().min(1, 'intent is required'),
    target: agentTargetSchema.optional(),
    value: z.string().nullable().optional(),
    method: z.enum(Object.values(HANDOFF_METHODS)).nullable().optional(),
    expectedOutcome: z.string().min(1, 'expectedOutcome is mandatory for decisions'),
    riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('LOW'),
    requiresHumanConfirmation: z.boolean().default(false),
    observationRevision: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  }).strict(),
  
  reason: z.string().default('Autonomous AI decision'),
}).strict();
