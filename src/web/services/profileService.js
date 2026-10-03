import { fetchWithAuth } from './api';

export const getProfileApi = async () => {
  return await fetchWithAuth('/profile');
};

export const updateProfileApi = async (profileData) => {
  return await fetchWithAuth('/profile', {
    method: 'PUT',
    body: JSON.stringify(profileData),
  });
};

export const saveReusableAnswerApi = async (answerData) => {
  return await fetchWithAuth('/profile/answers', {
    method: 'POST',
    body: JSON.stringify(answerData),
  });
};

export const syncProfileFromResumeApi = async () => {
  return await fetchWithAuth('/profile/sync-resume', {
    method: 'POST',
  });
};
