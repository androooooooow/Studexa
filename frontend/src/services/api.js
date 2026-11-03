import axios from 'axios';
import {
  clearStoredSession,
  getStoredSessionToken,
  setStoredSession,
} from './session';
import {
  buildSelectablePdfFromText,
  extractTextFromPptxFile,
} from '../utils/pptxClientConverter';

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

export function formatApiError(err, fallback = 'An unexpected error occurred.') {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : '';
        const msg = item?.msg || 'Invalid input';
        return field ? `${field}: ${msg}` : msg;
      })
      .join('; ');
  }
  if (detail && typeof detail === 'object') {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  if (typeof err?.message === 'string' && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

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
  try {
    const response = await apiClient.post('/api/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000,
    });
    return response.data;
  } catch (err) {
    const isPpt = /\.(pptx|ppt)$/i.test(file?.name || '');
    if (isPpt && err?.response?.status === 400) {
      // Fallback when running backend process was started before .pptx support was added
      const extractedText = await extractTextFromPptxFile(file);
      const convertedPdfFile = buildSelectablePdfFromText(
        extractedText,
        file.name
      );
      const fallbackForm = new FormData();
      fallbackForm.append('file', convertedPdfFile);
      const retryResp = await apiClient.post(
        '/api/documents/upload',
        fallbackForm,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: 60000,
        }
      );
      return retryResp.data;
    }
    throw err;
  }
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

export async function pollJobUntilDone(jobId, onTick = null, maxWaitMs = 250000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await fetchAIJob(jobId);
    if (onTick) onTick(job);
    if (job.status === 'completed') {
      return job;
    }
    if (job.status === 'failed') {
      throw new Error(job.error_message || 'AI job failed.');
    }
    await new Promise((resolve) => setTimeout(resolve, 1800));
  }
  throw new Error('Timed out waiting for AI job in queue.');
}

/* ==================== PHASE 4: STUDY TOOLS ==================== */

export async function generateSummary({ document_id, style = 'medium' }) {
  const response = await apiClient.post('/api/summaries/generate', {
    document_id,
    style,
  });
  return response.data;
}

export async function fetchSummaries() {
  const response = await apiClient.get('/api/summaries');
  return response.data || [];
}

/* ==================== AI REVIEWER MAKER ==================== */

export async function generateReviewer({ document_id, mode = 'standard' }) {
  try {
    const response = await apiClient.post('/api/reviewers/generate', {
      document_id,
      mode,
    });
    return response.data;
  } catch (err) {
    if (err?.response?.status === 404) {
      // Fallback: if running backend process doesn't have /api/reviewers mounted yet, fallback through summary
      const response = await apiClient.post('/api/summaries/generate', {
        document_id,
        style: mode === 'in_depth' ? 'detailed' : mode === 'exam_focused' ? 'medium' : 'short',
      });
      return response.data;
    }
    throw err;
  }
}

export async function fetchReviewers() {
  try {
    const response = await apiClient.get('/api/reviewers');
    return response.data || [];
  } catch {
    return [];
  }
}

export async function generateQuiz({ document_id, question_count = 20, difficulty = 'medium', question_type = 'mixed' }) {
  try {
    const response = await apiClient.post('/api/quizzes/generate', {
      document_id,
      question_count,
      difficulty,
      question_type,
    });
    return response.data;
  } catch (err) {
    if (err?.response?.status === 422 && question_count > 5) {
      const response = await apiClient.post('/api/quizzes/generate', {
        document_id,
        question_count: 5,
        difficulty,
        question_type,
      });
      return response.data;
    }
    throw err;
  }
}

export async function fetchQuizzes(includeAnswers = false) {
  const response = await apiClient.get('/api/quizzes', {
    params: { include_answers: includeAnswers },
  });
  return response.data || [];
}

export async function submitQuiz(quizId, answers) {
  const response = await apiClient.post(`/api/quizzes/${quizId}/submit`, {
    answers,
  });
  return response.data;
}

export async function generateFlashcards({ document_id, card_count = 20 }) {
  try {
    const response = await apiClient.post('/api/flashcards/generate', {
      document_id,
      card_count,
    });
    return response.data;
  } catch (err) {
    if (err?.response?.status === 422 && card_count > 20) {
      const response = await apiClient.post('/api/flashcards/generate', {
        document_id,
        card_count: 20,
      });
      return response.data;
    }
    throw err;
  }
}

export async function fetchFlashcardDecks() {
  const response = await apiClient.get('/api/flashcards');
  return response.data || [];
}

export async function sendTutorQuestion({ document_id, question, conversation_id = null }) {
  const response = await apiClient.post('/api/tutor/chat', {
    document_id,
    question,
    conversation_id,
  });
  return response.data;
}

export async function fetchTutorConversations() {
  const response = await apiClient.get('/api/tutor/conversations');
  return response.data || [];
}

export async function fetchTutorConversationDetail(conversationId) {
  const response = await apiClient.get(`/api/tutor/conversations/${conversationId}`);
  return response.data;
}

export async function generateExam({ document_id, question_count = 20, difficulty = 'medium', question_type = 'mixed' }) {
  try {
    const response = await apiClient.post('/api/exams/generate', {
      document_id,
      question_count,
      difficulty,
      question_type,
    });
    return response.data;
  } catch (err) {
    if (err?.response?.status === 422 && question_count > 5) {
      const response = await apiClient.post('/api/exams/generate', {
        document_id,
        question_count: 5,
        difficulty,
        question_type,
      });
      return response.data;
    }
    throw err;
  }
}

export async function fetchExams() {
  const response = await apiClient.get('/api/exams');
  return response.data || [];
}

export async function submitExam(examId, answers) {
  const response = await apiClient.post(`/api/exams/${examId}/submit`, {
    answers,
  });
  return response.data;
}

export async function fetchExamAttempts() {
  const response = await apiClient.get('/api/exams/attempts');
  return response.data || [];
}

/* ==================== PHASE 5: PRODUCTIVITY & EXPORTS ==================== */

export async function fetchPlannerTasks() {
  const response = await apiClient.get('/api/planner/tasks');
  return response.data.tasks || [];
}

export async function createPlannerTask({ title, description = '', due_date = '' }) {
  const response = await apiClient.post('/api/planner/tasks', {
    title,
    description: description || null,
    due_date: due_date || null,
  });
  return response.data;
}

export async function updatePlannerTask(taskId, patch) {
  const response = await apiClient.patch(`/api/planner/tasks/${taskId}`, patch);
  return response.data;
}

export async function deletePlannerTask(taskId) {
  await apiClient.delete(`/api/planner/tasks/${taskId}`);
}

export async function fetchProgressOverview() {
  const response = await apiClient.get('/api/progress/overview');
  return response.data;
}

export async function fetchProgressActivity() {
  const response = await apiClient.get('/api/progress/activity');
  return response.data.activities || [];
}

export async function fetchLibraryMaterials() {
  const response = await apiClient.get('/api/exports');
  return response.data.materials || [];
}

export async function deleteLibraryMaterial(materialId) {
  await apiClient.delete(`/api/exports/${materialId}`);
}

export async function downloadMaterialPdf(materialId, fallbackFilename = 'study_material.pdf') {
  const response = await apiClient.get(`/api/exports/${materialId}`, {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', fallbackFilename.endsWith('.pdf') ? fallbackFilename : `${fallbackFilename}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
