import React, { createContext, useCallback, useEffect, useState } from 'react';
import {
  createAnonymousSession,
  fetchHealth,
  fetchMySession,
  initializeOrRestoreSession,
} from '../services/api';
import { clearStoredSession } from '../services/session';

export const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthData, sessionData] = await Promise.all([
        fetchHealth(),
        initializeOrRestoreSession(),
      ]);
      setHealth(healthData);
      setSession(sessionData);
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.message ||
          'Unable to connect to StudyMate AI backend.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const [healthData, sessionData] = await Promise.all([
        fetchHealth(),
        fetchMySession(),
      ]);
      setHealth(healthData);
      setSession(sessionData);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    }
  }, []);

  const resetAnonymousSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      clearStoredSession();
      const newSession = await createAnonymousSession();
      setSession(newSession);
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <SessionContext.Provider
      value={{
        session,
        health,
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
