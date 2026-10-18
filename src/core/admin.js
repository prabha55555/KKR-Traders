/**
 * The Brightlight Solutions administrator. Only the administrator can open the Settings page (the client's business
 * details, module plan and the client's login); the client cannot. The same administrator login in every installation.
 *
 * Stored as a salted PBKDF2-SHA-256 hash, never the password itself. To change it, run
 *     node scripts/admin-hash.mjs "<new password>"
 * and paste the printed values into ADMIN_ACCOUNT below.
 *
 * Unlocking lasts ADMIN_MINUTES in this browser tab (sessionStorage) and ends on logout or "Lock".
 * NOTE: like the app login this is checked in the app; the database itself is protected only by firestore.rules.
 */
import { hashPassword, makeLoginRecord, storeLoginRecord, validateNewLogin } from '@/core/auth';

export const ADMIN_ACCOUNT = {
  username: '7845081278',
  salt: '9eRppSFV9fNR2PGc0Qtpsg==',
  iterations: 600000,
  passwordHash: 'N4by/2L5oRPbJo6rJxpiAdi9+H57u0YZlAysIrYTII0=',
};

export const ADMIN_MINUTES = 30;
const KEY = 'admin_unlocked_until';
const listeners = new Set();
let lockTimer = null;

function session() {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}
const notify = () => listeners.forEach((fn) => fn());

/** Is the administrator signed in on this tab right now? */
export function isAdminUnlocked(now = Date.now()) {
  const until = Number(session()?.getItem(KEY) ?? 0);
  return until > now;
}
/** When the unlock ends (ms), or 0. */
export function adminUnlockedUntil() {
  return Number(session()?.getItem(KEY) ?? 0);
}

export function subscribeAdmin(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Do these match the administrator login? */
export async function verifyAdmin(username, password) {
  if (String(username ?? '').trim() !== ADMIN_ACCOUNT.username) return false;
  try {
    const hash = await hashPassword(String(password ?? ''), ADMIN_ACCOUNT.salt, ADMIN_ACCOUNT.iterations);
    return hash === ADMIN_ACCOUNT.passwordHash;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/** Ends the administrator session on this tab. */
export function lockAdmin() {
  clearTimeout(lockTimer);
  lockTimer = null;
  try {
    session()?.removeItem(KEY);
  } catch {
    // nothing stored
  }
  notify();
}

/** Signs the administrator in for ADMIN_MINUTES; false when the login is wrong. */
export async function unlockAdmin(username, password) {
  if (!(await verifyAdmin(username, password))) return false;
  const until = Date.now() + ADMIN_MINUTES * 60_000;
  try {
    session()?.setItem(KEY, String(until));
  } catch {
    return false;
  }
  clearTimeout(lockTimer);
  lockTimer = setTimeout(lockAdmin, ADMIN_MINUTES * 60_000);
  notify();
  return true;
}

/**
 * Administrator: sets the client's own app login (no need to know the client's current password). Stored as a hash in
 * the client's database; the default login stops working. Returns the new username.
 */
export async function setClientLogin({ username, password, confirmPassword }) {
  if (!isAdminUnlocked())
    throw new Error('Only the administrator can change the login. Please unlock Settings again.');
  const problem = validateNewLogin(username, password, confirmPassword);
  if (problem) throw new Error(problem);
  const record = await makeLoginRecord(username, password);
  await storeLoginRecord(record);
  return record.username;
}
