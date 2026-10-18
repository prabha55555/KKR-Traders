import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { lockAdmin } from '@/core/admin';
import { SESSION_KEYS, isSessionExpired, verifyLogin } from '@/core/auth';
import { db } from '@/core/db';
import { storage } from '@/platform';

const AuthContext = createContext(null);

const SESSION_KEY_NAMES = Object.values(SESSION_KEYS);
const SESSION_CHECK_MS = 60_000;

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

  // the previous state object is kept when nothing changed, so consumers do not re-render for nothing
  const refresh = useCallback(
    () =>
      setSession((prev) => {
        const next = readSession();
        return prev.ok === next.ok && prev.username === next.username ? prev : next;
      }),
    [],
  );

  // Re-check expiry when the PWA returns to the foreground, every minute while the tab is visible (an always-open
  // tab expires after 24 h), and when another tab logs in / out.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    // other localStorage writes (e.g. the Firestore usage tracker) are not session changes
    const onStorage = (e) => {
      if (e.key === null || SESSION_KEY_NAMES.includes(e.key)) refresh();
    };
    const timer = setInterval(onVisible, SESSION_CHECK_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const login = useCallback(async (username, password) => {
    const user = username.trim();
    // the business's own login (Settings page), else the built-in one
    if (!(await verifyLogin(user, password))) return false;
    storage.set(SESSION_KEYS.auth, 'true');
    storage.set(SESSION_KEYS.username, user);
    storage.set(SESSION_KEYS.loginTime, new Date().toISOString());
    setSession({ ok: true, username: user });
    return true;
  }, []);

  const logout = useCallback(async () => {
    Object.values(SESSION_KEYS).forEach((k) => storage.remove(k));
    db.invalidateAll();
    // the administrator's Settings access ends with the session
    lockAdmin();
    setSession({ ok: false, username: null });
  }, []);

  /** after the login was changed on the Settings page: the session continues under the new username */
  const renameSession = useCallback((user) => {
    storage.set(SESSION_KEYS.username, user);
    setSession((s) => ({ ...s, username: user }));
  }, []);

  const value = useMemo(
    () => ({ signedIn: session.ok, username: session.username, login, logout, renameSession }),
    [session, login, logout, renameSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
