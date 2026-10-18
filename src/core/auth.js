/**
 * Login rules — same behaviour as the original site: a hard-coded credential check (base64-obfuscated in login.js),
 * a session flag stored on the device, and automatic expiry after 24 hours.
 *
 * SECURITY NOTE: like the original this is a client-side gate only. Anyone who can reach the Firestore project can
 * read/write its data regardless of this screen (see firestore.rules). Move to Firebase Auth + real rules for production.
 */
export const SESSION_HOURS = 24;

// btoa(username) / btoa(password) — intentionally matches the requested application login.
export const USER_B64 = 'U1NKU05Z';
export const PASS_B64 = 'MjcxODE1';

export const SESSION_KEYS = { auth: 'isAuthenticated', username: 'username', loginTime: 'loginTime' };

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
