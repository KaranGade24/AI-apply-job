import { fetchWithAuth } from './api';

export const getApplicationsApi = async () => {
  return await fetchWithAuth('/applications');
};

export const createApplicationApi = async (appData) => {
  return await fetchWithAuth('/applications', {
    method: 'POST',
    body: JSON.stringify(appData),
  });
};

export const updateApplicationStatusApi = async (id, status) => {
  return await fetchWithAuth(`/applications/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
};
