import { z } from 'zod';

export const navigateSchema = z.object({
  type: z.literal('navigate'),
  url: z.string().url()
});

export const goBackSchema = z.object({
  type: z.literal('goBack')
});

export const clickSchema = z.object({
  type: z.literal('click'),
  index: z.number().int().positive()
});

export const inputSchema = z.object({
  type: z.literal('input'),
  index: z.number().int().positive(),
  text: z.string(),
  clear: z.boolean().optional()
});

export const selectOptionSchema = z.object({
  type: z.literal('selectOption'),
  index: z.number().int().positive(),
  option: z.string()
});

export const getDropdownOptionsSchema = z.object({
  type: z.literal('getDropdownOptions'),
  index: z.number().int().positive()
});

export const checkSchema = z.object({
  type: z.literal('check'),
  index: z.number().int().positive()
});

export const uncheckSchema = z.object({
  type: z.literal('uncheck'),
  index: z.number().int().positive()
});

export const uploadFileSchema = z.object({
  type: z.literal('uploadFile'),
  index: z.number().int().positive(),
  fileRef: z.string()
});

export const scrollSchema = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down', 'left', 'right']),
  pages: z.number().optional(),
  index: z.number().int().positive().optional()
});

export const sendKeysSchema = z.object({
  type: z.literal('sendKeys'),
  keys: z.string()
});

export const findTextSchema = z.object({
  type: z.literal('findText'),
  text: z.string()
});

export const searchPageSchema = z.object({
  type: z.literal('searchPage'),
  pattern: z.string()
});

export const findElementsSchema = z.object({
  type: z.literal('findElements'),
  selector: z.string(),
  attributes: z.array(z.string()).optional()
});

export const extractSchema = z.object({
  type: z.literal('extract'),
  query: z.string()
});

export const switchTabSchema = z.object({
  type: z.literal('switchTab'),
  tabId: z.string()
});

export const closeTabSchema = z.object({
  type: z.literal('closeTab'),
  tabId: z.string()
});

export const waitSchema = z.object({
  type: z.literal('wait'),
  seconds: z.number().min(1).max(10)
});

export const screenshotSchema = z.object({
  type: z.literal('screenshot')
});

export const askHumanSchema = z.object({
  type: z.literal('askHuman'),
  question: z.string(),
  fieldIndex: z.number().int().optional(),
  options: z.array(z.string()).optional(),
  reason: z.string(),
  required: z.boolean().optional()
});

export const requestReviewSchema = z.object({
  type: z.literal('requestReview')
});

export const finishSchema = z.object({
  type: z.literal('finish'),
  success: z.boolean(),
  summary: z.string()
});

export const browserActionSchema = z.discriminatedUnion('type', [
  navigateSchema,
  goBackSchema,
  clickSchema,
  inputSchema,
  selectOptionSchema,
  getDropdownOptionsSchema,
  checkSchema,
  uncheckSchema,
  uploadFileSchema,
  scrollSchema,
  sendKeysSchema,
  findTextSchema,
  searchPageSchema,
  findElementsSchema,
  extractSchema,
  switchTabSchema,
  closeTabSchema,
  waitSchema,
  screenshotSchema,
  askHumanSchema,
  requestReviewSchema,
  finishSchema
]);

export const agentResponseSchema = z.object({
  evaluationPreviousGoal: z.string(),
  memory: z.string(),
  nextGoal: z.string(),
  planUpdate: z.array(z.string()).optional(),
  currentPlanItem: z.string().optional(),
  actions: z.array(browserActionSchema).min(1).max(5)
});

export default {
  browserActionSchema,
  agentResponseSchema
};
