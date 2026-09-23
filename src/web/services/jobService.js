import { fetchWithAuth } from './api';

export const discoverJobsApi = async (searchConfig = {}) => {
  return await fetchWithAuth('/jobs/discover', {
    method: 'POST',
    body: JSON.stringify(searchConfig),
  });
};

export const getDiscoveredJobsApi = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return await fetchWithAuth(`/jobs/discovered${query ? `?${query}` : ''}`);
};

export const getSkippedJobsApi = async () => {
  return await fetchWithAuth('/skipped-applications');
};
