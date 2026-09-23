import { fetchWithAuth } from './api';

export const getSettingsApi = async () => {
  return await fetchWithAuth('/settings');
};

export const updateSettingsApi = async (settingsData) => {
  return await fetchWithAuth('/settings', {
    method: 'PUT',
    body: JSON.stringify(settingsData),
  });
};
