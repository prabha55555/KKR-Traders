import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * The Firebase project of THIS installation. Every business that buys the app gets its own Firebase project, so its
 * bills, stock and settings never mix with another business's: the build reads the project from VITE_FIREBASE_*
 * variables in an env file (see .env.example and docs/NEW_CUSTOMER_SETUP.md — e.g. `.env.<customer>.local`, built
 * with `vite build --mode <customer>`). A build without them uses the original project below (the first installation).
 * The client-side config is public by design; access is governed by Firestore rules.
 */
const env = import.meta.env ?? {};

const ORIGINAL_PROJECT = {
  apiKey: 'AIzaSyCoa2ccdHrkcBghoHJFjDgwGAXdqrX0gGA',
  authDomain: 'sriram-96e71.firebaseapp.com',
  projectId: 'sriram-96e71',
  storageBucket: 'sriram-96e71.firebasestorage.app',
  messagingSenderId: '78011031388',
  appId: '1:78011031388:web:7e338f33f606ec540aeb99',
  measurementId: 'G-ST1N907HZ9',
};

const ENV_KEYS = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  storageBucket: 'VITE_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'VITE_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'VITE_FIREBASE_APP_ID',
  measurementId: 'VITE_FIREBASE_MEASUREMENT_ID',
};
const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'];

/**
 * The config from the env variables when any is set (then the required ones must all be there, so a half-filled env
 * file can never mix one project's key with another's id), else the original project.
 */
export function resolveFirebaseConfig(vars = env) {
  const fromEnv = Object.fromEntries(
    Object.entries(ENV_KEYS)
      .map(([field, key]) => [field, String(vars[key] ?? '').trim()])
      .filter(([, value]) => value),
  );
  if (Object.keys(fromEnv).length === 0) return { ...ORIGINAL_PROJECT };
  const missing = REQUIRED.filter((field) => !fromEnv[field]).map((field) => ENV_KEYS[field]);
  if (missing.length) {
    throw new Error(`Firebase settings incomplete in the env file: ${missing.join(', ')} missing.`);
  }
  return fromEnv;
}

export const firebaseConfig = resolveFirebaseConfig();

let app = null;
let firestore = null;
let analytics = null;

export function getFirebaseApp() {
  if (!app) app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return app;
}

export function getFirebaseAnalytics() {
  // analytics only when the project has a measurement id
  if (!firebaseConfig.measurementId) return null;
  if (!analytics) analytics = getAnalytics(getFirebaseApp());
  return analytics;
}

export function getDb() {
  if (firestore) return firestore;
  const a = getFirebaseApp();
  try {
    firestore = initializeFirestore(a, {
      // IndexedDB persistence with multi-tab support (the original app called enablePersistence({ synchronizeTabs })):
      // reads keep working offline and the PWA opens with the last synced data.
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      // Optional fields left `undefined` by the UI are dropped instead of rejecting the write.
      ignoreUndefinedProperties: true,
    });
  } catch {
    // Already initialised (hot reload) — reuse the existing instance.
    firestore = getFirestore(a);
  }
  return firestore;
}
