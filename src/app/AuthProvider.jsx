import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { SESSION_KEYS, credentialsValid, isSessionExpired } from '@/core/auth';
import { db } from '@/core/db';
import { storage } from '@/platform';

const AuthContext = createContext(null);

function readSession() {
  if (storage.get(SESSION_KEYS.auth) !== 'true') return { ok: false, username: null };
  if (isSessionExpired(storage.get(SESSION_KEYS.loginTime))) {
    Object.values(SESSION_KEYS).forEach((k) => storage.remove(k));
    return { ok: false, username: null };
  }
  return { ok: true, username: storage.get(SESSION_KEYS.username) };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => readSession());

  const refresh = useCallback(() => setSession(readSession()), []);

  // Re-check expiry when the PWA returns to the foreground or another tab logs in / out.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', refresh);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  const login = useCallback(async (username, password) => {
    const user = username.trim();
    if (!credentialsValid(user, password)) return false;
    storage.set(SESSION_KEYS.auth, 'true');
    storage.set(SESSION_KEYS.username, user);
    storage.set(SESSION_KEYS.loginTime, new Date().toISOString());
    setSession({ ok: true, username: user });
    return true;
  }, []);

  const logout = useCallback(async () => {
    Object.values(SESSION_KEYS).forEach((k) => storage.remove(k));
    db.invalidateAll();
    setSession({ ok: false, username: null });
  }, []);

  const value = useMemo(
    () => ({ signedIn: session.ok, username: session.username, login, logout }),
    [session, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
