import { StateGraph, END, START } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { geminiModel } from "../config/modelConfig.js";
import {
  searchConfigSchema,
  initialJobDiscoveryState,
} from "../schema/jobDiscoverySchema.js";
import { buildJobMatchPrompt } from "../prompt/jobMatcher.js";
import { getJobSource } from "../../integrations/jobSources/sourceManager.js";
import { compareJobWithConfig } from "../../integrations/utils/compareJobs.js";
import { createBrowser } from "../../browser/browserConfig.js";
import { upsertJob, getExistingSourceUrls } from "../../repositories/job.repository.js";
import { Resume } from "../../model/Resume.js";
import { logError, logResumeEvent, logJobEvent } from "../../utils/logger.js";
import { calculateScrapeLimit, resolveUserJobSearchSettings, MAX_DISCOVERY_ATTEMPTS } from "../../constant/agent.constant.js";
import { logSkippedJobService } from "../../services/skippedApplication.service.js";
import { getDecryptedSessionForUser } from "../../services/naukriSession.service.js";

export { searchConfigSchema };

/**
 * Node 1: Validate Search Configuration
 */
const validateConfigNode = async (state) => {
  try {
    const validatedConfig = searchConfigSchema.parse(state.config || {});
    await logJobEvent(
      "validateConfigNode",
      "SUCCESS",
      `Config validated for keywords: ${validatedConfig.keywords.join(", ")}`,
    );

    // Resolve user-specific job search settings
    let userJobSearchSettings = { maxJobsToSearch: 20 };
    if (validatedConfig.userId) {
      userJobSearchSettings = await resolveUserJobSearchSettings(validatedConfig.userId);
    }

    // Try loading candidate's active resume from DB if userId is provided
    let resumeText = state.candidateResumeText || "";
    if (!resumeText && validatedConfig.userId) {
      const activeResume = await Resume.findOne({
        userId: validatedConfig.userId,
        type: "ORIGINAL",
      }).sort({ createdAt: -1 });
      if (activeResume?.parsedData) {
        resumeText =
          typeof activeResume.parsedData === "string"
            ? activeResume.parsedData
            : JSON.stringify(activeResume.parsedData);
        await logJobEvent(
          "validateConfigNode",
          "RESUME_LOADED",
          `Candidate resume retrieved for User ${validatedConfig.userId}`,
        );
      } else {
        await logJobEvent(
          "validateConfigNode",
          "NO_RESUME",
          `No active candidate resume found for User ${validatedConfig.userId}`,
        );
      }
    }

    return {
      config: validatedConfig,
      candidateResumeText: resumeText,
      maxJobsToSearch: userJobSearchSettings.maxJobsToSearch,
      errors: [],
    };
  } catch (error) {
    await logError("jobDiscoveryGraph.validateConfigNode", error.message);
    return {
      errors: [error.message],
    };
  }
};

/**
 * Node 2: Discover Jobs using Playwright adapters
 */
const discoverJobsNode = async (state) => {
  let browser = null;
  let context = null;
  let page = null;
  let discovered = [];

  try {
    const config = state.config;
    const sourceName =
      config.sources[state.currentSourceIndex || 0] || "jobViaReferral";
    const targetMaxMatched = config.maxJobs || 5;
    const scrapeLimit = calculateScrapeLimit(targetMaxMatched, state.maxJobsToSearch);
    const currentAttempt = state.attemptCount || 1;

    await logJobEvent(
      "discoverJobsNode",
      "START",
      `[Attempt ${currentAttempt}/${MAX_DISCOVERY_ATTEMPTS}] Scraping source: ${sourceName} (scrape limit: ${scrapeLimit})`,
    );

    const sourceAdapter = getJobSource(sourceName);

    // If source is Naukri, ensure user has an active authenticated session
    let restoredStorageState = null;
    if (sourceName === 'naukri') {
      const userId = config.userId;
      if (!userId) {
        throw new Error('User ID is required to search jobs on Naukri.');
      }
      restoredStorageState = await getDecryptedSessionForUser(userId);
      if (!restoredStorageState) {
        throw new Error(
          'NAUKRI_AUTHENTICATION_REQUIRED: Valid authenticated Naukri session not found. Please connect your Naukri account before discovering jobs from Naukri.'
        );
      }
    }

    browser = await createBrowser();
    const contextOptions = {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    };
    if (restoredStorageState) {
      contextOptions.storageState = restoredStorageState;
    }

    context = await browser.newContext(contextOptions);
    context.setDefaultTimeout(15000);
    context.setDefaultNavigationTimeout(20000);

    // Context-level interceptor: abort media, fonts, and third-party trackers across ALL pages/tabs
    await context.route('**/*', (route) => {
      const type = route.request().resourceType();
      const url = route.request().url();
      if (
        type === 'media' ||
        type === 'font' ||
        /(?:googleads|adsbygoogle|doubleclick|googletagservices|googlesyndication|ezoic|adnxs|amazon-adsystem|analytics|tracker|facebook\.net|taboola|outbrain|criteo|pubmatic)/i.test(url)
      ) {
        return route.abort().catch(() => {});
      }
      return route.continue().catch(() => {});
    });

    page = await context.newPage();

    // Use source adapter to search and scrape jobs
    discovered = await sourceAdapter.searchJobs(page, {
      maxJobs: scrapeLimit,
      categoryUrl: config.categoryUrl,
      keywords: config.keywords,
      locations: config.locations,
      workMode: config.workMode,
      experience: config.experience,
      attemptCount: currentAttempt,
      abortSignal: config.abortSignal,
    });

    await logJobEvent(
      "discoverJobsNode",
      "SUCCESS",
      `Discovered ${discovered?.length || 0} jobs from ${sourceName}`,
    );

    return {
      rawJobs: discovered || [],
    };
  } catch (error) {
    await logError("jobDiscoveryGraph.discoverJobsNode", error.message);
    return {
      rawJobs: [],
      errors: [...(state.errors || []), error.message],
    };
  } finally {
    // Explicitly close page, context, and browser in finally block to prevent zombie processes
    if (page) {
      await page.close().catch(() => {});
    }
    if (context) {
      await context.close().catch(() => {});
    }
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

/**
 * Node 3: Normalize Jobs into uniform schema
 */
const normalizeJobsNode = async (state) => {
  try {
    const rawList = state.rawJobs || [];
    const normalizedList = rawList.map((job) => ({
      ...job,
      title: job.title || "Untitled Position",
      source: job.source || "jobViaReferral",
      postedDate: job.postedDate || new Date().toISOString(),
    }));

    await logJobEvent(
      "normalizeJobsNode",
      "SUCCESS",
      `Normalized ${normalizedList.length} raw jobs`,
    );

    return {
      normalizedJobs: normalizedList,
    };
  } catch (error) {
    await logError("jobDiscoveryGraph.normalizeJobsNode", error.message);
    return {
      normalizedJobs: state.rawJobs || [],
    };
  }
};

/**
 * Node 4: Apply Deterministic Filters (Keywords, Location, Experience, WorkMode, PostedWithin) & Skip Existing DB Jobs
 */
const applyFiltersNode = async (state) => {
  try {
    const config = state.config;
    const normalized = state.normalizedJobs || [];

    // Query database for existing jobs by sourceUrl before evaluating/sending to AI
    const sourceUrls = normalized.map((j) => j.sourceUrl).filter(Boolean);
    const existingSet = await getExistingSourceUrls(sourceUrls);

    const passedJobs = [];
    const skippedJobs = [];
    let skippedExistingCount = 0;

    for (const job of normalized) {
      // Do not re-process or re-count jobs that already exist in MongoDB
      if (job.sourceUrl && existingSet.has(job.sourceUrl)) {
        skippedExistingCount++;
        continue;
      }

      const evaluation = compareJobWithConfig(job, config);
      if (evaluation.isMatch) {
        passedJobs.push({
          ...job,
          deterministicScore: evaluation.score,
          matchReasons: evaluation.matchReasons,
        });
      } else {
        skippedJobs.push({
          userId: config?.userId,
          job,
          skipReason: evaluation.skipReason || 'CONFIG_MISMATCH',
          skipDetails: (evaluation.failReasons || []).join('; '),
        });
      }
    }

    await logJobEvent(
      "applyFiltersNode",
      "SUCCESS",
      `Filtered ${passedJobs.length}/${normalized.length} jobs based on criteria (skipped ${skippedJobs.length} total)`,
    );

    return {
      filteredJobs: passedJobs,
      skippedJobs,
    };
  } catch (error) {
    await logError("jobDiscoveryGraph.applyFiltersNode", error.message);
    return {
      filteredJobs: state.normalizedJobs || [],
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
    const skippedJobs = [...(state.skippedJobs || [])];

    if (!candidateText || jobsToMatch.length === 0) {
      const defaultMatched = jobsToMatch.map((job) => ({
        ...job,
        matchStatus: "MATCHED",
        matchScore: job.deterministicScore || 75,
        matchReason:
          "Matched based on deterministic criteria (No candidate resume provided)",
      }));

      await logJobEvent(
        "matchWithResumeNode",
        "BYPASS",
        `Bypassed LLM evaluation for ${jobsToMatch.length} jobs (no candidate resume or jobs empty)`,
      );
      return { matchedJobs: defaultMatched, skippedJobs };
    }

    await logJobEvent(
      "matchWithResumeNode",
      "START",
      `Evaluating candidate resume match against ${jobsToMatch.length} jobs via Gemini LLM`,
    );

    const matchedResults = [];
    for (const job of jobsToMatch) {
      if (state.config?.abortSignal?.aborted) {
        await logJobEvent("matchWithResumeNode", "CANCELLED", "LLM matching aborted by user");
        throw new Error("JOB_DISCOVERY_ABORTED");
      }

      try {
        const prompt = buildJobMatchPrompt(candidateText, job);

        const response = await geminiModel.invoke([
          new SystemMessage(
            "You output strictly valid JSON without markdown formatting or code fences.",
          ),
          new HumanMessage(prompt),
        ]);

        const rawContent = response.content
          .toString()
          .replace(/```json|```/g, "")
          .trim();
        const parsedMatch = JSON.parse(rawContent);

        const isMatch = parsedMatch.isMatch && parsedMatch.matchScore >= 50;

        if (!isMatch) {
          skippedJobs.push({
            userId: state.config?.userId,
            job,
            skipReason: 'SKILL_MISMATCH',
            skipDetails: parsedMatch.matchReason || `LLM Match score ${parsedMatch.matchScore || 0}% below threshold`,
          });
        }

        matchedResults.push({
          ...job,
          matchStatus: isMatch ? "MATCHED" : "NOT_MATCHED",
          matchScore: parsedMatch.matchScore || 0,
          matchReason: parsedMatch.matchReason || "",
          matchedSkills: parsedMatch.matchedSkills || [],
          missingSkills: parsedMatch.missingSkills || [],
        });

        // Small delay to avoid rate limits (RPM)
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (llmError) {
        await logError(
          "jobDiscoveryGraph.matchWithResumeNode.item",
          llmError.message,
        );
        matchedResults.push({
          ...job,
          matchStatus: "MATCHED",
          matchScore: job.deterministicScore || 70,
          matchReason: "Matched based on keyword criteria",
        });
      }
    }

    await logJobEvent(
      "matchWithResumeNode",
      "SUCCESS",
      `Completed LLM evaluation for ${matchedResults.length} jobs`,
    );
    return { matchedJobs: matchedResults, skippedJobs };
  } catch (error) {
    await logError("jobDiscoveryGraph.matchWithResumeNode", error.message);
    return { matchedJobs: state.filteredJobs || [] };
  }
};

/**
 * Node 6: Store Eligible Jobs into MongoDB
 */
const storeEligibleJobsNode = async (state) => {
  try {
    const jobsToStore = (state.matchedJobs || []).filter(
      (j) => j.matchStatus === "MATCHED",
    );
    const storedList = [];

    for (const jobData of jobsToStore) {
      if (jobData.sourceUrl) {
        const doc = await upsertJob(jobData).catch(() => null);
        if (doc) storedList.push(doc);
      }
    }

    await logJobEvent(
      "storeEligibleJobsNode",
      "SUCCESS",
      `Persisted ${storedList.length}/${jobsToStore.length} matched jobs to MongoDB`,
    );

    return {
      storedJobsCount: storedList.length,
    };
  } catch (error) {
    await logError("jobDiscoveryGraph.storeEligibleJobsNode", error.message);
    return { storedJobsCount: 0 };
  }
};

/**
 * Node 7: Skip Node - Persist Skipped Jobs with Exact Reasons into MongoDB
 */
const storeSkippedJobsNode = async (state) => {
  try {
    const skippedList = state.skippedJobs || [];
    const userId = state.config?.userId;

    if (!userId || skippedList.length === 0) {
      return { storedSkippedCount: 0 };
    }

    let storedCount = 0;
    const seenUrls = new Set();
    for (const item of skippedList) {
      if (item.job && item.job.sourceUrl && !seenUrls.has(item.job.sourceUrl)) {
        seenUrls.add(item.job.sourceUrl);
        const doc = await logSkippedJobService({
          userId: item.userId || userId,
          job: item.job,
          skipReason: item.skipReason,
          skipDetails: item.skipDetails,
        }).catch(() => null);
        if (doc) storedCount++;
      }
    }

    await logJobEvent(
      "storeSkippedJobsNode",
      "SUCCESS",
      `Persisted ${storedCount}/${seenUrls.size} new unique skipped jobs with reasons into MongoDB`,
    );

    return {
      storedSkippedCount: storedCount,
      attemptCount: (state.attemptCount || 1) + 1,
    };
  } catch (error) {
    await logError("jobDiscoveryGraph.storeSkippedJobsNode", error.message);
    return {
      storedSkippedCount: 0,
      attemptCount: (state.attemptCount || 1) + 1,
    };
  }
};

/**
 * Conditional Edge Router: Evaluates whether enough matched jobs were found or max attempts reached
 */
const checkEnoughJobsEdge = async (state) => {
  const matchedOnly = (state.matchedJobs || []).filter(
    (j) => j.matchStatus === "MATCHED",
  );
  const targetMax = state.config?.maxJobs || 10;
  const currentAttempt = state.attemptCount || 1;
  const maxAttempts = MAX_DISCOVERY_ATTEMPTS || 3;
  const rawJobsCount = (state.rawJobs || []).length;

  // Stop if target matched limit reached, max attempts exceeded, or if no raw jobs were found in the run
  if (matchedOnly.length >= targetMax || currentAttempt > maxAttempts || rawJobsCount === 0) {
    await logJobEvent(
      "checkEnoughJobsEdge",
      "COMPLETE",
      `Job discovery finished after ${currentAttempt - 1} attempt(s). Total matched: ${matchedOnly.length}/${targetMax}, Raw jobs in run: ${rawJobsCount}`,
    );
    return END;
  }

  await logJobEvent(
    "checkEnoughJobsEdge",
    "RETRY",
    `Attempt ${currentAttempt - 1} yielded ${matchedOnly.length}/${targetMax} matched jobs. Triggering attempt ${currentAttempt}/${maxAttempts}...`,
  );
  return "discoverJobs";
};

/**
 * Build and compile the LangGraph Job Discovery Workflow
 */
const graphBuilder = new StateGraph({
  channels: {
    config: { value: (x, y) => y ?? x, default: () => null },
    rawJobs: { value: (x, y) => y ?? x, default: () => [] },
    normalizedJobs: {
      value: (x, y) => {
        if (!x) return y || [];
        if (!y) return x || [];
        const map = new Map();
        [...x, ...y].forEach((j) => {
          const key = j.sourceUrl || j.title;
          if (key && !map.has(key)) map.set(key, j);
        });
        return Array.from(map.values());
      },
      default: () => [],
    },
    filteredJobs: { value: (x, y) => y ?? x, default: () => [] },
    matchedJobs: {
      value: (x, y) => {
        if (!x) return y || [];
        if (!y) return x || [];
        const map = new Map();
        [...x, ...y].forEach((j) => {
          const key = j._id?.toString() || j.sourceUrl;
          if (key && !map.has(key)) map.set(key, j);
        });
        return Array.from(map.values());
      },
      default: () => [],
    },
    skippedJobs: {
      value: (x, y) => {
        if (!x) return y || [];
        if (!y) return x || [];
        const map = new Map();
        [...x, ...y].forEach((item) => {
          const key = item.job?.sourceUrl || item.sourceUrl || Math.random().toString();
          if (key && !map.has(key)) map.set(key, item);
        });
        return Array.from(map.values());
      },
      default: () => [],
    },
    currentSourceIndex: { value: (x, y) => y ?? x, default: () => 0 },
    attemptCount: { value: (x, y) => y ?? x, default: () => 1 },
    candidateResumeText: { value: (x, y) => y ?? x, default: () => "" },
    maxJobsToSearch: { value: (x, y) => y ?? x, default: () => 20 },
    errors: { value: (x, y) => (x || []).concat(y || []), default: () => [] },
  },
});

graphBuilder
  .addNode("validateConfig", validateConfigNode)
  .addNode("discoverJobs", discoverJobsNode)
  .addNode("normalizeJobs", normalizeJobsNode)
  .addNode("applyFilters", applyFiltersNode)
  .addNode("matchWithResume", matchWithResumeNode)
  .addNode("storeEligibleJobs", storeEligibleJobsNode)
  .addNode("storeSkippedJobs", storeSkippedJobsNode)
  .addEdge(START, "validateConfig")
  .addEdge("validateConfig", "discoverJobs")
  .addEdge("discoverJobs", "normalizeJobs")
  .addEdge("normalizeJobs", "applyFilters")
  .addEdge("applyFilters", "matchWithResume")
  .addEdge("matchWithResume", "storeEligibleJobs")
  .addEdge("storeEligibleJobs", "storeSkippedJobs")
  .addConditionalEdges("storeSkippedJobs", checkEnoughJobsEdge, {
    discoverJobs: "discoverJobs",
    [END]: END,
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
      candidateResumeText: searchConfig.candidateResumeText || "",
    };

    const targetMax = searchConfig.maxJobs || 10;
    const finalState = await jobDiscoveryGraph.invoke(initialState, { recursionLimit: 50 });
    const matchedOnly = (finalState.matchedJobs || []).filter(
      (j) => j.matchStatus === "MATCHED",
    );
    const limitedMatchedJobs = matchedOnly.slice(0, targetMax);

    return {
      success: true,
      matchedJobs: limitedMatchedJobs,
      totalJobsDiscovered: (finalState.normalizedJobs || []).length,
      errors: finalState.errors || [],
    };
  } catch (error) {
    await logError("runJobDiscoveryWorkflow", error.message);
    return {
      success: false,
      matchedJobs: [],
      totalJobsDiscovered: 0,
      errors: [error.message],
    };
  }
};

export default runJobDiscoveryWorkflow;
