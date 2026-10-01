import { z } from 'zod';
import { BROWSER_ACTIONS } from '../../constant/application.constant.js';

export const browserActionItemSchema = z.object({
  actionId: z.string().optional().default(() => `act_${Date.now()}_${Math.random().toString(36).substring(7)}`),
  type: z.string().min(1, 'type is required'),
  intent: z.string().optional().default('Populate application field'),
  
  target: z.any().optional(),

  value: z.any().nullable().optional(),
  
  expectedOutcome: z.string().optional().default('Field populated'),
  
  riskLevel: z.string().optional().default('LOW'),
  
  requiresHumanConfirmation: z.boolean().default(false),
  
  observationRevision: z.string().nullable().optional(),
  fieldId: z.string().optional(),
  action: z.string().optional(),
}).passthrough(); // Allow extra or legacy properties without throwing schema validation errors

export const browserActionPlanSchema = z.object({
  actions: z.array(browserActionItemSchema),
}).passthrough();
