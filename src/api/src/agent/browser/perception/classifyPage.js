import { PERCEPTION_PAGE_TYPES } from '../../../constant/agent.constant.js';
import { serializeForLlm } from './serializeForLlm.js';
import { buildPageClassificationPrompt } from '../../prompt/pageClassificationPrompt.js';
import { pageClassificationSchema } from '../../schema/pageClassificationSchema.js';
import { logJobEvent, logError } from '../../../utils/logger.js';

/**
 * Deterministic rule-based page classification based on URL, DOM elements, inputs, and headings.
 *
 * @param {object} observation
 * @returns {{ pageType: string, confidence: number, signals: Array<string> }}
 */
export const classifyPageDeterministic = (observation) => {
  if (!observation) {
    return {
      pageType: PERCEPTION_PAGE_TYPES.UNKNOWN,
      confidence: 0,
      signals: ['no_observation_provided'],
    };
  }

  const {
    url = '',
    title = '',
    visibleTextTrimmed = '',
    elements = [],
  } = observation;

  const lowerUrl = (url || '').toLowerCase();
  const lowerTitle = (title || '').toLowerCase();
  const lowerText = (visibleTextTrimmed || '').toLowerCase();
  const signals = [];

  // Helper to check element texts/labels
  const elementLabels = elements.map((e) => (e.label || e.text || e.name || '').toLowerCase());
  const inputTypes = elements.filter((e) => e.tag === 'input').map((e) => (e.type || '').toLowerCase());
  const buttonTexts = elements
    .filter((e) => e.tag === 'button' || e.role === 'button' || (e.tag === 'input' && e.type === 'submit'))
    .map((e) => (e.text || e.label || e.value || '').toLowerCase());

  // 1. CAPTCHA / Anti-bot / Blocked detection (HIGHEST PRIORITY - Agent must never bypass)
  const captchaKeywords = [
    'turnstile',
    'recaptcha',
    'hcaptcha',
    'cf-chl',
    'challenge-platform',
    'bot detection',
    'access denied',
    'verify you are human',
    'security check',
    'please verify',
    'just a moment...',
    'attention required! | cloudflare',
    'ddos protection',
    'unusual traffic',
  ];

  const hasCaptchaSignal =
    captchaKeywords.some((kw) => lowerUrl.includes(kw) || lowerTitle.includes(kw) || lowerText.includes(kw)) ||
    elements.some((e) => e.frameUrl && captchaKeywords.some((kw) => e.frameUrl.toLowerCase().includes(kw)));

  if (hasCaptchaSignal) {
    signals.push('detected_captcha_or_cloudflare_challenge');
    return {
      pageType: PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED,
      confidence: 0.98,
      signals,
    };
  }

  // 2. Submission Success
  const successKeywords = [
    'application submitted',
    'thank you for applying',
    'application received',
    'we have received your application',
    'submission successful',
    'application complete',
    'congratulations! your application',
    'thanks for your interest in joining',
    'your application has been sent',
    'confirmation #',
  ];

  if (successKeywords.some((kw) => lowerText.includes(kw) || lowerTitle.includes(kw))) {
    signals.push('success_banner_or_confirmation_text');
    return {
      pageType: PERCEPTION_PAGE_TYPES.SUBMISSION_SUCCESS,
      confidence: 0.96,
      signals,
    };
  }

  // 3. Error / Closed Job
  const errorKeywords = [
    '404 not found',
    'page not found',
    '500 internal server error',
    'this job is no longer available',
    'job posting has expired',
    'position has been filled',
    'application is now closed',
    'an unexpected error occurred',
  ];

  if (errorKeywords.some((kw) => lowerText.includes(kw) || lowerTitle.includes(kw))) {
    signals.push('error_or_closed_job_message');
    return {
      pageType: PERCEPTION_PAGE_TYPES.ERROR,
      confidence: 0.92,
      signals,
    };
  }

  // 4. Login vs Signup
  const hasPasswordInput = inputTypes.includes('password');
  const hasLoginKeywords =
    lowerUrl.includes('login') ||
    lowerUrl.includes('signin') ||
    lowerTitle.includes('log in') ||
    lowerTitle.includes('sign in') ||
    buttonTexts.some((b) => b.includes('log in') || b.includes('sign in') || b === 'login');

  const hasSignupKeywords =
    lowerUrl.includes('signup') ||
    lowerUrl.includes('register') ||
    lowerUrl.includes('create-account') ||
    lowerTitle.includes('sign up') ||
    lowerTitle.includes('create account') ||
    lowerTitle.includes('register') ||
    buttonTexts.some((b) => b.includes('sign up') || b.includes('create account') || b.includes('register'));

  if (hasPasswordInput) {
    if (hasSignupKeywords && !hasLoginKeywords) {
      signals.push('has_password_and_signup_text');
      return {
        pageType: PERCEPTION_PAGE_TYPES.SIGNUP,
        confidence: 0.93,
        signals,
      };
    }
    if (hasLoginKeywords) {
      signals.push('has_password_and_login_text');
      return {
        pageType: PERCEPTION_PAGE_TYPES.LOGIN,
        confidence: 0.94,
        signals,
      };
    }
  }

  // 5. Review / Summary before final submission
  const reviewKeywords = [
    'review your application',
    'please review before submitting',
    'application summary',
    'confirm application details',
    'review and submit',
    'terms & conditions',
    'by submitting this application',
  ];

  const hasSubmitButton = buttonTexts.some((b) => b.includes('submit application') || b.includes('finish') || b === 'submit');

  if (hasSubmitButton && reviewKeywords.some((kw) => lowerText.includes(kw) || lowerTitle.includes(kw))) {
    signals.push('review_summary_screen_with_submit_action');
    return {
      pageType: PERCEPTION_PAGE_TYPES.REVIEW,
      confidence: 0.89,
      signals,
    };
  }

  // 6. Resume Upload Page
  const hasFileInput = inputTypes.includes('file');
  const uploadKeywords = ['upload resume', 'attach resume', 'drop your cv', 'upload cv', 'resume/cv'];

  if (hasFileInput && uploadKeywords.some((kw) => lowerText.includes(kw) || elementLabels.some((l) => l.includes(kw)))) {
    // If predominantly asking for resume file
    if (elements.filter((e) => e.tag === 'input' && e.type !== 'hidden').length <= 4) {
      signals.push('dedicated_resume_upload_form');
      return {
        pageType: PERCEPTION_PAGE_TYPES.RESUME_UPLOAD,
        confidence: 0.90,
        signals,
      };
    }
  }

  // 7. Questionnaire / Custom Form
  const questionIndicators = [
    'sponsorship',
    'authorized to work',
    'years of experience',
    'notice period',
    'salary expectation',
    'current ctc',
    'expected ctc',
    'gender identity',
    'veteran status',
    'disability status',
    'demographic',
    'equal opportunity',
  ];

  const matchedQuestions = questionIndicators.filter((qi) => lowerText.includes(qi) || elementLabels.some((l) => l.includes(qi)));
  if (matchedQuestions.length >= 2) {
    signals.push(`custom_questions_detected: ${matchedQuestions.join(', ')}`);
    return {
      pageType: PERCEPTION_PAGE_TYPES.QUESTION_FORM,
      confidence: 0.88,
      signals,
    };
  }

  // 8. Application Form (General Contact/Profile)
  const contactFields = ['first name', 'last name', 'full name', 'email', 'phone', 'mobile', 'address', 'linkedin'];
  const matchedContact = contactFields.filter((cf) => elementLabels.some((l) => l.includes(cf)) || lowerText.includes(cf));

  if (matchedContact.length >= 2 && elements.some((e) => e.tag === 'input' || e.tag === 'textarea')) {
    signals.push(`contact_profile_form_fields: ${matchedContact.join(', ')}`);
    return {
      pageType: PERCEPTION_PAGE_TYPES.APPLICATION_FORM,
      confidence: 0.90,
      signals,
    };
  }

  // 9. Application Start / Job Detail
  const applyButtonKeywords = ['apply now', 'apply for this job', 'apply online', 'easy apply', 'start application'];
  const hasApplyButton = buttonTexts.some((b) => applyButtonKeywords.some((kw) => b.includes(kw))) ||
    elements.some((e) => e.tag === 'a' && applyButtonKeywords.some((kw) => (e.text || e.label || '').toLowerCase().includes(kw)));

  const jobDetailKeywords = ['job description', 'responsibilities', 'requirements', 'qualifications', 'about the role', 'what you will do'];
  const hasJobDetails = jobDetailKeywords.some((kw) => lowerText.includes(kw) || lowerTitle.includes(kw));

  if (hasApplyButton && hasJobDetails) {
    signals.push('job_description_with_apply_button');
    return {
      pageType: PERCEPTION_PAGE_TYPES.APPLICATION_START,
      confidence: 0.87,
      signals,
    };
  }

  if (hasJobDetails) {
    signals.push('job_description_content');
    return {
      pageType: PERCEPTION_PAGE_TYPES.JOB_DETAIL,
      confidence: 0.84,
      signals,
    };
  }

  // 10. External ATS Redirect
  const atsDomains = ['greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'smartrecruiters.com', 'ashbyhq.com', 'bamboohr.com', 'workable.com'];
  if (atsDomains.some((dom) => lowerUrl.includes(dom))) {
    signals.push('ats_portal_domain');
    return {
      pageType: PERCEPTION_PAGE_TYPES.EXTERNAL_REDIRECT,
      confidence: 0.82,
      signals,
    };
  }

  return {
    pageType: PERCEPTION_PAGE_TYPES.UNKNOWN,
    confidence: 0.4,
    signals: ['no_strong_deterministic_signals'],
  };
};

/**
 * Classifies the page using deterministic heuristics first, falling back to LLM structured output if confidence is low.
 *
 * @param {object} observation
 * @param {object} [options]
 * @param {object} [options.model] - Optional LangChain / Gemini Chat model instance
 * @returns {Promise<{ pageType: string, confidence: number, signals: Array<string>, source: string }>}
 */
export const classifyPage = async (observation, options = {}) => {
  const deterministicResult = classifyPageDeterministic(observation);

  // If confidence is high (>= 0.80) or CAPTCHA/Blocked, return immediately
  if (
    deterministicResult.confidence >= 0.80 ||
    deterministicResult.pageType === PERCEPTION_PAGE_TYPES.CAPTCHA_OR_BLOCKED
  ) {
    return {
      ...deterministicResult,
      source: 'deterministic',
    };
  }

  // If an LLM model is provided or available and confidence was low, invoke LLM fallback
  if (options.model && typeof options.model.withStructuredOutput === 'function') {
    try {
      const serialized = serializeForLlm(observation, { maxElements: 40 });
      const prompt = buildPageClassificationPrompt({
        url: observation.url,
        title: observation.title,
        serializedElements: serialized,
        textSnippet: (observation.visibleTextTrimmed || '').slice(0, 400),
      });

      const structuredModel = options.model.withStructuredOutput(pageClassificationSchema);
      const aiResponse = await structuredModel.invoke(prompt);

      if (aiResponse && aiResponse.pageType && PERCEPTION_PAGE_TYPES[aiResponse.pageType]) {
        await logJobEvent(
          'classifyPage',
          'AI_CLASSIFICATION_COMPLETED',
          `Page classified as ${aiResponse.pageType} (confidence: ${aiResponse.confidence})`
        );
        return {
          pageType: aiResponse.pageType,
          confidence: aiResponse.confidence || 0.85,
          signals: aiResponse.signals || deterministicResult.signals,
          reasoning: aiResponse.reasoning,
          source: 'llm',
        };
      }
    } catch (error) {
      await logError('classifyPage.llmFallback', error.message);
    }
  }

  // Fall back to best deterministic guess
  return {
    ...deterministicResult,
    source: 'deterministic_fallback',
  };
};

export default classifyPage;
