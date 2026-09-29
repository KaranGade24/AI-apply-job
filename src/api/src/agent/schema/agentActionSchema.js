import { z } from 'zod';
import {
  BROWSER_ACTIONS,
  CONTROL_DECISIONS,
  PAGE_TYPES,
  HANDOFF_METHODS,
} from '../../constant/application.constant.js';

export const agentTargetSchema = z.object({
  selector: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});

export const agentDecisionSchema = z.object({
  page: z.object({
    type: z.enum(Object.values(PAGE_TYPES)),
    confidence: z.number().min(0).max(1).default(0.5),
  }),
  decision: z.object({
    type: z.enum([
      ...Object.values(BROWSER_ACTIONS),
      ...Object.values(CONTROL_DECISIONS),
    ]),
    target: agentTargetSchema.optional(),
    value: z.string().nullable().optional(),
    method: z.enum(Object.values(HANDOFF_METHODS)).nullable().optional(),
    reason: z.string().nullable().optional(),
  }),
  reason: z.string().default('Autonomous AI decision'),
});
