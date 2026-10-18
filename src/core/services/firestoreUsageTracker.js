/**
 * Client-side Firestore Free Tier Usage Tracker.
 *
 * Tracks operations (reads, writes, deletes, cache hits) directly from database events
 * and calculates storage breakdown without triggering billable Firebase Admin or Management API calls.
 * All tracking data is persisted in browser localStorage for daily analytics.
 */

export const FIRESTORE_FREE_TIER_LIMITS = {
  DAILY_READS: 50000,
  DAILY_WRITES: 20000,
  DAILY_DELETES: 20000,
  STORAGE_MB: 1024, // 1 GB
  MONTHLY_BANDWIDTH_GB: 10,
};

const STORAGE_KEY = 'firestore_usage_tracker_v1';

// In-memory session counters
const sessionUsage = {
  reads: 0,
  writes: 0,
  deletes: 0,
  cacheHits: 0,
  startedAt: Date.now(),
};

function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function loadPersistedUsage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      date: getTodayString(),
      today: { reads: 0, writes: 0, deletes: 0, cacheHits: 0 },
      history: [],
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        date: getTodayString(),
        today: { reads: 0, writes: 0, deletes: 0, cacheHits: 0 },
        history: [],
      };
    }
    const parsed = JSON.parse(raw);
    const todayStr = getTodayString();

    if (parsed.date !== todayStr) {
      // Day has rolled over; archive previous day to history (keep last 7 days)
      const prevEntry = {
        date: parsed.date,
        reads: parsed.today?.reads || 0,
        writes: parsed.today?.writes || 0,
        deletes: parsed.today?.deletes || 0,
        cacheHits: parsed.today?.cacheHits || 0,
      };

      const history = [prevEntry, ...(parsed.history || [])].slice(0, 7);
      const freshState = {
        date: todayStr,
        today: { reads: 0, writes: 0, deletes: 0, cacheHits: 0 },
        history,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshState));
      return freshState;
    }

    return parsed;
  } catch (err) {
    console.warn('[firestoreUsageTracker] Failed to read usage from localStorage:', err);
    return {
      date: getTodayString(),
      today: { reads: 0, writes: 0, deletes: 0, cacheHits: 0 },
      history: [],
    };
  }
}

function savePersistedUsage(state) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('[firestoreUsageTracker] Failed to persist usage:', err);
  }
}

/**
 * Record a Firestore operation (called from db.js)
 * @param {'read' | 'write' | 'delete' | 'cacheHit'} type
 * @param {number} count
 */
export function recordFirestoreOperation(type, count = 1) {
  if (!count || count <= 0) return;

  // 1. Update session in-memory
  if (type === 'read') sessionUsage.reads += count;
  else if (type === 'write') sessionUsage.writes += count;
  else if (type === 'delete') sessionUsage.deletes += count;
  else if (type === 'cacheHit') sessionUsage.cacheHits += count;

  // 2. Update persistent daily store
  const state = loadPersistedUsage();
  if (type === 'read') state.today.reads = (state.today.reads || 0) + count;
  else if (type === 'write') state.today.writes = (state.today.writes || 0) + count;
  else if (type === 'delete') state.today.deletes = (state.today.deletes || 0) + count;
  else if (type === 'cacheHit') state.today.cacheHits = (state.today.cacheHits || 0) + count;

  savePersistedUsage(state);
}

/**
 * Get current real-time and daily statistics
 */
export function getFirestoreUsageStats() {
  const persisted = loadPersistedUsage();
  const today = persisted.today || { reads: 0, writes: 0, deletes: 0, cacheHits: 0 };

  const readQuotaPercent = (today.reads / FIRESTORE_FREE_TIER_LIMITS.DAILY_READS) * 100;
  const writeQuotaPercent = (today.writes / FIRESTORE_FREE_TIER_LIMITS.DAILY_WRITES) * 100;
  const deleteQuotaPercent = (today.deletes / FIRESTORE_FREE_TIER_LIMITS.DAILY_DELETES) * 100;

  return {
    today: {
      ...today,
      readQuotaPercent: Math.min(100, Math.round(readQuotaPercent * 100) / 100),
      writeQuotaPercent: Math.min(100, Math.round(writeQuotaPercent * 100) / 100),
      deleteQuotaPercent: Math.min(100, Math.round(deleteQuotaPercent * 100) / 100),
      readsRemaining: Math.max(0, FIRESTORE_FREE_TIER_LIMITS.DAILY_READS - today.reads),
      writesRemaining: Math.max(0, FIRESTORE_FREE_TIER_LIMITS.DAILY_WRITES - today.writes),
      deletesRemaining: Math.max(0, FIRESTORE_FREE_TIER_LIMITS.DAILY_DELETES - today.deletes),
    },
    session: { ...sessionUsage },
    history: persisted.history || [],
    limits: FIRESTORE_FREE_TIER_LIMITS,
  };
}

/**
 * Helper to estimate document size in bytes (UTF-8) including Firestore index overhead (~32 bytes per indexable field).
 */
function estimateDocBytes(doc) {
  if (!doc) return 0;
  try {
    const jsonStr = JSON.stringify(doc);
    // Rough UTF-8 byte length
    const rawBytes = new Blob([jsonStr]).size;
    const fieldCount = Object.keys(doc).length;
    // Firestore storage formula: document payload + ~32 bytes per indexed field + 32 bytes document overhead
    const firestoreOverhead = 32 + fieldCount * 32;
    return rawBytes + firestoreOverhead;
  } catch {
    return 100;
  }
}

/**
 * Analyze storage breakdown across active collections without any extra network requests.
 * @param {Object} data Collections dictionary (salesBills, purchaseBills, customers, suppliers, expenses, etc.)
 */
export function calculateCollectionStorage(data = {}) {
  const collectionsConfig = [
    { key: 'salesBills', label: 'Sales Invoices', color: '#3b82f6' },
    { key: 'purchaseBills', label: 'Purchase Invoices', color: '#8b5cf6' },
    { key: 'customers', label: 'Customers', color: '#10b981' },
    { key: 'suppliers', label: 'Suppliers', color: '#f59e0b' },
    { key: 'expenses', label: 'Expenses', color: '#ef4444' },
    { key: 'salesReturns', label: 'Sales Returns', color: '#06b6d4' },
    { key: 'purchaseReturns', label: 'Purchase Returns', color: '#ec4899' },
    { key: 'financeRecords', label: 'Finance Records', color: '#6366f1' },
  ];

  let totalBytes = 0;
  let totalDocs = 0;

  const collections = collectionsConfig.map((col) => {
    const items = Array.isArray(data[col.key]) ? data[col.key] : [];
    const docCount = items.length;
    let colBytes = 0;

    for (let i = 0; i < items.length; i++) {
      colBytes += estimateDocBytes(items[i]);
    }

    totalBytes += colBytes;
    totalDocs += docCount;

    return {
      key: col.key,
      label: col.label,
      color: col.color,
      count: docCount,
      bytes: colBytes,
      kb: Math.round((colBytes / 1024) * 10) / 10,
      mb: Math.round((colBytes / (1024 * 1024)) * 1000) / 1000,
    };
  });

  const totalKb = Math.round((totalBytes / 1024) * 10) / 10;
  const totalMb = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;
  const storageLimitMb = FIRESTORE_FREE_TIER_LIMITS.STORAGE_MB;
  const storagePercent = Math.min(100, (totalMb / storageLimitMb) * 100);

  // Add percentage share for each collection
  const collectionsWithShare = collections.map((col) => ({
    ...col,
    sharePercent: totalBytes > 0 ? Math.round((col.bytes / totalBytes) * 1000) / 10 : 0,
  }));

  return {
    totalDocs,
    totalBytes,
    totalKb,
    totalMb,
    storageLimitMb,
    storagePercent: Math.round(storagePercent * 1000) / 1000, // precise decimal e.g. 0.052%
    collections: collectionsWithShare,
  };
}
