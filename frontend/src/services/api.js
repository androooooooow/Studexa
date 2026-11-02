import axios from 'axios';
import {
  clearStoredSession,
  getStoredSessionToken,
  setStoredSession,
} from './session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredSessionToken();
  if (token) {
    config.headers['X-Session-Token'] = token;
  }
  return config;
});

export async function fetchHealth() {
  const response = await apiClient.get('/api/health');
  return response.data;
}

export async function createAnonymousSession() {
  const response = await apiClient.post('/api/session');
  const data = response.data;
  setStoredSession(data.session_token, data.session_id);
  return data;
}

export async function fetchMySession() {
  const response = await apiClient.get('/api/session/me');
  return response.data;
}

export async function initializeOrRestoreSession() {
  const existingToken = getStoredSessionToken();
  if (existingToken) {
    try {
      const sessionData = await fetchMySession();
      setStoredSession(existingToken, sessionData.session_id);
      return sessionData;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        clearStoredSession();
      } else {
        throw error;
      }
    }
  }
  return await createAnonymousSession();
}
