import { z } from 'zod';
import { FORM_ACTIONS } from '../../constant/application.constant.js';

export const browserActionItemSchema = z.object({
  fieldId: z.string().min(1, 'fieldId is required'),
  action: z.enum(Object.values(FORM_ACTIONS)),
  value: z.any().optional(),
});

export const browserActionPlanSchema = z.object({
  actions: z.array(browserActionItemSchema),
});
