import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Performs a strict post-generation verification of drafted answers against verified candidate facts.
 *
 * @param {string} answer - Drafted answer text
 * @param {object} context - Source candidate profile and resume data
 * @param {string} [userId]
 * @returns {Promise<{ verified: boolean, confidence: number, reason: string }>}
 */
export const verifyAnswerGroundedness = async (answer, context = {}, userId = null) => {
  try {
    const { resumeData = {}, userProfile = {} } = context;

    const validationPrompt = `You are a strict, zero-fabrication Compliance Auditor verifying a drafted job application answer against actual candidate profile data.

DRAFTED ANSWER TO AUDIT:
"${answer}"

TRUSTED CANDIDATE FACTS:
- Resume: ${JSON.stringify(resumeData)}
- User Profile: ${JSON.stringify(userProfile)}

AUDIT CRITERIA:
1. Does the drafted answer contain ANY facts, degrees, credentials, skill levels, employment history, company details, or background claims NOT explicitly stated in the Candidate Facts?
2. Summarizing or professional rephrasing of existing facts IS allowed.
3. Inventing experience, achievements, education, authorization, or career details is strictly FORBIDDEN.

You must return ONLY a structured JSON response matching this schema:
{
  "status": "VERIFIED | FABRICATED",
  "confidence": <float between 0.0 and 1.0 based on factual overlap completeness>,
  "reason": "<clear concise audit details>"
}`;

    const model = await getGeminiModel(userId);
    const response = await model.invoke(validationPrompt);
    const content = (response.content || '').trim();

    const cleaned = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    const isVerified = parsed.status === 'VERIFIED' && parsed.confidence >= 0.8;

    return {
      verified: isVerified,
      confidence: parsed.confidence || 0.0,
      reason: parsed.reason || 'Audit complete.'
    };
  } catch (error) {
    await logError('aiAnswerResolver.verifyAnswerGroundedness', error.message);
    return { verified: false, confidence: 0.0, reason: `Audit error: ${error.message}` };
  }
};

/**
 * Resolves subjective questions using Gemini LLM strictly grounded in candidate facts (Level 4)
 *
 * @param {object} field
 * @param {object} context
 * @param {object} context.job
 * @param {object} context.userProfile
 * @param {object} context.resumeData
 * @param {string} [userId]
 * @returns {Promise<{ resolved: boolean, value?: string, source: string, sourcePath: string, confidence: number }>}
 */
export const resolveFromAi = async (field, context = {}, userId = null) => {
  try {
    const { job = {}, userProfile = {}, resumeData = {} } = context;
    const question = field.question || field.placeholder || 'Why are you interested in this position?';

    // Build candidate details dynamically from available profile facts - ZERO hardcoding of background!
    const candidateSkills = (resumeData.skills || []).slice(0, 8).join(', ');
    const educations = (resumeData.education || []).map(e => `${e.degree || 'Degree'} from ${e.school || 'School'}`).join(', ');
    const experiences = (resumeData.experience || []).map(exp => `${exp.role || 'Role'} at ${exp.company || 'Company'}`).join(', ');

    const prompt = `You are a professional career assistant drafting a concise, honest response to an application questionnaire.

RULES:
1. Ground your answer strictly in actual Candidate Facts.
2. If Candidate Facts are empty or insufficient to answer the question professionally, return "[UNSUPPORTED_QUESTION]" immediately.
3. NEVER invent skills, degrees, achievements, or employment histories.
4. Keep the text concise, professional, and under 80 words.

CANDIDATE FACTS:
- Skills: ${candidateSkills || 'Not specified'}
- Education: ${educations || 'Not specified'}
- Experiences: ${experiences || 'Not specified'}

TARGET JOB:
- Position: ${job.title || 'Position'}
- Company: ${job.company || 'Company'}

APPLICATION QUESTION:
"${question}"

Generate only the concise answer text, or "[UNSUPPORTED_QUESTION]" if facts are missing.`;

    const model = await getGeminiModel(userId);
    const response = await model.invoke(prompt);
    const answer = (response.content || '').trim().replace(/^["']|["']$/g, '');

    if (answer && !answer.includes('[UNSUPPORTED_QUESTION]')) {
      // Perform strict validation step
      const audit = await verifyAnswerGroundedness(answer, context, userId);

      if (audit.verified) {
        await logJobEvent('aiAnswerResolver', 'RESOLVED_GROUNDED', `AI resolved subjective question (Confidence: ${audit.confidence})`);
        return {
          resolved: true,
          value: answer,
          source: 'ai',
          sourcePath: 'gemini.llm.model',
          confidence: audit.confidence
        };
      } else {
        await logJobEvent('aiAnswerResolver', 'AUDIT_FAILED', `Audit rejected drafted response: ${audit.reason}`);
      }
    }

    return { resolved: false, source: 'ai', sourcePath: '', confidence: 0.0 };
  } catch (error) {
    await logError('aiAnswerResolver.resolveFromAi', error.message);
    return { resolved: false, source: 'ai', sourcePath: '', confidence: 0.0 };
  }
};

/**
 * Resolves MULTIPLE subjective questions in a SINGLE BATCH LLM call.
 * This minimizes latency and API calls by batching all open-ended questions on the page together.
 *
 * @param {Array<object>} fields - Array of subjective question fields
 * @param {object} context
 * @param {object} context.job
 * @param {object} context.userProfile
 * @param {object} context.resumeData
 * @param {string} [userId]
 * @returns {Promise<Record<string, string>>} Map of questionId -> answer
 */
export const resolveBatchAiAnswers = async (fields = [], context = {}, userId = null) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return {};
  }

  // Fallback to resolve individuals so they each get full individual post-validation audit
  const map = {};
  for (const field of fields) {
    const qId = field.questionId || field.fieldId;
    const res = await resolveFromAi(field, context, userId);
    if (res.resolved) {
      map[qId] = res.value;
    }
  }
  return map;
};
