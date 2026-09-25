import { fetchWithAuth } from './api';

export const discoverJobsApi = async (searchConfig = {}, options = {}) => {
  return await fetchWithAuth('/jobs/discover', {
    method: 'POST',
    body: JSON.stringify(searchConfig),
    ...options,
  });
};

export const getDiscoveredJobsApi = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return await fetchWithAuth(`/jobs/discovered${query ? `?${query}` : ''}`);
};

export const getSkippedJobsApi = async () => {
  return await fetchWithAuth('/skipped-applications');
};

export const deleteJobApi = async (jobId) => {
  return await fetchWithAuth(`/jobs/${jobId}`, {
    method: 'DELETE',
  });
};
