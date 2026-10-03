/**
 * ApplicationQueueService: Automated multi-application queue runner, pause, resume, retries
 */

import * as baseQueueService from '../applicationQueue.service.js';

export const getQueue = baseQueueService.getQueueService;
export const addToQueue = baseQueueService.addToQueueService;
export const processQueue = baseQueueService.processQueueService;
export const pauseQueue = baseQueueService.pauseQueueService;
export const resumeQueue = baseQueueService.resumeQueueService;
export const retryQueueItem = baseQueueService.retryQueueItemService;
export const skipQueueItem = baseQueueService.skipQueueItemService;
export const cancelQueueItem = baseQueueService.cancelQueueItemService;

export default {
  getQueue,
  addToQueue,
  processQueue,
  pauseQueue,
  resumeQueue,
  retryQueueItem,
  skipQueueItem,
  cancelQueueItem,
};
