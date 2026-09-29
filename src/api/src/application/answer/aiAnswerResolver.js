import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { logJobEvent, logError } from '../../utils/logger.js';

/**
 * Resolves subjective questions using Gemini LLM strictly grounded in candidate facts (Level 4)
 * @param {object} field
 * @param {object} context
 * @param {object} context.job
 * @param {object} context.userProfile
 * @param {object} context.resumeData
 * @returns {Promise<{ resolved: boolean, value?: string, source: string, confidence: number }>}
 */
export const resolveFromAi = async (field, context = {}) => {
  try {
    const { job = {}, userProfile = {}, resumeData = {} } = context;
    const question = field.question || field.placeholder || 'Why are you interested in this position?';

    const candidateSkills = (resumeData.skills || []).slice(0, 6).join(', ') || 'Software Development';
    const candidateProjects = (resumeData.projects || []).slice(0, 2).map((p) => p.title || p.name).join(', ');
    const targetJobTitle = job.title || 'Software Developer';
    const targetCompany = job.company || 'Company';

    const prompt = `You are a career assistant helping a job candidate draft a concise, honest, and impactful answer to an application questionnaire field.

RULES:
1. Ground your answer ONLY in the provided candidate facts. NEVER invent or hallucinate unverified skills, degrees, or experience years.
2. Keep the answer professional, direct, and under 80 words.
3. No buzzwords, fluff, or placeholder text.

CANDIDATE FACTS:
- Skills: ${candidateSkills}
- Key Projects: ${candidateProjects || 'Full-stack applications'}
- Background: Engineering graduate / developer

TARGET JOB:
- Position: ${targetJobTitle}
- Company: ${targetCompany}
- Requirements: ${(job.requirements || []).slice(0, 3).join(', ') || 'Relevant software engineering skills'}

APPLICATION QUESTION:
"${question}"

Generate only the concise answer text, nothing else.`;

    const model = getGeminiModel({ temperature: 0.2 });
    const response = await model.invoke(prompt);
    const answer = (response.content || '').trim().replace(/^["']|["']$/g, '');

    if (answer) {
      await logJobEvent('aiAnswerResolver', 'RESOLVED', `AI resolved subjective question: "${question.slice(0, 30)}..."`);
      return {
        resolved: true,
        value: answer,
        source: 'ai',
        confidence: 0.92,
      };
    }

    return { resolved: false, source: 'ai', confidence: 0 };
  } catch (error) {
    await logError('aiAnswerResolver.resolveFromAi', error.message);
    return { resolved: false, source: 'ai', confidence: 0 };
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
 * @returns {Promise<Record<string, string>>} Map of questionId -> answer
 */
export const resolveBatchAiAnswers = async (fields = [], context = {}) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return {};
  }

  // If only 1 question, use resolveFromAi directly
  if (fields.length === 1) {
    const field = fields[0];
    const qId = field.questionId || field.fieldId;
    const res = await resolveFromAi(field, context);
    return res.resolved ? { [qId]: res.value } : {};
  }

  try {
    const { job = {}, userProfile = {}, resumeData = {} } = context;

    const candidateSkills = (resumeData.skills || []).slice(0, 8).join(', ') || 'Software Development';
    const candidateProjects = (resumeData.projects || []).slice(0, 3).map((p) => p.title || p.name).join(', ');
    const targetJobTitle = job.title || 'Software Developer';
    const targetCompany = job.company || 'Company';

    const questionsList = fields
      .map((f, idx) => {
        const qId = f.questionId || f.fieldId || `q_${idx}`;
        const qText = f.question || f.placeholder || `Question ${idx + 1}`;
        return `ID: "${qId}"\nQUESTION: "${qText}"`;
      })
      .join('\n---\n');

    const prompt = `You are a professional career assistant drafting concise, honest, and impactful answers to an application questionnaire.

RULES:
1. Ground every answer ONLY in the provided candidate facts. NEVER hallucinate unverified skills, degrees, or experience.
2. Keep each answer professional, direct, and under 80 words.
3. No buzzwords, fluff, or placeholder text.
4. Output MUST be valid JSON mapping each question ID to its answer string.
Example:
{
  "question_id_1": "Answer text here...",
  "question_id_2": "Answer text here..."
}

CANDIDATE FACTS:
- Skills: ${candidateSkills}
- Key Projects: ${candidateProjects || 'Full-stack applications'}
- Background: Engineering graduate / developer

TARGET JOB:
- Position: ${targetJobTitle}
- Company: ${targetCompany}
- Requirements: ${(job.requirements || []).slice(0, 3).join(', ') || 'Relevant software engineering skills'}

QUESTIONS TO ANSWER:
${questionsList}

Return ONLY the JSON object, with no markdown code fences or conversational text.`;

    const model = getGeminiModel({ temperature: 0.2 });
    const response = await model.invoke(prompt);
    let rawContent = (response.content || '').trim();

    // Strip markdown code fences if present
    if (rawContent.startsWith('```')) {
      rawContent = rawContent.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    const answersMap = JSON.parse(rawContent);

    await logJobEvent(
      'aiAnswerResolver',
      'BATCH_RESOLVED',
      `Single LLM batch call resolved ${Object.keys(answersMap).length}/${fields.length} subjective questions.`
    );

    return answersMap;
  } catch (error) {
    await logError('aiAnswerResolver.resolveBatchAiAnswers', `Batch AI failed: ${error.message}. Falling back.`);
    
    // Fallback: resolve individually if JSON parse or batch call failed
    const fallbackMap = {};
    for (const field of fields) {
      const qId = field.questionId || field.fieldId;
      const res = await resolveFromAi(field, context);
      if (res.resolved) {
        fallbackMap[qId] = res.value;
      }
    }
    return fallbackMap;
  }
};
