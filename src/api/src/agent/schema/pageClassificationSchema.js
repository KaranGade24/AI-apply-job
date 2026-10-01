import { z } from 'zod';
import { PERCEPTION_PAGE_TYPES } from '../../constant/agent.constant.js';

export const pageClassificationSchema = z.object({
  pageType: z.enum(Object.values(PERCEPTION_PAGE_TYPES)).describe('The classified category of the current web page'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0.0 and 1.0'),
  reasoning: z.string().describe('Brief rationale explaining the classification'),
  signals: z.array(z.string()).describe('Key signals and DOM clues identified on the page'),
});

export default pageClassificationSchema;
