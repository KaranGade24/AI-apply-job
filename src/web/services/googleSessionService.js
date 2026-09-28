import { fetchWithAuth } from './api';

/**
 * Retrieves current Google session connection status
 */
export const getGoogleSessionStatusApi = async () => {
  return await fetchWithAuth('/google-session/status');
};

/**
 * Saves Google browser session cookies or storageState
 * @param {object} payload - { storageState, cookies, sessionJson, userEmail }
 */
export const saveGoogleSessionApi = async (payload) => {
  return await fetchWithAuth('/google-session/session', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

/**
 * Disconnects the Google session
 */
export const disconnectGoogleSessionApi = async () => {
  return await fetchWithAuth('/google-session/disconnect', {
    method: 'POST',
  });
};

export default {
  getGoogleSessionStatusApi,
  saveGoogleSessionApi,
  disconnectGoogleSessionApi,
};
