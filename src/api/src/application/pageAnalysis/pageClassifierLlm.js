import { getGeminiModel } from '../../agent/config/modelConfig.js';
import { logJobEvent, logError } from '../../utils/logger.js';

// Explicit application page states
export const PAGE_STATES = {
  JOB_PAGE: 'JOB_PAGE',
  JOB_LISTING_PAGE: 'JOB_LISTING_PAGE',
  APPLICATION_ENTRY: 'APPLICATION_ENTRY',
  APPLICATION_FORM: 'APPLICATION_FORM',
  FORM_STEP: 'FORM_STEP',
  REVIEW: 'REVIEW',
  LOGIN_REQUIRED: 'LOGIN_REQUIRED',
  OTP_REQUIRED: 'OTP_REQUIRED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Stage 1 AI Classifier: Analyzes normalized state to classify exactly which page/state the browser is on.
 * Strictly answers: "What page/state is this?".
 * Does NOT formulate actions or next steps.
 *
 * @param {object} normalizedState
 * @param {string} [userId]
 * @param {string} [screenshotBase64]
 * @returns {Promise<{ state: string, confidence: number, hasStepper: boolean, currentStep: number, totalSteps: number, activeStepName: string, isFormClosed: boolean, reason: string }>}
 */
export const classifyPageStateLlm = async (normalizedState, userId = null, screenshotBase64 = null) => {
  try {
    const prompt = `You are a Stage 1 Semantic Browser State Classifier.
Analyze the following normalized browser state and determine which EXPLICIT PAGE STATE best matches this page.
${screenshotBase64 ? 'Inspect the attached visual screenshot of the page to verify layout, headings, buttons, and state indicators with high precision.' : ''}

EXPLICIT PAGE STATES:
- "JOB_PAGE": A page dedicated to ONE specific job posting/description.
- "JOB_LISTING_PAGE": A career portal listing MULTIPLE job titles, usually with search/filter bars and multiple "Apply" or "View" buttons.
- "APPLICATION_ENTRY": The entry gateway or landing page of an application (e.g. contains "Apply Now", "Apply Manually", "Autofill with Resume" buttons).
- "APPLICATION_FORM": A single-page job application form containing text inputs, textareas, file uploads, etc.
- "FORM_STEP": One specific page/step of a multi-step wizard form (e.g. contact info, questions, resume upload).
- "REVIEW": A summary or review page of the form fields filled so far before hitting submit.
- "LOGIN_REQUIRED": A user credentials form, username/password fields, or sign-in buttons blocking entry.
- "OTP_REQUIRED": One-Time Pin / Code entry form fields.
- "MFA_REQUIRED": Multi-Factor Authentication gate screen (security questions, code app verification).
- "CAPTCHA_REQUIRED": Active CAPTCHA challenges, bot protection grids, or click-shields.
- "SUCCESS": An explicit submission confirmation page (Level 2, 3, or 4 success markers like thank you message, receipt, or submission confirmation).
- "ERROR": The page indicates a fatal or operational error (e.g. 404, 500, "Job No Longer Available").
- "UNKNOWN": Cannot be identified from active indicators.

NORMALIZED STATE BLUEPRINT:
- URL: ${normalizedState.url}
- Title: "${normalizedState.title}"
- Headings: ${JSON.stringify(normalizedState.headings || [])}
- Forms Present: ${JSON.stringify(normalizedState.forms || [])}
- Openings Detected: ${normalizedState.openingsCount || 0}
- Active Modal: ${JSON.stringify(normalizedState.modal || { isOpen: false })}
- Stepper: ${JSON.stringify(normalizedState.stepper || { hasStepper: false })}
- Validation Errors Visible: ${JSON.stringify(normalizedState.validationErrors || [])}
- Loading: ${JSON.stringify(normalizedState.loading || { isLoading: false })}
- Success Evidence: ${JSON.stringify(normalizedState.successEvidence || { level: 0 })}
- Is Form Closed: ${normalizedState.isFormClosed ? 'YES' : 'NO'}
- Text Snippet:
"""
${(normalizedState.textSnippet || '').slice(0, 2000)}
"""

RETURN STRICT JSON ONLY MATCHING THE FOLLOWING SCHEMA. Do NOT include markdown blocks, notes, or explanations outside the JSON block.

{
  "state": "JOB_PAGE | JOB_LISTING_PAGE | APPLICATION_ENTRY | APPLICATION_FORM | FORM_STEP | REVIEW | LOGIN_REQUIRED | OTP_REQUIRED | MFA_REQUIRED | CAPTCHA_REQUIRED | SUCCESS | ERROR | UNKNOWN",
  "confidence": <float between 0.0 and 1.0>,
  "shouldContinueDeepDive": <boolean: true if autonomous agent should continue navigating deeper to reach/complete application, false if already at form, in terminal state, or requires human>,
  "isTerminalState": <boolean: true if application is completed, blocked, closed, or requires human intervention>,
  "nextAction": {
    "type": "NAVIGATE_TO_ROLE | CLICK_APPLY | FILL_FORM | NEXT_STEP | SUBMIT_FORM | REQUIRE_HUMAN | FINISH",
    "reason": "<explanation of action>"
  },
  "hasStepper": <boolean>,
  "currentStep": <number>,
  "totalSteps": <number>,
  "activeStepName": "<string>",
  "isFormClosed": <boolean>,
  "reason": "<clear semantic reasoning of your state selection and depth decision>"
}`;


    const model = await getGeminiModel(userId);
    const userContent = screenshotBase64
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: `data:image/png;base64,${screenshotBase64}` },
        ]
      : prompt;

    const response = await model.invoke(userContent);
    const content = (response.content || '').trim();

    const cleaned = content.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    const mappedState = PAGE_STATES[parsed.state] ? parsed.state : PAGE_STATES.UNKNOWN;
    const isTerminal = parsed.isTerminalState ?? (mappedState === PAGE_STATES.SUCCESS || mappedState === PAGE_STATES.LOGIN_REQUIRED || mappedState === PAGE_STATES.CAPTCHA_REQUIRED || parsed.isFormClosed);
    const shouldContinue = parsed.shouldContinueDeepDive ?? (!isTerminal && mappedState !== PAGE_STATES.APPLICATION_FORM && mappedState !== PAGE_STATES.REVIEW);

    await logJobEvent(
      'pageClassifierLlm',
      'STATE_CLASSIFIED',
      `State: ${mappedState} | Should Continue: ${shouldContinue} | Terminal: ${isTerminal} | Next: ${parsed.nextAction?.type || 'N/A'}`
    );

    return {
      state: mappedState,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
      shouldContinueDeepDive: Boolean(shouldContinue),
      isTerminalState: Boolean(isTerminal),
      nextAction: parsed.nextAction || { type: 'ANALYZE_FURTHER', reason: parsed.reason || '' },
      hasStepper: Boolean(parsed.hasStepper || normalizedState.stepper?.hasStepper),
      currentStep: parsed.currentStep || normalizedState.stepper?.currentStep || 1,
      totalSteps: parsed.totalSteps || normalizedState.stepper?.totalSteps || 1,
      activeStepName: parsed.activeStepName || normalizedState.stepper?.activeStepName || '',
      isFormClosed: parsed.isFormClosed !== undefined ? parsed.isFormClosed : normalizedState.isFormClosed,
      reason: parsed.reason || 'AI Page State classification.'
    };

  } catch (error) {
    await logError('pageClassifierLlm.classifyPageStateLlm', error.message);
    const { sanitizeAiErrorMessage } = await import('../../utils/errors.js');
    const cleanError = sanitizeAiErrorMessage(error.message);
    return {
      state: PAGE_STATES.UNKNOWN,
      confidence: 0.0,
      hasStepper: false,
      currentStep: 1,
      totalSteps: 1,
      activeStepName: '',
      isFormClosed: false,
      reason: cleanError
    };
  }
};

/**
 * Backward-compatible page classifier wrapper.
 * Integrates internal classifyPageStateLlm to preserve compatibility across legacy systems (e.g., Naukri scripts).
 *
 * @param {object} extractedPageContent - Output from pageContentExtractor
 * @param {object} job - Target Job details
 * @param {string} [userId]
 * @param {string} [screenshotBase64] - Viewport screenshot for visual classification
 * @returns {Promise<object>} Legacy formatted classification details
 */
export const classifyPageWithLlm = async (extractedPageContent, job = {}, userId = null, screenshotBase64 = null) => {
  const normalized = {
    url: extractedPageContent.url || '',
    title: extractedPageContent.title || '',
    headings: extractedPageContent.headings || [],
    forms: extractedPageContent.formSections || [],
    formFieldsCount: extractedPageContent.formFieldsCount || 0,
    fileInputsCount: extractedPageContent.fileInputsCount || 0,
    modal: {
      isOpen: extractedPageContent.modalState?.isOpen || false,
      title: extractedPageContent.modalState?.title || '',
      inputCount: extractedPageContent.modalState?.inputCount || 0
    },
    stepper: {
      hasStepper: extractedPageContent.stepperState?.hasStepper || false,
      currentStep: extractedPageContent.stepperState?.currentStep || 1,
      totalSteps: extractedPageContent.stepperState?.totalSteps || 1,
      activeStepName: extractedPageContent.stepperState?.activeStepName || ''
    },
    validationErrors: extractedPageContent.validationErrors || [],
    loading: extractedPageContent.loadingState || { isLoading: false },
    successEvidence: extractedPageContent.successEvidence || { level: 0 },
    isFormClosed: extractedPageContent.isFormClosed || false,
    textSnippet: extractedPageContent.textSnippet || ''
  };

  const pageStateResult = await classifyPageStateLlm(normalized, userId, screenshotBase64);

  // Map explicit states back to raw legacy strings
  let legacyPageType = 'external_ats';
  let legacyNextRecommendedAction = 'fill_form';

  switch (pageStateResult.state) {
    case PAGE_STATES.JOB_PAGE:
      legacyPageType = 'job_description_page';
      legacyNextRecommendedAction = 'click_opening_apply';
      break;
    case PAGE_STATES.JOB_LISTING_PAGE:
      legacyPageType = 'job_listing_page';
      legacyNextRecommendedAction = 'select_job_from_list';
      break;
    case PAGE_STATES.APPLICATION_ENTRY: {
      const isAlreadyInApplyFunnel =
        (normalized.url || '').toLowerCase().includes('/apply') ||
        (normalized.url || '').toLowerCase().includes('autofill') ||
        normalized.fileInputsCount > 0 ||
        normalized.formFieldsCount > 0;
      if (isAlreadyInApplyFunnel) {
        legacyPageType = 'application_form';
        legacyNextRecommendedAction = 'fill_form';
      } else {
        legacyPageType = 'external_ats';
        legacyNextRecommendedAction = 'click_opening_apply';
      }
      break;
    }
    case PAGE_STATES.APPLICATION_FORM:
    case PAGE_STATES.FORM_STEP:
      legacyPageType = 'application_form';
      legacyNextRecommendedAction = 'fill_form';
      break;
    case PAGE_STATES.REVIEW:
      legacyPageType = 'application_form';
      legacyNextRecommendedAction = 'fill_form';
      break;
    case PAGE_STATES.LOGIN_REQUIRED:
      legacyPageType = 'ats_account_gateway';
      legacyNextRecommendedAction = 'human_review';
      break;
    case PAGE_STATES.SUCCESS:
      legacyPageType = 'external_ats';
      legacyNextRecommendedAction = 'human_review';
      break;
    default:
      legacyPageType = 'external_ats';
      legacyNextRecommendedAction = 'fill_form';
      break;
  }

  if (pageStateResult.isFormClosed) {
    legacyPageType = 'form_closed';
    legacyNextRecommendedAction = 'form_closed_fallback_email';
  }

  // 1. Fetch Candidate Profile, Resume & Settings to identify candidate domain (ML, Full Stack, DevOps, etc.)
  let candidateSkills = [];
  let candidateHeadline = '';
  let candidateExperience = '';
  let candidateDomain = 'Full Stack Developer';

  try {
    const { UserProfile } = await import('../../model/UserProfile.js');
    const { Resume } = await import('../../model/Resume.js');
    const { Setting } = await import('../../model/Setting.js');
    const userProfile = userId ? await UserProfile.findOne({ userId }).lean().catch(() => null) : null;
    const resumeDoc = userId ? await Resume.findOne({ userId }).sort({ createdAt: -1 }).lean().catch(() => null) : null;
    const settingDoc = userId ? await Setting.findOne({ userId }).lean().catch(() => null) : null;

    const profileSkills = Array.isArray(userProfile?.skills) ? userProfile.skills : [];
    const resumeSkills = Array.isArray(resumeDoc?.parsedData?.skills) ? resumeDoc.parsedData.skills : [];
    const settingKeywords = Array.isArray(settingDoc?.jobSetting?.keywords) ? settingDoc.jobSetting.keywords : [];
    candidateSkills = Array.from(new Set([...profileSkills, ...resumeSkills, ...settingKeywords]));

    candidateHeadline = 
      userProfile?.headline || 
      userProfile?.personal?.headline || 
      resumeDoc?.parsedData?.headline || 
      resumeDoc?.parsedData?.title || 
      settingDoc?.userSetting?.headline || 
      '';

    candidateExperience = 
      resumeDoc?.parsedData?.summary || 
      (Array.isArray(userProfile?.experience) ? userProfile.experience.map(e => e.title || e.role).join(' ') : '') || 
      '';

    const fullProfileStr = `${candidateSkills.join(', ')} ${candidateHeadline} ${candidateExperience}`.toLowerCase();
    
    if (/machine learning|pytorch|tensorflow|python|nlp|deep learning|llm|ai|data science|computer vision|scikit/i.test(fullProfileStr)) {
      candidateDomain = 'Machine Learning & AI';
    } else if (/full\s*stack|mern|mean|react|node|javascript|typescript|next\.?js|express|mongodb|web developer/i.test(fullProfileStr)) {
      candidateDomain = 'Full Stack Developer (MERN)';
    } else if (/devops|aws|docker|kubernetes|ci\/cd|cloud|terraform|ansible|sre|linux/i.test(fullProfileStr)) {
      candidateDomain = 'DevOps & Cloud Engineer';
    } else if (/salesforce|apex|lightning|visualforce|crm/i.test(fullProfileStr)) {
      candidateDomain = 'Salesforce Developer';
    } else if (/rpa|uipath|automation anywhere|blue prism/i.test(fullProfileStr)) {
      candidateDomain = 'RPA & Automation Specialist';
    } else if (/qa|quality assurance|tester|testing|selenium|cypress|playwright/i.test(fullProfileStr)) {
      candidateDomain = 'QA & Automation Engineer';
    } else if (/backend|java|spring|golang|c#|\.net|python backend/i.test(fullProfileStr)) {
      candidateDomain = 'Backend Engineer';
    } else if (/frontend|angular|vue|tailwind|ui\/ux/i.test(fullProfileStr)) {
      candidateDomain = 'Frontend Developer';
    } else if (/product development|product manager|scrum|agile/i.test(fullProfileStr)) {
      candidateDomain = 'Product Development';
    }
  } catch (profErr) {
    // Non-blocking fallback
  }

  // 2. Comprehensive Openings Extraction & Ranking
  let finalOpeningsList = [...(extractedPageContent.openingsList || [])];

  // If page is a job listing page or finalOpeningsList is small, ask Gemini to extract all open positions from text snippet
  const isListing = legacyPageType === 'job_listing_page' || finalOpeningsList.length === 0;
  if (isListing && extractedPageContent.textSnippet) {
    try {
      const model = await getGeminiModel(userId);
      const openingsPrompt = `You are an AI Career Portal Specialist and Talent Matcher.
Analyze this company career portal page:
Page Title: "${extractedPageContent.title || ''}"
Page URL: "${extractedPageContent.url || ''}"
Text Snippet:
"""
${(extractedPageContent.textSnippet || '').slice(0, 30000)}
"""

Candidate Profile:
- Primary Domain: "${candidateDomain}"
- Target Headline: "${candidateHeadline || candidateDomain}"
- Verified Skills: ${candidateSkills.join(', ') || 'JavaScript, React, Node.js, Python, REST APIs'}

TASK:
1. Extract ALL available job openings, role titles, and open positions mentioned or listed on this career page (including practice area roles like RPA, Product Development, Machine Learning, DevOps, Salesforce, Full Stack, Software Engineer, QA, etc.).
2. For each role, determine its exact title, department (e.g. Engineering, AI/ML, DevOps, Product, Salesforce, RPA), and location.
3. Compare the candidate's skills and domain with each role:
   - If candidate domain is "${candidateDomain}", assign the highest matchScore (95-99) to the role(s) matching their domain (e.g. ML for ML candidate, Full Stack for Full Stack candidate, DevOps for DevOps candidate, etc.).
   - matchScore (0 to 100)
   - isBestMatch (true for the single highest matching role for this candidate)
   - matchReason (concise 1-sentence explanation of why it fits user's background)

Return STRICT JSON ONLY:
{
  "candidateDomain": "${candidateDomain}",
  "openings": [
    {
      "id": "role-1",
      "title": "<exact role title>",
      "department": "<department>",
      "location": "<location or Remote/Hybrid>",
      "referenceId": "<ref id if any>",
      "matchScore": <number 0-100>,
      "isBestMatch": <boolean>,
      "matchReason": "<explanation>"
    }
  ]
}`;

      const res = await model.invoke(openingsPrompt);
      const content = (res.content || '').trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.openings) && parsed.openings.length > 0) {
        finalOpeningsList = parsed.openings;
        if (parsed.candidateDomain) candidateDomain = parsed.candidateDomain;
      }
    } catch (llmErr) {
      await logError('classifyPageWithLlm.extractOpenings', llmErr.message);
    }
  }

  // 3. Ensure every role has matchScore, isBestMatch, and matchReason based on candidate domain
  if (finalOpeningsList.length > 0) {
    let highestScore = -1;
    let bestRole = null;
    const candLower = candidateDomain.toLowerCase();

    finalOpeningsList = finalOpeningsList.map((r, i) => {
      let score = typeof r.matchScore === 'number' ? r.matchScore : 75;
      const titleLower = (r.title || '').toLowerCase();
      const deptLower = (r.department || '').toLowerCase();

      // Domain-specific match scoring
      if (candLower.includes('machine learning') || candLower.includes('ai')) {
        if (titleLower.includes('machine learning') || titleLower.includes('ml') || titleLower.includes('ai') || titleLower.includes('data science') || deptLower.includes('ai')) {
          score = 98;
        } else if (titleLower.includes('python') || titleLower.includes('engineer')) {
          score = Math.max(score, 88);
        }
      } else if (candLower.includes('full stack')) {
        if (titleLower.includes('full stack') || titleLower.includes('mern') || titleLower.includes('node') || titleLower.includes('react') || titleLower.includes('web')) {
          score = 98;
        } else if (titleLower.includes('software') || titleLower.includes('developer') || titleLower.includes('product development')) {
          score = Math.max(score, 90);
        }
      } else if (candLower.includes('devops') || candLower.includes('cloud')) {
        if (titleLower.includes('devops') || titleLower.includes('cloud') || titleLower.includes('aws') || titleLower.includes('infrastructure')) {
          score = 98;
        } else if (titleLower.includes('engineer') || titleLower.includes('architect')) {
          score = Math.max(score, 88);
        }
      } else if (candLower.includes('salesforce')) {
        if (titleLower.includes('salesforce') || titleLower.includes('crm') || titleLower.includes('apex')) {
          score = 98;
        }
      } else if (candLower.includes('rpa')) {
        if (titleLower.includes('rpa') || titleLower.includes('automation')) {
          score = 98;
        }
      } else if (candLower.includes('product')) {
        if (titleLower.includes('product') || titleLower.includes('manager') || titleLower.includes('scrum')) {
          score = 98;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestRole = r;
      }

      return {
        ...r,
        id: r.id || `role-${i}`,
        matchScore: score,
        isBestMatch: false,
        matchReason: r.matchReason || `Matches your ${candidateDomain} background`
      };
    });

    if (bestRole) {
      bestRole.isBestMatch = true;
    }
  }

  const bestMatch = finalOpeningsList.find(r => r.isBestMatch) || finalOpeningsList[0] || null;

  return {
    pageType: legacyPageType,
    candidateDomain,
    workflow: {
      isMultiStep: pageStateResult.hasStepper,
      currentStep: pageStateResult.currentStep,
      totalSteps: pageStateResult.totalSteps,
      currentStepName: pageStateResult.activeStepName,
      isModal: Boolean(extractedPageContent.modalState?.isOpen)
    },
    isFormClosed: pageStateResult.isFormClosed,
    closedFormTitle: extractedPageContent.closedFormTitle || '',
    closedFormMessage: extractedPageContent.closedFormMessage || '',
    summary: pageStateResult.reason,
    matchedRole: bestMatch ? {
      title: bestMatch.title,
      referenceId: bestMatch.referenceId || '',
      experience: bestMatch.experience || '',
      location: bestMatch.location || '',
      matchScore: bestMatch.matchScore || 95,
      matchReason: bestMatch.matchReason || '',
      targetButtonText: 'Apply',
      targetSelector: bestMatch.selector || '',
      isAccordion: false
    } : {
      title: job.title || '',
      referenceId: extractedPageContent.referenceIds?.[0] || '',
      experience: '',
      location: '',
      matchScore: 90,
      matchReason: 'Default role match',
      targetButtonText: 'Apply',
      targetSelector: '',
      isAccordion: false
    },
    detectedOpenings: finalOpeningsList.map(o => o.title),
    openingsList: finalOpeningsList,
    shouldContinueDeepDive: pageStateResult.shouldContinueDeepDive,
    isTerminalState: pageStateResult.isTerminalState,
    nextAction: pageStateResult.nextAction,
    emailContact: {
      email: extractedPageContent.emails?.[0] || '',
      subject: `Application for ${bestMatch?.title || job.title || 'Position'}`,
      referenceId: bestMatch?.referenceId || extractedPageContent.referenceIds?.[0] || ''
    },
    nextRecommendedAction: legacyNextRecommendedAction,
    targetSelector: '',
    actionReason: pageStateResult.reason
  };
};
