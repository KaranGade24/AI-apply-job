import { fetchWithAuth } from './api';

/**
 * Retrieves current Google session connection status
 */
export const getGoogleSessionStatusApi = async () => {
  return await fetchWithAuth('/google-session/status');
};

/**
 * Launches a Playwright browser window to log in manually, automatically captures cookies, and closes window
 */
export const launchGoogleBrowserApi = async () => {
  return await fetchWithAuth('/google-session/launch-browser', {
    method: 'POST',
  });
};

/**
 * Automates 1-time Google account login with email & password, captures cookies and saves to DB
 * @param {object} credentials - { email, password, otpCode }
 */
export const loginGoogleAccountApi = async (credentials) => {
  return await fetchWithAuth('/google-session/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
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
  loginGoogleAccountApi,
  saveGoogleSessionApi,
  disconnectGoogleSessionApi,
};
