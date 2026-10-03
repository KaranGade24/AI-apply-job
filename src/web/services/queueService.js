import { fetchWithAuth } from './api';

export const getQueueApi = async () => {
  return await fetchWithAuth('/queue');
};

export const addJobsToQueueApi = async (jobIds) => {
  return await fetchWithAuth('/queue/add', {
    method: 'POST',
    body: JSON.stringify({ jobIds }),
  });
};

export const pauseQueueApi = async () => {
  return await fetchWithAuth('/queue/pause', {
    method: 'POST',
  });
};

export const resumeQueueApi = async () => {
  return await fetchWithAuth('/queue/resume', {
    method: 'POST',
  });
};

export const cancelQueueItemApi = async (id) => {
  return await fetchWithAuth(`/queue/${id}/cancel`, {
    method: 'POST',
  });
};

export const skipQueueItemApi = async (id) => {
  return await fetchWithAuth(`/queue/${id}/skip`, {
    method: 'POST',
  });
};

export const retryQueueItemApi = async (id) => {
  return await fetchWithAuth(`/queue/${id}/retry`, {
    method: 'POST',
  });
};

export const retryAllFailedApi = async () => {
  return await fetchWithAuth('/queue/retry-failed', {
    method: 'POST',
  });
};

export const clearCompletedQueueApi = async () => {
  return await fetchWithAuth('/queue/clear-completed', {
    method: 'DELETE',
  });
};

export const getAnalyticsApi = async () => {
  return await fetchWithAuth('/queue/analytics');
};
