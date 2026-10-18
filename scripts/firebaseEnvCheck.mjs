/**
 * Build-time check of the Firebase env variables (used by vite.config.js, unit-tested in
 * src/__tests__/core-infra-review2.test.js). A customer build (`vite build --mode <customer>`) must name ITS OWN
 * Firebase project: a missing or half-filled env file fails the build instead of silently shipping another
 * customer's (the original installation's) project.
 */
export const ORIGINAL_PROJECT_ID = 'sriram-96e71';
const KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID',
];
const REQUIRED = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];
/** Modes that may build for the original installation without an env file ('test' = vitest). */
const PLAIN_MODES = ['development', 'production', 'test'];

/** The project id a build uses; throws when the env is partial, or absent in a customer mode. */
export function checkFirebaseEnv(mode, env = {}) {
  const set = KEYS.filter((k) => String(env[k] ?? '').trim());
  if (set.length === 0) {
    if (!PLAIN_MODES.includes(mode)) {
      throw new Error(
        `Firebase settings missing for mode "${mode}": create .env.${mode}.local from .env.example with the ` +
          `customer's VITE_FIREBASE_* values (see docs/NEW_CUSTOMER_SETUP.md). Refusing to build for the original ` +
          `project (${ORIGINAL_PROJECT_ID}) by accident.`,
      );
    }
    return `${ORIGINAL_PROJECT_ID} (original installation: no VITE_FIREBASE_* settings found)`;
  }
  const missing = REQUIRED.filter((k) => !String(env[k] ?? '').trim());
  if (missing.length) {
    throw new Error(`Firebase settings incomplete (mode "${mode}"): ${missing.join(', ')} missing.`);
  }
  return String(env.VITE_FIREBASE_PROJECT_ID).trim();
}
