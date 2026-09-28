import { logJobEvent, logError } from '../../utils/logger.js';
import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { updateApplicationStatus } from '../../repositories/application.repository.js';
import { APPLICATION_STATUS } from '../../constant/application.constant.js';

/**
 * Generates a phone contact action plan for the phone application method.
 *
 * Since automated phone calling is not feasible, this method:
 * 1. Records the contact phone number from the job posting.
 * 2. Uses LLM to generate a professional call script / talking points.
 * 3. Suggests the best time to call and how to introduce yourself.
 * 4. Returns all the details in a human-review package for the candidate.
 *
 * @param {object} params
 * @param {string} params.applicationId
 * @param {string} params.phoneNumber - Phone number to contact
 * @param {object} params.candidateInfo - Candidate resume data
 * @param {object} params.jobDetails - Job document
 * @param {string} params.userId
 * @returns {Promise<{ phoneNumber: string, callScript: string, talkingPoints: string[], message: string }>}
 */
export const runPhoneApplication = async ({
  applicationId,
  phoneNumber,
  candidateInfo,
  jobDetails,
  userId,
}) => {
  try {
    const candidateName =
      candidateInfo?.personalInfo?.fullName || candidateInfo?.name || 'Candidate';
    const jobTitle = jobDetails?.title || 'Software Developer';
    const company = jobDetails?.company || 'Company';
    const skills = (candidateInfo?.skills || []).slice(0, 6);

    await logJobEvent(
      'phoneApplicationMethod',
      'START',
      `Generating phone call script for ${company} - ${jobTitle}`
    );

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.PROCESSING, {
        logMessage: `Preparing phone application call script for ${company} - ${jobTitle}`,
      });
    }

    const model = await getGeminiModel(userId);

    const prompt = `You are a professional career coach preparing a candidate for a phone call job application.

CANDIDATE:
- Name: ${candidateName}
- Skills: ${skills.join(', ')}
- Summary: ${candidateInfo?.summary || ''}
- Years of Experience: ${candidateInfo?.experience?.length > 0 ? '2+' : 'fresher'}

TARGET JOB:
- Title: ${jobTitle}
- Company: ${company}
- Description: ${(jobDetails?.description || '').slice(0, 1000)}
- Phone Contact: ${phoneNumber || 'Not provided'}

TASK:
Generate a professional phone call application script.

RETURN STRICT JSON ONLY:
{
  "callScript": "Full word-for-word call script starting with 'Hello, may I speak with...' and ending with 'Thank you for your time'",
  "talkingPoints": [
    "Brief intro: Name, current role, how you heard about the position",
    "Why you are interested in this specific company and role",
    "1-2 key strengths relevant to the job",
    "Availability and next steps"
  ],
  "bestTimeToCall": "Morning 9-11 AM or after lunch 2-4 PM on weekdays",
  "followUpAction": "Send email follow-up within 24 hours referencing the phone call"
}`;

    let callScript = '';
    let talkingPoints = [];
    let bestTimeToCall = 'Morning 9-11 AM on weekdays';
    let followUpAction = 'Follow up with an email within 24 hours';

    try {
      const response = await model.invoke(prompt);
      const content = (response.content || '').trim();
      const cleaned = content
        .replace(/^```json/i, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      callScript = parsed.callScript || '';
      talkingPoints = parsed.talkingPoints || [];
      bestTimeToCall = parsed.bestTimeToCall || bestTimeToCall;
      followUpAction = parsed.followUpAction || followUpAction;
    } catch (llmErr) {
      await logError('phoneApplicationMethod.llm', llmErr.message);
      // Fallback call script
      callScript = `Hello, may I speak with the HR team or the hiring manager for the ${jobTitle} position?

Hello, my name is ${candidateName}. I am calling to inquire about the ${jobTitle} opening at ${company}. I came across your job posting and I am very interested in the opportunity.

I have ${skills.length > 0 ? skills.slice(0, 3).join(', ') : 'strong technical'} skills and ${candidateInfo?.experience?.length > 0 ? 'relevant professional experience' : 'a solid academic background'} that I believe aligns well with your requirements.

I would love the opportunity to discuss how I can contribute to your team. Would it be possible to schedule an interview or should I send my resume to a specific email address?

Thank you so much for your time. I look forward to hearing from you.`;

      talkingPoints = [
        `Introduce yourself: "My name is ${candidateName} and I am calling about the ${jobTitle} position"`,
        `Express genuine interest in ${company} and explain why this role excites you`,
        `Highlight your top 2-3 skills relevant to the job`,
        `Ask about the next steps (interview, email resume, etc.)`,
      ];
    }

    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.WAITING_FOR_REVIEW, {
        logMessage: `Phone call script generated. Candidate needs to call ${phoneNumber || 'the HR team'} to apply.`,
      });
    }

    await logJobEvent(
      'phoneApplicationMethod',
      'SCRIPT_GENERATED',
      `Phone call script generated for ${company} - ${jobTitle}. Number: ${phoneNumber || 'N/A'}`
    );

    return {
      phoneNumber: phoneNumber || '',
      callScript,
      talkingPoints,
      bestTimeToCall,
      followUpAction,
      candidateName,
      jobTitle,
      company,
      message: `Phone application prepared. Call ${phoneNumber || 'the HR contact'} using the generated script.`,
    };
  } catch (error) {
    await logError('phoneApplicationMethod.runPhoneApplication', error.message);
    if (applicationId) {
      await updateApplicationStatus(applicationId, APPLICATION_STATUS.FAILED, {
        logMessage: `Phone application preparation failed: ${error.message}`,
      });
    }
    throw error;
  }
};
