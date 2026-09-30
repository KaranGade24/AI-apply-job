import { API_BASE_URL } from '../constants/config';

export const fetchWithAuth = async (endpoint, options = {}) => {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.error || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return data;
};

/**
 * Fetches a protected file with the Authorization header and opens a blob URL in a new tab/download
 * Removes the need for passing token in query string (?token=)
 *
 * @param {string} endpoint - API path (e.g. /api/applications/123/pdf)
 * @param {string} [filename] - Suggested download filename
 * @returns {Promise<string>} Blob URL created
 */
export const openProtectedFile = async (endpoint, filename = '') => {
  const token = localStorage.getItem('token');
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    let errorMsg = `Failed to download file (${response.status})`;
    try {
      const errJson = await response.json();
      errorMsg = errJson.message || errJson.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  
  if (filename) {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
  }

  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
  return blobUrl;
};
