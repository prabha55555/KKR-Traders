// Unit tests never talk to Firestore: the SDK is replaced with inert stubs (tests spy on `db` methods instead).
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// The tests were written with jest's API; vitest's `vi` is call-compatible for spyOn / fn / restoreAllMocks.
globalThis.jest = vi;

vi.mock('firebase/app', () => ({
  getApps: () => [],
  getApp: vi.fn(),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase/firestore', () => {
  class Timestamp {
    constructor(seconds, nanoseconds) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
  }
  return {
    Timestamp,
    collection: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    getFirestore: vi.fn(() => ({})),
    // live listeners: never fire in tests; return the "stop" function
    onSnapshot: vi.fn(() => () => {}),
    initializeFirestore: vi.fn(() => ({})),
    persistentLocalCache: vi.fn(() => ({})),
    persistentMultipleTabManager: vi.fn(() => ({})),
    orderBy: vi.fn(),
    query: vi.fn(),
    serverTimestamp: vi.fn(() => '__serverTimestamp__'),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    where: vi.fn(),
    writeBatch: vi.fn(() => ({ update: vi.fn(), set: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
  };
});

// Every test starts with the sample business of src/test/businessFixture.js as the saved Settings (tests that need a
// different business, or none, set their own).
beforeEach(async () => {
  const [{ setBusinessForTests }, { TEST_BUSINESS }] = await Promise.all([
    import('@/core/business'),
    import('./businessFixture'),
  ]);
  setBusinessForTests(TEST_BUSINESS);
});
