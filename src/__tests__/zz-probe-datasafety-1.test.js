import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/core/db';
import { saveSalesBill, emptySalesForm } from '@/core/services/salesBill';
import { calculatePreviousBalanceAtTime } from '@/core/billing';
import * as fs from 'firebase/firestore';

let collections;
let writes;
const inv = (no, date, phone, name, extra = {}) => ({
  invoiceNo: no,
  invoiceDate: date,
  customerName: name,
  customerPhone: phone,
  subtotal: 1000,
  previousBalance: 0,
  manualPreviousBalance: 0,
  discountAmount: 0,
  amountPaid: 0,
  grandTotal: 1000,
  balanceDue: 1000,
  ...extra,
});
function apply(name, updates) {
  updates.forEach((u) => {
    const d = collections[name].find((b) => String(b.invoiceNo) === String(u.id));
    Object.assign(d, u.fields);
  });
}
beforeEach(() => {
  vi.restoreAllMocks();
  collections = { invoices: [], returns: [], purchase_invoices: [], purchaseReturns: [] };
  writes = [];
  vi.spyOn(db, '_all').mockImplementation(async (n) => collections[n].map((d) => ({ ...d })));
  vi.spyOn(db, '_applyUpdates').mockImplementation(async (n, u) => {
    writes.push(...u.map((x) => ({ n, ...x })));
    apply(n, u);
  });
});

describe('probe', () => {
  it('phone-less sale for "Ravi" rewrites another Ravi customer bills (cross-party write)', async () => {
    // Ravi A (phone ...01): 001 opening 500 ; Ravi B (phone ...02): 002 opening 0
    collections.invoices = [
      inv('001', '2025-05-01', '9000000001', 'Ravi', { previousBalance: 500, grandTotal: 1500, balanceDue: 1500 }),
      inv('002', '2025-05-02', '9000000002', 'Ravi'),
    ];
    // walk-in, no phone
    await db.syncSalesLedger({ customerName: 'Ravi', customerPhone: '' });
    console.log('WRITES', JSON.stringify(writes));
    const b2 = collections.invoices.find((b) => b.invoiceNo === '002');
    expect(b2.previousBalance).toBe(1500); // Ravi B's bill now carries Ravi A's balance

    // Later, Ravi B's own sync: 002 is first in its chain -> corrupted 1500 is now the opening anchor forever
    writes = [];
    await db.syncSalesLedger({ customerName: 'Ravi', customerPhone: '9000000002' });
    console.log('B-SYNC WRITES', JSON.stringify(writes));
    expect(b2.previousBalance).toBe(1500);
    expect(b2.balanceDue).toBe(2500);
  });

  it('moving the first bill later makes the 2nd bill carried balance the opening (inflation)', async () => {
    // A: opening 0, sub 1000 -> 1000 ; B: prev 1000, sub 500 -> 1500
    collections.invoices = [
      inv('001', '2025-05-01', '9000000001', 'Ravi'),
      inv('002', '2025-05-02', '9000000001', 'Ravi', { subtotal: 500, previousBalance: 1000, grandTotal: 1500, balanceDue: 1500 }),
    ];
    // user fixes A's date to 2025-05-03 (typo) - this is what saveInvoice + sync would do
    collections.invoices[0].invoiceDate = '2025-05-03';
    await db.syncSalesLedger({ customerName: 'Ravi', customerPhone: '9000000001' });
    const a = collections.invoices[0];
    const b = collections.invoices[1];
    console.log('MOVE LATER', JSON.stringify({ a, b }));
    // true total owed = 1500 ; ledger now says
    expect(a.balanceDue).toBe(2500);
  });

  it('moving a later bill to before the first keeps its carried prev as opening', async () => {
    collections.invoices = [
      inv('001', '2025-05-01', '9000000001', 'Ravi'),
      inv('002', '2025-05-02', '9000000001', 'Ravi', { subtotal: 500, previousBalance: 1000, grandTotal: 1500, balanceDue: 1500 }),
    ];
    vi.spyOn(db, 'getAllInvoices').mockImplementation(async () => collections.invoices.map((d) => ({ ...d })));
    vi.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    const r = await calculatePreviousBalanceAtTime('Ravi', '9000000001', '002', '2025-04-01');
    console.log('PREV for 002 moved to 04-01', JSON.stringify(r));
    expect(r.balanceCarriedForward).toBe(1000);
  });
});
