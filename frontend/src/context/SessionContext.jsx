import React, { createContext, useCallback, useEffect, useState } from 'react';
import {
  createAnonymousSession,
  fetchDocuments,
  fetchHealth,
  fetchMySession,
  initializeOrRestoreSession,
} from '../services/api';
import { clearStoredSession } from '../services/session';

export const SessionContext = createContext(null);

const ACTIVE_DOC_KEY = 'studymate_active_document_id';

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [health, setHealth] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeDocumentId, setActiveDocumentIdState] = useState(() => {
    try {
      return sessionStorage.getItem(ACTIVE_DOC_KEY) || '';
    } catch {
      return '';
    }
  });

  const setActiveDocumentId = useCallback((docId) => {
    setActiveDocumentIdState(docId || '');
    try {
      if (docId) {
        sessionStorage.setItem(ACTIVE_DOC_KEY, docId);
      } else {
        sessionStorage.removeItem(ACTIVE_DOC_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const syncDocuments = useCallback(
    async () => {
      try {
        const docs = await fetchDocuments();
        setDocuments(docs);
        setActiveDocumentIdState((prevId) => {
          const completedDocs = docs.filter((d) => d.extracted_text_status === 'completed');
          if (prevId && docs.some((d) => d.id === prevId)) {
            return prevId;
          }
          const fallbackId = completedDocs[0]?.id || docs[0]?.id || '';
          try {
            if (fallbackId) {
              sessionStorage.setItem(ACTIVE_DOC_KEY, fallbackId);
            } else {
              sessionStorage.removeItem(ACTIVE_DOC_KEY);
            }
          } catch {
            // Ignore
          }
          return fallbackId;
        });
        return docs;
      } catch {
        return [];
      }
    },
    []
  );

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const healthData = await fetchHealth();
      const sessionData = await initializeOrRestoreSession();
      setHealth(healthData);
      setSession(sessionData);
      await syncDocuments();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          'Backend server is not reachable yet. Make sure FastAPI is running on port 8000.'
      );
    } finally {
      setLoading(false);
    }
  }, [syncDocuments]);

  const refreshSession = useCallback(async () => {
    try {
      const [healthData, sessionData] = await Promise.all([
        fetchHealth(),
        fetchMySession(),
      ]);
      setHealth(healthData);
      setSession(sessionData);
      await syncDocuments();
      setError(null);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          'Unable to sync with Studexa backend.'
      );
    }
  }, [syncDocuments]);

  const resetAnonymousSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      clearStoredSession();
      setActiveDocumentId('');
      setDocuments([]);
      const newSession = await createAnonymousSession();
      setSession(newSession);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    } finally {
      setLoading(false);
    }
  }, [setActiveDocumentId]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const activeDocument =
    documents.find((d) => d.id === activeDocumentId) || null;

  return (
    <SessionContext.Provider
      value={{
        session,
        health,
        documents,
        activeDocument,
        activeDocumentId,
        setActiveDocumentId,
        syncDocuments,
        loading,
        error,
        refreshSession,
        resetAnonymousSession,
        retryConnection: bootstrap,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
