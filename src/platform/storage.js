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
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      mem.set(key, value);
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      mem.delete(key);
    }
  },
};
