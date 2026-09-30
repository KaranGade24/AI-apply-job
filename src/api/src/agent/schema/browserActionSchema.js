import { z } from 'zod';
import { BROWSER_ACTIONS } from '../../constant/application.constant.js';

export const browserActionItemSchema = z.object({
  actionId: z.string().min(1, 'actionId is required'),
  type: z.enum(Object.values(BROWSER_ACTIONS)),
  intent: z.string().min(1, 'intent is required'),
  
  target: z.object({
    elementId: z.string().nullable().optional(),
    elementFingerprint: z.string().nullable().optional(),
    frameId: z.string().nullable().optional(),
    selector: z.string().nullable().optional(),
    text: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
  }).optional(),

  value: z.any().nullable().optional(),
  
  expectedOutcome: z.string().min(1, 'expectedOutcome is mandatory for non-passive browser actions'),
  
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  
  requiresHumanConfirmation: z.boolean().default(false),
  
  observationRevision: z.string().nullable().optional()
}).strict(); // Force strict schema validation to prevent LLM hallucinating unknown/unsupported fields

export const browserActionPlanSchema = z.object({
  actions: z.array(browserActionItemSchema),
}).strict();
