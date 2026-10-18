import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordFirestoreOperation,
  getFirestoreUsageStats,
  calculateCollectionStorage,
  FIRESTORE_FREE_TIER_LIMITS,
} from '../core/services/firestoreUsageTracker';

describe('firestoreUsageTracker', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('records read, write, delete, and cacheHit operations', () => {
    recordFirestoreOperation('read', 10);
    recordFirestoreOperation('write', 2);
    recordFirestoreOperation('delete', 1);
    recordFirestoreOperation('cacheHit', 5);

    const stats = getFirestoreUsageStats();
    expect(stats.today.reads).toBeGreaterThanOrEqual(10);
    expect(stats.today.writes).toBeGreaterThanOrEqual(2);
    expect(stats.today.deletes).toBeGreaterThanOrEqual(1);
    expect(stats.today.cacheHits).toBeGreaterThanOrEqual(5);

    expect(stats.today.readsRemaining).toBe(FIRESTORE_FREE_TIER_LIMITS.DAILY_READS - stats.today.reads);
  });

  it('calculates storage and document breakdown correctly without throwing', () => {
    const mockData = {
      salesBills: [
        { invoiceNo: 'INV-001', customerName: 'Ravi', grandTotal: 500, amountPaid: 500 },
        { invoiceNo: 'INV-002', customerName: 'Suresh', grandTotal: 1200, amountPaid: 0 },
      ],
      customers: [{ name: 'Ravi', phone: '9876543210', openingBalance: 100 }],
    };

    const storage = calculateCollectionStorage(mockData);
    expect(storage.totalDocs).toBe(3);
    expect(storage.totalBytes).toBeGreaterThan(0);
    expect(storage.storageLimitMb).toBe(1024);
    expect(storage.storagePercent).toBeLessThan(1); // Small test data is < 1% of 1GB

    const salesCol = storage.collections.find((c) => c.key === 'salesBills');
    expect(salesCol.count).toBe(2);
    expect(salesCol.kb).toBeGreaterThan(0);
  });
});
