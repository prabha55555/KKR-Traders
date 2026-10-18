/** Safe localStorage wrapper (private mode / blocked storage must never crash the app). */
const mem = new Map();

export const storage = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return mem.get(key) ?? null;
    }
  },
  /** Stores the value; returns false when the browser refused it (quota / blocked) and only memory holds it. */
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
      mem.delete(key);
      return true;
    } catch {
      mem.set(key, value);
      return false;
    }
  },
  remove(key) {
    mem.delete(key);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // blocked: nothing stored
    }
  },
};
