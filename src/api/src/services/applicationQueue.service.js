import { AutomationQueue, QUEUE_STATUS } from '../model/AutomationQueue.js';
import { Job } from '../model/Job.js';
import { JobApplication } from '../model/JobApplication.js';
import { APPLICATION_STATUS } from '../constant/application.constant.js';
import { createApplicationFromJob } from './application.service.js';
import { appError } from '../utils/errors.js';
import { logJobEvent, logError } from '../utils/logger.js';

// Global flag tracking paused state per user
const pausedUsers = new Set();

/**
 * Add multiple jobs to the application automation queue
 */
export const addJobsToQueueService = async (userId, jobIds = []) => {
  if (!userId) {
    throw new appError('User ID is required', 400);
  }
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    throw new appError('At least one jobId is required', 400);
  }

  const addedItems = [];

  for (const jobId of jobIds) {
    try {
      const job = await Job.findById(jobId);
      if (!job) continue;

      // Check if already in queue and not in terminal state
      let queueItem = await AutomationQueue.findOne({
        userId,
        jobId,
        status: { $in: [QUEUE_STATUS.PENDING, QUEUE_STATUS.ANALYZING, QUEUE_STATUS.PREPARING, QUEUE_STATUS.WAITING_FOR_USER, QUEUE_STATUS.FILLING, QUEUE_STATUS.SUBMITTING, QUEUE_STATUS.NEEDS_REVIEW] }
      });

      if (!queueItem) {
        // Initialize application if not exists
        let application = null;
        try {
          application = await createApplicationFromJob(userId, jobId);
        } catch (appErr) {
          logError('queue.initApplication', appErr.message);
        }

        queueItem = await AutomationQueue.create({
          userId,
          jobId,
          applicationId: application?._id || null,
          status: QUEUE_STATUS.PENDING,
          currentStep: 'Queued for processing',
          progressPercent: 10,
          logs: [
            {
              step: 'Enqueued',
              message: `Job "${job.title}" at "${job.company || 'Company'}" added to automation queue`,
              status: 'INFO',
            },
          ],
        });
      }

      addedItems.push(queueItem);
    } catch (err) {
      logError('applicationQueue.addJob', err.message);
    }
  }

  logJobEvent('queue', 'JOBS_ENQUEUED', `Added ${addedItems.length} jobs to queue for user ${userId}`, 'low');
  return addedItems;
};

/**
 * Get all queue items with populated details and summary counts
 */
export const getQueueService = async (userId) => {
  if (!userId) {
    throw new appError('User ID is required', 400);
  }

  const items = await AutomationQueue.find({ userId })
    .populate('jobId')
    .populate('applicationId')
    .sort({ priority: -1, createdAt: -1 });

  const isPaused = pausedUsers.has(String(userId));

  // Compute queue stats
  const stats = {
    total: items.length,
    pending: items.filter((i) => i.status === QUEUE_STATUS.PENDING).length,
    analyzing: items.filter((i) => i.status === QUEUE_STATUS.ANALYZING || i.status === QUEUE_STATUS.DEEP_DIVING).length,
    preparing: items.filter((i) => i.status === QUEUE_STATUS.PREPARING).length,
    waitingForUser: items.filter((i) => i.status === QUEUE_STATUS.WAITING_FOR_USER).length,
    filling: items.filter((i) => i.status === QUEUE_STATUS.FILLING).length,
    submitting: items.filter((i) => i.status === QUEUE_STATUS.SUBMITTING).length,
    submitted: items.filter((i) => i.status === QUEUE_STATUS.SUBMITTED).length,
    failed: items.filter((i) => i.status === QUEUE_STATUS.FAILED).length,
    skipped: items.filter((i) => i.status === QUEUE_STATUS.SKIPPED).length,
    needsReview: items.filter((i) => i.status === QUEUE_STATUS.NEEDS_REVIEW).length,
  };

  return {
    items,
    stats,
    isPaused,
  };
};

/**
 * Pause queue runner for user
 */
export const pauseQueueService = async (userId) => {
  if (!userId) throw new appError('User ID is required', 400);
  pausedUsers.add(String(userId));
  logJobEvent('queue', 'PAUSED', `Queue paused for user ${userId}`, 'low');
  return { isPaused: true };
};

/**
 * Resume queue runner for user
 */
export const resumeQueueService = async (userId) => {
  if (!userId) throw new appError('User ID is required', 400);
  pausedUsers.delete(String(userId));
  logJobEvent('queue', 'RESUMED', `Queue resumed for user ${userId}`, 'low');
  return { isPaused: false };
};

/**
 * Cancel a specific queue item
 */
export const cancelQueueItemService = async (userId, queueItemId) => {
  const item = await AutomationQueue.findOne({ _id: queueItemId, userId });
  if (!item) throw new appError('Queue item not found', 404);

  item.status = QUEUE_STATUS.SKIPPED;
  item.currentStep = 'Cancelled by user';
  item.logs.push({
    step: 'Cancelled',
    message: 'User cancelled automation for this job',
    status: 'WARN',
  });
  await item.save();
  return item;
};

/**
 * Skip a specific queue item
 */
export const skipQueueItemService = async (userId, queueItemId) => {
  const item = await AutomationQueue.findOne({ _id: queueItemId, userId });
  if (!item) throw new appError('Queue item not found', 404);

  item.status = QUEUE_STATUS.SKIPPED;
  item.currentStep = 'Skipped by user';
  item.logs.push({
    step: 'Skipped',
    message: 'User explicitly skipped this application',
    status: 'INFO',
  });
  await item.save();
  return item;
};

/**
 * Retry a failed or waiting queue item
 */
export const retryQueueItemService = async (userId, queueItemId) => {
  const item = await AutomationQueue.findOne({ _id: queueItemId, userId });
  if (!item) throw new appError('Queue item not found', 404);

  item.status = QUEUE_STATUS.PENDING;
  item.attempts = 0;
  item.errorReason = null;
  item.currentStep = 'Queued for retry';
  item.progressPercent = 15;
  item.logs.push({
    step: 'Retry',
    message: 'Queued for re-execution',
    status: 'INFO',
  });
  await item.save();
  return item;
};

/**
 * Retry all failed applications in the queue
 */
export const retryAllFailedService = async (userId) => {
  const result = await AutomationQueue.updateMany(
    { userId, status: QUEUE_STATUS.FAILED },
    {
      $set: {
        status: QUEUE_STATUS.PENDING,
        attempts: 0,
        errorReason: null,
        currentStep: 'Queued for retry',
        progressPercent: 15,
      },
      $push: {
        logs: {
          step: 'Retry All',
          message: 'Retrying all failed queue jobs',
          status: 'INFO',
        },
      },
    }
  );
  return { modifiedCount: result.modifiedCount };
};

/**
 * Clear completed or skipped items from the queue
 */
export const clearCompletedService = async (userId) => {
  const result = await AutomationQueue.deleteMany({
    userId,
    status: { $in: [QUEUE_STATUS.SUBMITTED, QUEUE_STATUS.SKIPPED] },
  });
  return { deletedCount: result.deletedCount };
};

/**
 * Comprehensive Analytics Service (Section 20 of /a..txt)
 */
export const getApplicationAnalyticsService = async (userId) => {
  if (!userId) {
    throw new appError('User ID is required', 400);
  }

  // Aggregate Jobs
  const totalJobs = await Job.countDocuments({});
  const matchedJobs = await Job.countDocuments({
    matchScore: { $gte: 70 },
  });

  // Aggregate Applications
  const applications = await JobApplication.find({ userId })
    .populate('jobId')
    .sort({ createdAt: -1 });

  const totalApplications = applications.length;
  const submittedCount = applications.filter(
    (a) =>
      a.status === 'Applied' ||
      a.status === 'sent' ||
      a.status === APPLICATION_STATUS.APPLIED
  ).length;

  const pendingCount = applications.filter(
    (a) =>
      a.status === APPLICATION_STATUS.PENDING ||
      a.status === 'processing' ||
      a.status === 'applying'
  ).length;

  const failedCount = applications.filter(
    (a) => a.status === APPLICATION_STATUS.FAILED || a.status === 'failed'
  ).length;

  const reviewCount = applications.filter(
    (a) =>
      a.status === APPLICATION_STATUS.WAITING_FOR_REVIEW ||
      a.status === 'waiting_for_user' ||
      a.status === 'waiting_for_confirmation'
  ).length;

  // Breakdown by Source
  const sourceCounts = {};
  applications.forEach((a) => {
    const src = a.jobId?.source || 'Generic Job Portal';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  // Breakdown by Role / Job Title
  const roleCounts = {};
  applications.forEach((a) => {
    const title = a.jobId?.title || a.jobTitle || 'Software Engineer';
    const normalized = title.split('-')[0].split('(')[0].trim();
    roleCounts[normalized] = (roleCounts[normalized] || 0) + 1;
  });

  // Response Rate Calculation
  const responseRate =
    submittedCount > 0
      ? Math.round(
          (applications.filter((a) => a.status === 'INTERVIEW' || a.status === 'OFFER').length /
            submittedCount) *
            100
        )
      : 0;

  // Applications over time (last 7 days / weekly)
  const timeline = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];

    const dayCount = applications.filter((a) => {
      const appDate = new Date(a.createdAt).toISOString().split('T')[0];
      return appDate === dateStr;
    }).length;

    timeline.push({
      date: dateStr,
      count: dayCount,
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
    });
  }

  return {
    overview: {
      jobsFound: totalJobs,
      matchedJobs,
      applications: totalApplications,
      submitted: submittedCount,
      pending: pendingCount,
      failed: failedCount,
      needsReview: reviewCount,
      responseRate,
    },
    sources: Object.entries(sourceCounts).map(([name, count]) => ({ name, count })),
    roles: Object.entries(roleCounts).slice(0, 5).map(([title, count]) => ({ title, count })),
    timeline,
  };
};
