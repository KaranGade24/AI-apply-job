import { Annotation } from '@langchain/langgraph';
import { z } from 'zod';
import { AGENT_STATUS, PERCEPTION_PAGE_TYPES } from '../../constant/agent.constant.js';

/**
 * LangGraph State Annotation defining only the minimal required execution fields.
 * Big data (raw page observations, screenshots) stays outside graph state.
 */
export const BrowserAgentStateAnnotation = Annotation.Root({
  applicationId: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => '',
  }),
  userId: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => '',
  }),
  threadId: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => '',
  }),
  currentUrl: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => '',
  }),
  pageType: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => PERCEPTION_PAGE_TYPES.UNKNOWN,
  }),
  stepCount: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => 0,
  }),
  pendingQuestions: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
  answers: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
  finalReview: Annotation({
    reducer: (x, y) => (y !== undefined ? { ...x, ...y } : x),
    default: () => ({ approved: false, hash: '', questionsAndAnswers: [] }),
  }),
  submission: Annotation({
    reducer: (x, y) => (y !== undefined ? { ...x, ...y } : x),
    default: () => ({ submitted: false, receiptId: '', timestamp: '' }),
  }),
  pendingDiffActions: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => [],
  }),
  errors: Annotation({
    reducer: (x, y) => (Array.isArray(y) ? [...(x || []), ...y] : x || []),
    default: () => [],
  }),
  status: Annotation({
    reducer: (x, y) => (y !== undefined ? y : x),
    default: () => AGENT_STATUS.STARTING,
  }),
});

/**
 * Zod validation schema for user answer submission endpoint POST /applications/:id/answers
 */
export const submitAnswersRequestSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).describe('Identifier matching pending question'),
        answer: z.any().describe('Answer value provided by human user'),
        userConfirmed: z.boolean().default(true),
      })
    )
    .min(1, 'At least one answer must be provided'),
});

/**
 * Zod validation schema for final review confirmation endpoint POST /applications/:id/confirm
 */
export const confirmReviewRequestSchema = z.object({
  approved: z.literal(true).describe('User confirmation approval flag'),
  hash: z.string().min(1).describe('Hash of reviewed questions and answers'),
  edits: z
    .array(
      z.object({
        fieldIndex: z.number().optional(),
        question: z.string().optional(),
        name: z.string().optional(),
        answer: z.any(),
      })
    )
    .optional(),
});

export default {
  BrowserAgentStateAnnotation,
  submitAnswersRequestSchema,
  confirmReviewRequestSchema,
};
