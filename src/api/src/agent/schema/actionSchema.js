import { z } from 'zod';

export const navigateActionSchema = z.object({
  type: z.literal('navigate'),
  url: z.string().describe('Target web URL to navigate to (must be HTTP/HTTPS)'),
});

export const clickActionSchema = z.object({
  type: z.literal('click'),
  index: z.number().int().min(0).describe('Numeric index of the element to click'),
});

export const fillActionSchema = z.object({
  type: z.literal('fill'),
  index: z.number().int().min(0).describe('Numeric index of the input/textarea element to fill'),
  value: z.string().describe('Text or data value to fill into the field'),
  source: z.enum(['profile', 'resume', 'user', 'human', 'ai', 'setting']).default('ai').describe('Provenance source of the filled value'),
});

export const selectActionSchema = z.object({
  type: z.literal('select'),
  index: z.number().int().min(0).describe('Numeric index of the select dropdown element'),
  option: z.string().describe('Option value or visible text to select'),
});

export const checkActionSchema = z.object({
  type: z.literal('check'),
  index: z.number().int().min(0).describe('Numeric index of the checkbox or radio element to check'),
});

export const uncheckActionSchema = z.object({
  type: z.literal('uncheck'),
  index: z.number().int().min(0).describe('Numeric index of the checkbox element to uncheck'),
});

export const uploadFileActionSchema = z.object({
  type: z.literal('uploadFile'),
  index: z.number().int().min(0).describe('Numeric index of the file input element'),
  fileRef: z.string().describe('File path or reference to upload (e.g. tailored resume PDF)'),
});

export const scrollActionSchema = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down', 'left', 'right']).default('down').describe('Direction to scroll the page'),
  amount: z.number().optional().describe('Scroll distance in pixels (defaults to viewport height)'),
});

export const pressKeyActionSchema = z.object({
  type: z.literal('pressKey'),
  key: z.string().describe('Key name to press (e.g. Enter, Tab, Escape, ArrowDown)'),
});

export const waitForActionSchema = z.object({
  type: z.literal('waitFor'),
  ms: z.number().int().min(0).max(30000).optional().describe('Milliseconds to pause execution'),
  condition: z.string().optional().describe('Condition to wait for (e.g. navigation, networkidle)'),
});

export const extractActionSchema = z.object({
  type: z.literal('extract'),
  goal: z.string().describe('Information extraction goal from the current page state'),
});

export const askHumanActionSchema = z.object({
  type: z.literal('askHuman'),
  questionId: z.string().describe('Unique identifier for this questionnaire question'),
  question: z.string().describe('Question text to present to the user'),
  fieldIndex: z.number().int().optional().describe('Associated element index on the page'),
  options: z.array(z.string()).optional().describe('List of selectable options for multiple choice questions'),
  reason: z.string().describe('Reason human intervention is needed (missing info, captcha, 2fa, terms)'),
  required: z.boolean().default(true).describe('Whether user answer is mandatory to proceed'),
});

export const requestReviewActionSchema = z.object({
  type: z.literal('requestReview'),
});

export const submitApplicationActionSchema = z.object({
  type: z.literal('submitApplication'),
});

export const finishActionSchema = z.object({
  type: z.literal('finish'),
  summary: z.string().describe('Summary of the completed job application workflow'),
});

export const failActionSchema = z.object({
  type: z.literal('fail'),
  reason: z.string().describe('Reason the application process failed or was blocked'),
});

/**
 * Discriminated union of all supported structured browser actions.
 */
export const actionSchema = z.discriminatedUnion('type', [
  navigateActionSchema,
  clickActionSchema,
  fillActionSchema,
  selectActionSchema,
  checkActionSchema,
  uncheckActionSchema,
  uploadFileActionSchema,
  scrollActionSchema,
  pressKeyActionSchema,
  waitForActionSchema,
  extractActionSchema,
  askHumanActionSchema,
  requestReviewActionSchema,
  submitApplicationActionSchema,
  finishActionSchema,
  failActionSchema,
]);

/**
 * Agent step output schema defining the LLM decision contract per step.
 */
export const agentStepOutputSchema = z.object({
  evaluationOfPreviousAction: z.string().describe('Brief assessment of the outcome of the previous action'),
  memory: z.string().describe('Current working memory summary of the application progress and context'),
  nextGoal: z.string().describe('Immediate goal for the current step'),
  actions: z.array(actionSchema).min(1).max(3).describe('1 to 3 structured actions to execute sequentially in this step'),
});

export default actionSchema;
