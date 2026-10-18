/**
 * Device-storage keys are namespaced by Firebase project id, so two customers' builds served from one origin (e.g.
 * localhost during setup) never share a cached login, business details or signed-in session. Kept free of Firebase
 * imports (it only reads the same env variable as core/firebase.js). Old, un-namespaced keys are simply ignored.
 */
const ORIGINAL_PROJECT_ID = 'sriram-96e71';

export const PROJECT_ID =
  String(import.meta.env?.VITE_FIREBASE_PROJECT_ID ?? '').trim() || ORIGINAL_PROJECT_ID;

/** `key` made specific to this build's Firebase project. */
export const scopedKey = (key) => `${key}@${PROJECT_ID}`;
