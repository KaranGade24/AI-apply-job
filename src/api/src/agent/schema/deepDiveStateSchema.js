import { Annotation } from "@langchain/langgraph";
import { AGENT_STATUS, PERCEPTION_PAGE_TYPES } from "../../constant/agent.constant.js";

/**
 * Deep Dive Agent State Schema: Complete memory structure for the autonomous browser agent
 */
export const DeepDiveAgentStateAnnotation = Annotation.Root({
  // 1. Browser runtime state
  browserState: Annotation({
    reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
    default: () => ({
      currentUrl: "",
      title: "",
      tabsCount: 1,
      hasDialog: false,
      hasIframe: false,
      isLoaded: true,
      screenshot: null,
    }),
  }),

  // 2. Page semantic state (from PageAnalyzer)
  pageState: Annotation({
    reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
    default: () => ({
      pageType: PERCEPTION_PAGE_TYPES.UNKNOWN,
      title: "",
      elementsCount: 0,
      validationErrors: [],
      disabledReason: null,
      summary: "",
      rawAnalysis: null,
    }),
  }),

  // 3. Target Job context
  jobContext: Annotation({
    reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
    default: () => ({
      jobId: "",
      title: "",
      company: "",
      description: "",
      location: "",
      applicationUrl: "",
      requirements: [],
    }),
  }),

  // 4. Candidate user profile
  userProfile: Annotation({
    reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
    default: () => ({
      personal: {},
      education: [],
      experience: [],
      skills: [],
      customAnswers: {},
    }),
  }),

  // 5. Tailored ATS resume data & PDF
  resumeData: Annotation({
    reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
    default: () => ({
      tailoredResumeData: null,
      pdfPath: "",
      fileName: "",
      skills: [],
      summary: "",
    }),
  }),

  // 6. Application tracking data
  applicationData: Annotation({
    reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
    default: () => ({
      applicationId: "",
      status: AGENT_STATUS.STARTING,
      answers: [],
      missingQuestions: [],
      reviewFields: [],
    }),
  }),

  // 7. Last executed action
  lastAction: Annotation({
    reducer: (curr, update) => update !== undefined ? update : curr,
    default: () => null,
  }),

  // 8. Result of last executed action
  actionResult: Annotation({
    reducer: (curr, update) => update !== undefined ? update : curr,
    default: () => null,
  }),

  // 9. Next planned action from LLM decision engine
  nextAction: Annotation({
    reducer: (curr, update) => update !== undefined ? update : curr,
    default: () => null,
  }),

  // 10. Accumulated error messages
  errors: Annotation({
    reducer: (curr, update) => {
      if (!update) return curr || [];
      const list = Array.isArray(update) ? update : [update];
      return [...(curr || []), ...list];
    },
    default: () => [],
  }),

  // 11. Step & attempt counters
  attemptCount: Annotation({
    reducer: (curr, update) => (update !== undefined ? update : (curr || 0) + 1),
    default: () => 0,
  }),

  stepCount: Annotation({
    reducer: (curr, update) => (update !== undefined ? update : (curr || 0) + 1),
    default: () => 0,
  }),

  // 12. Overall agent status
  status: Annotation({
    reducer: (curr, update) => update || curr || AGENT_STATUS.STARTING,
    default: () => AGENT_STATUS.STARTING,
  }),

  // 13. Human intervention details (if required)
  humanIntervention: Annotation({
    reducer: (curr, update) => update !== undefined ? update : curr,
    default: () => null,
  }),

  // 14. Action history log
  actionHistory: Annotation({
    reducer: (curr, update) => {
      if (!update) return curr || [];
      const list = Array.isArray(update) ? update : [update];
      return [...(curr || []), ...list];
    },
    default: () => [],
  }),
});

/**
 * Creates initial clean state for Deep Dive Agent
 */
export const createInitialDeepDiveState = ({
  applicationId,
  job,
  userProfile,
  resumeData,
  url,
}) => {
  return {
    browserState: {
      currentUrl: url || job?.applicationUrl || "",
      title: "",
      tabsCount: 1,
      hasDialog: false,
      hasIframe: false,
      isLoaded: true,
      screenshot: null,
    },
    pageState: {
      pageType: PERCEPTION_PAGE_TYPES.UNKNOWN,
      title: "",
      elementsCount: 0,
      validationErrors: [],
      disabledReason: null,
      summary: "",
      rawAnalysis: null,
    },
    jobContext: {
      jobId: job?._id || job?.id || "",
      title: job?.title || "",
      company: job?.company || "",
      description: job?.description || "",
      location: job?.location || "",
      applicationUrl: url || job?.applicationUrl || job?.sourceUrl || "",
      requirements: job?.requirements || [],
    },
    userProfile: {
      personal: userProfile?.personal || userProfile || {},
      education: userProfile?.education || [],
      experience: userProfile?.experience || [],
      skills: userProfile?.skills || [],
      customAnswers: userProfile?.customAnswers || {},
    },
    resumeData: {
      tailoredResumeData: resumeData?.tailoredResumeData || null,
      pdfPath: resumeData?.pdfPath || "",
      fileName: resumeData?.fileName || "Resume.pdf",
      skills: resumeData?.skills || [],
      summary: resumeData?.summary || "",
    },
    applicationData: {
      applicationId: String(applicationId),
      status: AGENT_STATUS.STARTING,
      answers: [],
      missingQuestions: [],
      reviewFields: [],
    },
    lastAction: null,
    actionResult: null,
    nextAction: null,
    errors: [],
    attemptCount: 0,
    stepCount: 0,
    status: AGENT_STATUS.STARTING,
    humanIntervention: null,
    actionHistory: [],
  };
};

export default {
  DeepDiveAgentStateAnnotation,
  createInitialDeepDiveState,
};
