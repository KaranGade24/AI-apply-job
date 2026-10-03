import * as queueService from '../services/applicationQueue.service.js';

export const addToQueue = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { jobIds } = req.body || {};
    const items = await queueService.addJobsToQueueService(userId, jobIds);
    return res.status(201).json({
      success: true,
      message: `Enqueued ${items.length} job(s)`,
      data: items,
    });
  } catch (error) {
    next(error);
  }
};

export const getQueue = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await queueService.getQueueService(userId);
    return res.status(200).json({
      success: true,
      data: result.items,
      stats: result.stats,
      isPaused: result.isPaused,
    });
  } catch (error) {
    next(error);
  }
};

export const pauseQueue = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await queueService.pauseQueueService(userId);
    return res.status(200).json({
      success: true,
      message: 'Queue paused',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const resumeQueue = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await queueService.resumeQueueService(userId);
    return res.status(200).json({
      success: true,
      message: 'Queue resumed',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const cancelQueueItem = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const item = await queueService.cancelQueueItemService(userId, id);
    return res.status(200).json({
      success: true,
      message: 'Queue item cancelled',
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export const skipQueueItem = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const item = await queueService.skipQueueItemService(userId, id);
    return res.status(200).json({
      success: true,
      message: 'Queue item skipped',
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export const retryQueueItem = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { id } = req.params;
    const item = await queueService.retryQueueItemService(userId, id);
    return res.status(200).json({
      success: true,
      message: 'Queue item scheduled for retry',
      data: item,
    });
  } catch (error) {
    next(error);
  }
};

export const retryAllFailed = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await queueService.retryAllFailedService(userId);
    return res.status(200).json({
      success: true,
      message: `Retrying ${result.modifiedCount} failed job(s)`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const clearCompleted = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const result = await queueService.clearCompletedService(userId);
    return res.status(200).json({
      success: true,
      message: `Cleared ${result.deletedCount} completed/skipped job(s)`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalytics = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const analytics = await queueService.getApplicationAnalyticsService(userId);
    return res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    next(error);
  }
};
