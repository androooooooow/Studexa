import axios from 'axios';
import {
  clearStoredSession,
  getStoredSessionToken,
  setStoredSession,
} from './session';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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

/* ==================== PHASE 2: DOCUMENTS ==================== */

export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post('/api/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    timeout: 60000,
  });
  return response.data;
}

export async function fetchDocuments() {
  const response = await apiClient.get('/api/documents');
  return response.data.documents || [];
}

export async function fetchDocumentDetail(documentId) {
  const response = await apiClient.get(`/api/documents/${documentId}`);
  return response.data;
}

export async function deleteDocument(documentId) {
  await apiClient.delete(`/api/documents/${documentId}`);
}

/* ==================== PHASE 3: AI JOB QUEUE ==================== */

export async function createAIJob({ job_type, document_id = null, prompt = '', options = {} }) {
  const response = await apiClient.post('/api/ai/jobs', {
    job_type,
    document_id,
    prompt,
    options,
  });
  return response.data;
}

export async function fetchAIJobs() {
  const response = await apiClient.get('/api/ai/jobs');
  return response.data;
}

export async function fetchAIJob(jobId) {
  const response = await apiClient.get(`/api/ai/jobs/${jobId}`);
  return response.data;
}

export async function cancelAIJob(jobId) {
  await apiClient.delete(`/api/ai/jobs/${jobId}`);
}
