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
