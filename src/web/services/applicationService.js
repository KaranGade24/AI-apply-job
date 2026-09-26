import { fetchWithAuth } from './api';

export const getApplicationsApi = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return await fetchWithAuth(`/applications${query ? `?${query}` : ''}`);
};

export const getApplicationDetailsApi = async (id) => {
  return await fetchWithAuth(`/applications/${id}`);
};

export const getApplicationByJobIdApi = async (jobId) => {
  return await fetchWithAuth(`/applications/job/${jobId}`);
};

export const previewDraftApi = async (payload) => {
  return await fetchWithAuth('/applications/preview-draft', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const createApplicationApi = async (appData) => {
  return await fetchWithAuth('/applications', {
    method: 'POST',
    body: JSON.stringify(appData),
  });
};

export const createApplicationFromJobApi = async (jobId) => {
  return await fetchWithAuth(`/applications/create-from-job/${jobId}`, {
    method: 'POST',
  });
};

export const updateApplicationStatusApi = async (id, status, options = {}) => {
  return await fetchWithAuth(`/applications/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, ...options }),
  });
};

export const tailorApplicationApi = async (id) => {
  return await fetchWithAuth(`/applications/${id}/tailor`, {
    method: 'POST',
  });
};

export const reviewEmailDraftApi = async (id, emailData) => {
  return await fetchWithAuth(`/applications/${id}/review`, {
    method: 'PUT',
    body: JSON.stringify(emailData),
  });
};

export const approveAndSendApi = async (id) => {
  return await fetchWithAuth(`/applications/${id}/approve`, {
    method: 'POST',
  });
};

export const rejectApplicationApi = async (id, reason = '') => {
  return await fetchWithAuth(`/applications/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
};

export const deleteApplicationApi = async (id) => {
  return await fetchWithAuth(`/applications/${id}`, {
    method: 'DELETE',
  });
};

export const submitMissingAnswersApi = async (id, answers = []) => {
  return await fetchWithAuth(`/applications/${id}/answers`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
};

export const saveEditedAnswersApi = async (id, answers = []) => {
  return await fetchWithAuth(`/applications/${id}/answers`, {
    method: 'PUT',
    body: JSON.stringify({ answers }),
  });
};

export const confirmFinalApplicationApi = async (id, confirmedAnswers = []) => {
  return await fetchWithAuth(`/applications/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ confirmedAnswers }),
  });
};


