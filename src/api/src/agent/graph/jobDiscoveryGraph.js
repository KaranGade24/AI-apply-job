import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { geminiModel } from "../config/modelConfig.js";
import { searchConfigSchema, initialJobDiscoveryState } from "../schema/jobDiscoverySchema.js";
import { buildJobMatchPrompt } from "../prompt/jobMatcher.js";
import { getJobSource } from "../../integrations/jobSources/sourceManager.js";
import { compareJobWithConfig } from "../../integrations/utils/compareJobs.js";
import { createBrowser } from "../../browser/browserConfig.js";
import { upsertJob } from "../../repositories/job.repository.js";
import { Resume } from "../../model/Resume.js";
import { logError, logResumeEvent } from "../../utils/logger.js";

export { searchConfigSchema };

/**
 * Node 1: Validate Search Configuration
 */
const validateConfigNode = async (state) => {
  try {
    const validatedConfig = searchConfigSchema.parse(state.config || {});

    // Try loading candidate's active resume from DB if userId is provided
    let resumeText = state.candidateResumeText || '';
    if (!resumeText && validatedConfig.userId) {
      const activeResume = await Resume.findOne({ userId: validatedConfig.userId, type: 'ORIGINAL' }).sort({ createdAt: -1 });
      if (activeResume?.parsedData) {
        resumeText = typeof activeResume.parsedData === 'string'
          ? activeResume.parsedData
          : JSON.stringify(activeResume.parsedData);
      }
    }

    return {
      config: validatedConfig,
      candidateResumeText: resumeText,
      errors: []
    };
  } catch (error) {
    await logError('jobDiscoveryGraph.validateConfigNode', error.message);
    return {
      errors: [error.message]
    };
  }
};

/**
 * Node 2: Discover Jobs using Playwright adapters
 */
const discoverJobsNode = async (state) => {
  let browser = null;
  try {
    const config = state.config;
    const sourceName = config.sources[state.currentSourceIndex || 0] || 'jobViaReferral';
    const sourceAdapter = getJobSource(sourceName);

    browser = await createBrowser();
    const page = await browser.newPage();

    // Use source adapter to search and scrape jobs
    const discovered = await sourceAdapter.searchJobs(page, {
      maxJobs: config.maxJobs,
      categoryUrl: undefined
    });

    await browser.close();
    browser = null;

    return {
      rawJobs: discovered || []
    };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    await logError('jobDiscoveryGraph.discoverJobsNode', error.message);
    return {
      rawJobs: [],
      errors: [...(state.errors || []), error.message]
    };
  }
};

/**
 * Node 3: Normalize Jobs into uniform schema
 */
const normalizeJobsNode = async (state) => {
  try {
    const rawList = state.rawJobs || [];
    const normalizedList = rawList.map(job => ({
      ...job,
      title: job.title || 'Untitled Position',
      source: job.source || 'jobViaReferral',
      postedDate: job.postedDate || new Date().toISOString()
    }));

    return {
      normalizedJobs: normalizedList
    };
  } catch (error) {
    await logError('jobDiscoveryGraph.normalizeJobsNode', error.message);
    return {
      normalizedJobs: state.rawJobs || []
    };
  }
};

/**
 * Node 4: Apply Deterministic Filters (Keywords, Location, Experience, WorkMode, PostedWithin)
 */
const applyFiltersNode = async (state) => {
  try {
    const config = state.config;
    const normalized = state.normalizedJobs || [];

    const passedJobs = [];
    for (const job of normalized) {
      const evaluation = compareJobWithConfig(job, config);
      if (evaluation.isMatch) {
        passedJobs.push({
          ...job,
          deterministicScore: evaluation.score,
          matchReasons: evaluation.matchReasons
        });
      }
    }

    return {
      filteredJobs: passedJobs
    };
  } catch (error) {
    await logError('jobDiscoveryGraph.applyFiltersNode', error.message);
    return {
      filteredJobs: state.normalizedJobs || []
    };
  }
};

/**
 * Node 5: Match Filtered Jobs with Resume using Gemini LLM
 */
const matchWithResumeNode = async (state) => {
  try {
    const candidateText = state.candidateResumeText;
    const jobsToMatch = state.filteredJobs || [];

    if (!candidateText || jobsToMatch.length === 0) {
      // If no candidate resume available, mark filtered jobs as MATCHED by default
      const defaultMatched = jobsToMatch.map(job => ({
        ...job,
        matchStatus: 'MATCHED',
        matchScore: job.deterministicScore || 75,
        matchReason: 'Matched based on deterministic criteria (No candidate resume provided)'
      }));

      return { matchedJobs: defaultMatched };
    }

    const matchedResults = [];

    for (const job of jobsToMatch) {
      try {
        const prompt = buildJobMatchPrompt(candidateText, job);

        const response = await geminiModel.invoke([
          new SystemMessage("You output strictly valid JSON without markdown formatting or code fences."),
          new HumanMessage(prompt)
        ]);

        const rawContent = response.content.toString().replace(/```json|```/g, '').trim();
        const parsedMatch = JSON.parse(rawContent);

        const isMatch = parsedMatch.isMatch && parsedMatch.matchScore >= 50;

        matchedResults.push({
          ...job,
          matchStatus: isMatch ? 'MATCHED' : 'NOT_MATCHED',
          matchScore: parsedMatch.matchScore || 0,
          matchReason: parsedMatch.matchReason || '',
          matchedSkills: parsedMatch.matchedSkills || [],
          missingSkills: parsedMatch.missingSkills || []
        });
      } catch (llmError) {
        await logError('jobDiscoveryGraph.matchWithResumeNode.item', llmError.message);
        matchedResults.push({
          ...job,
          matchStatus: 'MATCHED',
          matchScore: job.deterministicScore || 70,
          matchReason: 'Matched based on keyword criteria'
        });
      }
    }

    return { matchedJobs: matchedResults };
  } catch (error) {
    await logError('jobDiscoveryGraph.matchWithResumeNode', error.message);
    return { matchedJobs: state.filteredJobs || [] };
  }
};

/**
 * Node 6: Store Eligible Jobs into MongoDB
 */
const storeEligibleJobsNode = async (state) => {
  try {
    const jobsToStore = state.matchedJobs || [];
    const storedList = [];

    for (const jobData of jobsToStore) {
      if (jobData.sourceUrl) {
        const doc = await upsertJob(jobData).catch(() => null);
        if (doc) storedList.push(doc);
      }
    }

    await logResumeEvent('storeEligibleJobsNode', `Stored ${storedList.length} jobs in MongoDB`);

    return {
      storedJobsCount: storedList.length
    };
  } catch (error) {
    await logError('jobDiscoveryGraph.storeEligibleJobsNode', error.message);
    return { storedJobsCount: 0 };
  }
};

/**
 * Conditional Edge Router: Determines if workflow should end or discover next source/batch
 */
const checkEnoughJobsEdge = (state) => {
  const matched = state.matchedJobs || [];
  const maxJobs = state.config?.maxJobs || 10;
  const currentSourceIndex = state.currentSourceIndex || 0;
  const sourcesCount = state.config?.sources?.length || 1;

  if (matched.length >= maxJobs || (currentSourceIndex + 1) >= sourcesCount) {
    return END;
  }

  return "discoverJobs";
};

/**
 * Build and compile the LangGraph Job Discovery Workflow
 */
const graphBuilder = new StateGraph({
  channels: {
    config: { value: (x, y) => y ?? x, default: () => null },
    rawJobs: { value: (x, y) => y ?? x, default: () => [] },
    normalizedJobs: { value: (x, y) => y ?? x, default: () => [] },
    filteredJobs: { value: (x, y) => y ?? x, default: () => [] },
    matchedJobs: { value: (x, y) => y ?? x, default: () => [] },
    currentSourceIndex: { value: (x, y) => y ?? x, default: () => 0 },
    candidateResumeText: { value: (x, y) => y ?? x, default: () => '' },
    errors: { value: (x, y) => (x || []).concat(y || []), default: () => [] }
  }
});

graphBuilder
  .addNode("validateConfig", validateConfigNode)
  .addNode("discoverJobs", discoverJobsNode)
  .addNode("normalizeJobs", normalizeJobsNode)
  .addNode("applyFilters", applyFiltersNode)
  .addNode("matchWithResume", matchWithResumeNode)
  .addNode("storeEligibleJobs", storeEligibleJobsNode)
  .addEdge(START, "validateConfig")
  .addEdge("validateConfig", "discoverJobs")
  .addEdge("discoverJobs", "normalizeJobs")
  .addEdge("normalizeJobs", "applyFilters")
  .addEdge("applyFilters", "matchWithResume")
  .addEdge("matchWithResume", "storeEligibleJobs")
  .addConditionalEdges("storeEligibleJobs", checkEnoughJobsEdge, {
    discoverJobs: "discoverJobs",
    [END]: END
  });

export const jobDiscoveryGraph = graphBuilder.compile();

/**
 * Main Execution Function for Job Discovery Workflow
 * @param {object} searchConfig
 * @returns {Promise<object>} Workflow execution results
 */
export const runJobDiscoveryWorkflow = async (searchConfig = {}) => {
  try {
    const initialState = {
      ...initialJobDiscoveryState,
      config: searchConfig,
      candidateResumeText: searchConfig.candidateResumeText || ''
    };

    const finalState = await jobDiscoveryGraph.invoke(initialState);
    return {
      success: true,
      matchedJobs: finalState.matchedJobs || [],
      totalJobsDiscovered: (finalState.normalizedJobs || []).length,
      errors: finalState.errors || []
    };
  } catch (error) {
    await logError('runJobDiscoveryWorkflow', error.message);
    return {
      success: false,
      matchedJobs: [],
      totalJobsDiscovered: 0,
      errors: [error.message]
    };
  }
};

export default runJobDiscoveryWorkflow;
