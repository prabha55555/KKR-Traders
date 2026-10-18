/**
 * Login rules: a session flag stored on the device, with automatic expiry after 24 hours.
 *
 * The username / password are the business's own, set on the Settings page and stored in ITS database
 * (`settings/login`) as a salted PBKDF2 hash — never the password itself, and never in the code. Until a business sets
 * one, the original built-in login below keeps working (a fresh installation is signed in with it once, then changed).
 * A copy of the stored login is kept on the device so signing in works offline.
 *
 * SECURITY NOTE: this is a client-side gate only. Anyone who can reach the Firestore project can read/write its data
 * regardless of this screen (see firestore.rules). Move to Firebase Auth + real rules for production.
 */
import { scopedKey } from '@/core/projectScope';
import { storage } from '@/platform';

export const SESSION_HOURS = 24;

// btoa(username) / btoa(password) of the built-in login (used until the business sets its own on the Settings page).
export const USER_B64 = 'U1NKU05Z';
export const PASS_B64 = 'MjcxODE1';

// Namespaced by Firebase project (core/projectScope.js): another customer's build on the same origin never shares them.
export const SESSION_KEYS = {
  auth: scopedKey('isAuthenticated'),
  username: scopedKey('username'),
  loginTime: scopedKey('loginTime'),
};

/** Shown when the stored login cannot be read (no connection and no copy on this device). */
export const LOGIN_UNREADABLE_MESSAGE =
  'Could not reach the server to verify your login — check your connection and try again.';

const LOGIN_CACHE_KEY = scopedKey('login_settings_v1');
const ITERATIONS = 150_000;

/** The built-in login (no login stored yet). */
export function credentialsValid(username, password) {
  try {
    return btoa(username) === USER_B64 && btoa(password) === PASS_B64;
  } catch {
    // btoa throws on non-Latin1 input — such input can never match.
    return false;
  }
}

export function isSessionExpired(loginTimeISO, now = Date.now()) {
  if (!loginTimeISO) return false; // original: no loginTime recorded => not treated as expired
  const hours = (now - new Date(loginTimeISO).getTime()) / (1000 * 60 * 60);
  return hours > SESSION_HOURS;
}

// ------------------------------------------------------------------ password hashing (Web Crypto)
const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Secure sign-in needs the app to be opened over https.');
  return s;
}

/** PBKDF2-SHA-256 of the password with the given salt (base64) — base64 result. */
export async function hashPassword(password, saltB64, iterations = ITERATIONS) {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations },
    key,
    256,
  );
  return toB64(new Uint8Array(bits));
}

/** A new stored login ({ username, passwordHash, salt, iterations }) for a username / password. */
export async function makeLoginRecord(username, password) {
  const salt = toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  return {
    username: username.trim(),
    passwordHash: await hashPassword(password, salt, ITERATIONS),
    salt,
    iterations: ITERATIONS,
  };
}

function readLoginCache() {
  try {
    const raw = storage.get(LOGIN_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLoginCache(record) {
  try {
    // a refused write (storage full) must not leave the older, possibly outdated copy behind
    if (record) {
      if (!storage.set(LOGIN_CACHE_KEY, JSON.stringify(record))) storage.remove(LOGIN_CACHE_KEY);
    } else storage.remove(LOGIN_CACHE_KEY);
  } catch {
    // only the offline copy is lost
  }
}

/**
 * The stored login of this business: from Firestore (copied to the device), else — when the database cannot be read —
 * the copy on this device. Resolves null ONLY when the database was read and holds no login ("confirmed none": the
 * built-in login may then be used). When the database cannot be read and this device has no copy, it throws
 * (message: LOGIN_UNREADABLE_MESSAGE) — otherwise a client whose login was changed could be bypassed with the
 * built-in login just by going offline on a fresh device.
 */
export async function loadLoginRecord() {
  try {
    const { db } = await import('@/core/db');
    await db.init();
    const record = await db.getLoginSettings();
    writeLoginCache(record?.passwordHash ? record : null);
    return record?.passwordHash ? record : null;
  } catch (e) {
    console.warn('Login settings could not be read; using the copy on this device.', e);
    const cached = readLoginCache();
    if (cached?.passwordHash) return cached;
    throw new Error(LOGIN_UNREADABLE_MESSAGE);
  }
}

/** Does this username / password open the app? (the business's stored login, else the built-in one) */
export async function verifyLogin(username, password, record) {
  const user = String(username ?? '').trim();
  const stored = record === undefined ? await loadLoginRecord() : record;
  if (!stored) return credentialsValid(user, password);
  if (user !== stored.username) return false;
  try {
    return (
      (await hashPassword(password, stored.salt, stored.iterations ?? ITERATIONS)) === stored.passwordHash
    );
  } catch (e) {
    console.error(e);
    return false;
  }
}

/** Problems with a new username / password, or null. */
export function validateNewLogin(username, password, confirmPassword) {
  if (!String(username ?? '').trim()) return 'Please enter a username.';
  if (String(username).trim().length < 3) return 'The username should have at least 3 characters.';
  if (String(password ?? '').length < 6) return 'The new password should have at least 6 characters.';
  if (password !== confirmPassword) return 'The two new passwords do not match.';
  return null;
}

/**
 * Settings page "Change login": the current password must be right; then the new username / password are stored
 * (hashed) in the business's database and on this device. Returns the new username.
 */
export async function changeLogin({ currentUsername, currentPassword, username, password, confirmPassword }) {
  const problem = validateNewLogin(username, password, confirmPassword);
  if (problem) throw new Error(problem);
  // checked against the login as stored now (it may have been renamed on another device since this one signed in)
  const stored = await loadLoginRecord();
  const ok = stored
    ? await verifyLogin(stored.username, currentPassword, stored)
    : credentialsValid(String(currentUsername ?? '').trim(), currentPassword);
  if (!ok) throw new Error('The current password is not correct.');
  const record = await makeLoginRecord(username, password);
  await storeLoginRecord(record);
  return record.username;
}

/** Stores a login record (makeLoginRecord) in the business's database and on this device. */
export async function storeLoginRecord(record) {
  const { db } = await import('@/core/db');
  await db.saveLoginSettings(record);
  writeLoginCache(record);
}
