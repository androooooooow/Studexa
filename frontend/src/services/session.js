const SESSION_TOKEN_KEY = 'studymate_anonymous_session_token';
const SESSION_ID_KEY = 'studymate_anonymous_session_id';

export function getStoredSessionToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredSessionId() {
  try {
    return localStorage.getItem(SESSION_ID_KEY);
  } catch {
    return null;
  }
}

export function setStoredSession(sessionToken, sessionId) {
  try {
    if (sessionToken) {
      localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
    }
    if (sessionId) {
      localStorage.setItem(SESSION_ID_KEY, sessionId);
    }
  } catch {
    // Ignore storage errors in restricted browser environments
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_ID_KEY);
  } catch {
    // Ignore storage errors
  }
}
