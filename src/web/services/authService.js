import { fetchWithAuth } from './api';

export const loginApi = async (email, password) => {
  return await fetchWithAuth('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
};

export const registerApi = async (username, email, password) => {
  return await fetchWithAuth('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
};

export const getProfileApi = async () => {
  return await fetchWithAuth('/auth/me');
};
