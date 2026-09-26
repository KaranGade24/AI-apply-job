import { fetchWithAuth } from './api';

/**
 * Initiates or verifies Naukri browser session connection
 */
export const connectNaukriApi = async () => {
  return await fetchWithAuth('/job-sources/naukri/connect', {
    method: 'POST'
  });
};

/**
 * Retrieves current Naukri session status
 */
export const getNaukriStatusApi = async () => {
  return await fetchWithAuth('/job-sources/naukri/status');
};

/**
 * Saves manual login or imported browser session
 * @param {object} payload - { storageState, cookies, oneTimeLogin }
 */
export const saveNaukriSessionApi = async (payload) => {
  return await fetchWithAuth('/job-sources/naukri/save-session', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
};

/**
 * Disconnects the Naukri session
 */
export const disconnectNaukriApi = async () => {
  return await fetchWithAuth('/job-sources/naukri/disconnect', {
    method: 'POST'
  });
};

export default {
  connectNaukriApi,
  getNaukriStatusApi,
  saveNaukriSessionApi,
  disconnectNaukriApi
};
