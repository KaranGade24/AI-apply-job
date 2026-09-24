import { fetchWithAuth } from './api';

export const getMyResumesApi = async () => {
  return await fetchWithAuth('/resume');
};

export const saveResumeDataApi = async (resumeData) => {
  return await fetchWithAuth('/resume/save', {
    method: 'POST',
    body: JSON.stringify({ resumeData }),
  });
};
export const generateResumePdfApi = async (resumeData, template = 'ATS Modern') => {
  return await fetchWithAuth('/resume/generate-pdf', {
    method: 'POST',
    body: JSON.stringify({
      tailoredResumeData: resumeData,
      template,
    }),
  });
};

export const parseResumeApi = async (formData) => {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/resume/upload', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to parse resume');
  }
  return data;
};

export const deleteResumeApi = async (resumeId) => {
  return await fetchWithAuth(`/resume/${resumeId}`, {
    method: 'DELETE',
  });
};
