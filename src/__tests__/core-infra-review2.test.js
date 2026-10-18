/**
 * Review round 2 — core infrastructure: login fail-open, device storage failures and namespacing, logo validation,
 * per-customer Firebase env check, admin timer re-arm, Settings save robustness (timeout / merge / admin only).
 * Firestore is never touched (db is stubbed); the tests never contain the administrator password.
 */
import { act, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { checkFirebaseEnv } from '../../scripts/firebaseEnvCheck.mjs';
import { AuthProvider, useAuth } from '@/app/AuthProvider';
import {
  LOGIN_UNREADABLE_MESSAGE,
  PASS_B64,
  SESSION_KEYS,
  USER_B64,
  loadLoginRecord,
  makeLoginRecord,
  verifyLogin,
} from '@/core/auth';
import {
  SAVE_TIMEOUT_MS,
  getBusiness,
  isSafeLogo,
  normalizeBusiness,
  saveBusiness,
  setBusinessForTests,
} from '@/core/business';
import { db } from '@/core/db';
import { PROJECT_ID, scopedKey } from '@/core/projectScope';
import { getLogoSrc } from '@/core/services/invoiceShare';
import { storage } from '@/platform';

const USER = atob(USER_B64);
const PASS = atob(PASS_B64);
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
const unlockAdmin = () =>
  window.sessionStorage.setItem('admin_unlocked_until', String(Date.now() + 10 * 60_000));

/** localStorage.setItem that fails (storage full) for one key only. */
function failWritesTo(key) {
  const real = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (k, v) {
    if (k === key) throw new DOMException('full', 'QuotaExceededError');
    return real.call(this, k, v);
  });
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  unlockAdmin();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('1. a changed client login cannot be bypassed with the built-in login', () => {
  test('database unreadable and no copy on the device: sign-in is refused, not defaulted', async () => {
    vi.spyOn(db, 'init').mockResolvedValue({});
    vi.spyOn(db, 'getLoginSettings').mockRejectedValue(new Error('offline'));
    await expect(loadLoginRecord()).rejects.toThrow(LOGIN_UNREADABLE_MESSAGE);
    await expect(verifyLogin(USER, PASS)).rejects.toThrow(/Could not reach the server/);
  });

  test('database read and no login stored (confirmed none): the built-in login works', async () => {
    vi.spyOn(db, 'init').mockResolvedValue({});
    vi.spyOn(db, 'getLoginSettings').mockResolvedValue(null);
    expect(await loadLoginRecord()).toBeNull();
    expect(await verifyLogin(USER, PASS)).toBe(true);
  });

  test('database unreadable but the device holds the stored login: that login is used (offline sign-in)', async () => {
    const record = await makeLoginRecord('ganesh', 'secret1');
    vi.spyOn(db, 'init').mockResolvedValue({});
    vi.spyOn(db, 'getLoginSettings').mockResolvedValueOnce(record).mockRejectedValue(new Error('offline'));
    await loadLoginRecord(); // read once: copied to the device
    expect(await verifyLogin(USER, PASS)).toBe(false);
    expect(await verifyLogin('ganesh', 'secret1')).toBe(true);
  });
});

describe('2. a refused device-storage write never leaves a stale copy', () => {
  test('storage.set reports failure', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(storage.set('k', 'v')).toBe(false);
    vi.restoreAllMocks();
    expect(storage.set('k', 'v')).toBe(true);
  });

  test('business details: the old copy is removed when the new one does not fit', async () => {
    const key = scopedKey('business_settings_v1');
    window.localStorage.setItem(key, JSON.stringify({ name: 'Old' }));
    vi.spyOn(db, 'init').mockResolvedValue({});
    vi.spyOn(db, 'saveBusinessSettings').mockResolvedValue();
    failWritesTo(key);
    await saveBusiness({ name: 'New' });
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  test('login copy: same', async () => {
    const key = scopedKey('login_settings_v1');
    window.localStorage.setItem(key, JSON.stringify({ username: 'old', passwordHash: 'x' }));
    vi.spyOn(db, 'init').mockResolvedValue({});
    vi.spyOn(db, 'getLoginSettings').mockResolvedValue(await makeLoginRecord('ganesh', 'secret1'));
    failWritesTo(key);
    await loadLoginRecord();
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});

describe('3 / 4. the logo is only ever a png / jpeg / webp data URL', () => {
  test('anything else — "bundled", javascript:, svg, quotes — becomes no logo', () => {
    expect(normalizeBusiness({ logo: LOGO }).logo).toBe(LOGO);
    expect(normalizeBusiness({ logo: 'data:image/jpeg;base64,/9j/4AAQ=' }).logo).not.toBe('');
    expect(normalizeBusiness({ logo: 'data:image/webp;base64,UklGRg==' }).logo).not.toBe('');
    for (const bad of [
      'bundled',
      'javascript:alert(1)',
      'https://evil.example/x.png',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'data:image/png;base64,AAAA" onerror="alert(1)',
      'data:text/html;base64,PGI+',
    ]) {
      expect(isSafeLogo(bad)).toBe(false);
      expect(normalizeBusiness({ logo: bad }).logo).toBe('');
    }
  });

  test('getLogoSrc returns only safe values (no bundled fetch any more)', async () => {
    setBusinessForTests({ name: 'A', logo: LOGO });
    expect(await getLogoSrc()).toBe(LOGO);
    setBusinessForTests({ name: 'A', logo: 'bundled' });
    expect(await getLogoSrc()).toBe('');
  });
});

describe('5. per-customer Firebase setup', () => {
  test('a customer mode without env fails the build; plain modes use the original project', () => {
    expect(() => checkFirebaseEnv('ganesh', {})).toThrow(/ganesh/);
    expect(checkFirebaseEnv('production', {})).toMatch(/sriram-96e71/);
    expect(checkFirebaseEnv('development', {})).toMatch(/sriram-96e71/);
  });

  test('a partial env fails in any mode; a complete one names its project', () => {
    const partial = { VITE_FIREBASE_PROJECT_ID: 'ganesh-billing', VITE_FIREBASE_API_KEY: 'k' };
    expect(() => checkFirebaseEnv('production', partial)).toThrow(/AUTH_DOMAIN, VITE_FIREBASE_APP_ID/);
    expect(() => checkFirebaseEnv('ganesh', partial)).toThrow(/incomplete/);
    const full = { ...partial, VITE_FIREBASE_AUTH_DOMAIN: 'd', VITE_FIREBASE_APP_ID: 'a' };
    expect(checkFirebaseEnv('ganesh', full)).toBe('ganesh-billing');
  });

  test('device keys are namespaced by Firebase project id', () => {
    expect(scopedKey('x')).toBe(`x@${PROJECT_ID}`);
    Object.values(SESSION_KEYS).forEach((k) => expect(k.endsWith(`@${PROJECT_ID}`)).toBe(true));
  });
});

describe('6. AuthProvider', () => {
  const signIn = (loginTime = new Date().toISOString()) => {
    window.localStorage.setItem(SESSION_KEYS.auth, 'true');
    window.localStorage.setItem(SESSION_KEYS.username, 'u');
    window.localStorage.setItem(SESSION_KEYS.loginTime, loginTime);
  };

  test('ignores localStorage writes of other keys and unchanged sessions; follows a real change', () => {
    signIn();
    let renders = 0;
    function Probe() {
      useAuth();
      renders += 1;
      return null;
    }
    render(createElement(AuthProvider, null, createElement(Probe)));
    const before = renders;
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'firestore_usage_counter' }));
    });
    expect(renders).toBe(before);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEYS.username }));
    });
    expect(renders).toBe(before);
    window.localStorage.removeItem(SESSION_KEYS.auth);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEYS.auth }));
    });
    expect(renders).toBeGreaterThan(before);
  });

  test('an always-open tab expires after 24 h (checked every minute)', () => {
    vi.useFakeTimers();
    signIn(new Date(Date.now()).toISOString());
    let signedIn = null;
    function Probe() {
      signedIn = useAuth().signedIn;
      return null;
    }
    render(createElement(AuthProvider, null, createElement(Probe)));
    expect(signedIn).toBe(true);
    act(() => {
      vi.advanceTimersByTime(25 * 3600 * 1000);
    });
    expect(signedIn).toBe(false);
  });
});

describe('8. saving the Settings', () => {
  test('fails clearly when the database never answers (offline)', async () => {
    vi.useFakeTimers();
    vi.spyOn(db, 'init').mockResolvedValue({});
    vi.spyOn(db, 'saveBusinessSettings').mockReturnValue(new Promise(() => {}));
    const result = saveBusiness({ name: 'Ganesh' }).then(
      () => 'saved',
      (e) => e.message,
    );
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS + 10);
    expect(await result).toMatch(/taking too long.*offline/);
  });

  test('only the fields the user changed go on top of the stored document (a plan changed elsewhere survives)', async () => {
    vi.spyOn(db, 'init').mockResolvedValue({});
    vi.spyOn(db, 'getBusinessSettings').mockResolvedValue({
      name: 'Ganesh',
      phones: '1',
      modulePlan: 'basic',
    });
    const save = vi.spyOn(db, 'saveBusinessSettings').mockResolvedValue();
    // the open form still holds the old plan 'all'
    const saved = await saveBusiness(
      { name: 'Ganesh Textiles', phones: '1', modulePlan: 'all' },
      { changed: ['name'] },
    );
    expect(saved).toMatchObject({ name: 'Ganesh Textiles', modulePlan: 'basic' });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ modulePlan: 'basic', name: 'Ganesh Textiles' }),
    );
    expect(getBusiness().modulePlan).toBe('basic');
  });
});

// last: it resets the module registry
describe('7. the administrator lock is re-armed after a reload', () => {
  test('the timer runs again from the stored unlock time', async () => {
    vi.useFakeTimers();
    window.sessionStorage.setItem('admin_unlocked_until', String(Date.now() + 5 * 60_000));
    vi.resetModules();
    const admin = await import('@/core/admin');
    expect(admin.isAdminUnlocked()).toBe(true);
    vi.advanceTimersByTime(5 * 60_000 + 1000);
    expect(admin.isAdminUnlocked()).toBe(false);
    expect(window.sessionStorage.getItem('admin_unlocked_until')).toBeNull();
  });
});
