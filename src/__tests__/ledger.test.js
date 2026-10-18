import { db } from '@/core/db';
import {
  PURCHASE_LEDGER,
  SALES_LEDGER,
  computeLedger,
  partyMatcher,
  previousBalanceAt,
  purchaseLedgerChanges,
  returnsTotalsByInvoice,
  salesLedgerChanges,
} from '@/core/ledger';
/**
 * The party ledger (core/ledger.js) and its Firestore sync (db.syncSalesLedger / syncPurchaseLedger, also behind the
 * legacy db.updateSubsequentInvoices): every bill's previous balance is the closing balance of the bill before it, and
 * any change to a bill flows into all later bills automatically.
 */
const inv = (no, subtotal, paid = 0, previousBalance = 0, over = {}) => ({
  invoiceNo: no,
  invoiceDate: '2026-05-10',
  customerName: 'SLN TEX',
  customerAddress: '',
  customerPhone: '9876543210',
  products: [{ description: 'X', qty: 1, rate: subtotal, amount: subtotal }],
  subtotal,
  previousBalance,
  grandTotal: subtotal + previousBalance,
  amountPaid: paid,
  balanceDue: subtotal + previousBalance - paid,
  ...over,
});
/** Stubs the fresh collection reads of the sync and records the batched updates per document id. */
function setup(collections) {
  const writes = {};
  jest.spyOn(db, '_all').mockImplementation(async (name) => collections[name] ?? []);
  jest.spyOn(db, '_applyUpdates').mockImplementation(async (name, updates) => {
    updates.forEach((u) => {
      writes[`${name}/${u.id}`] = u.fields;
    });
  });
  return writes;
}
afterEach(() => jest.restoreAllMocks());

describe('computeLedger', () => {
  test('chains closing balances: previous = closing of the bill before; the first keeps its opening', () => {
    const rows = computeLedger([inv('002', 100), inv('001', 100, 0, 50), inv('003', 100, 120)], SALES_LEDGER);
    expect(rows.map((r) => r.bill.invoiceNo)).toEqual(['001', '002', '003']);
    expect(rows.map((r) => r.previousBalance)).toEqual([50, 150, 250]);
    expect(rows.map((r) => r.grandTotal)).toEqual([150, 250, 350]);
    expect(rows.map((r) => r.closingBalance)).toEqual([150, 250, 230]);
  });
  test('no double counting with several bills (the web ripple gave 400 for the third bill)', () => {
    const rows = computeLedger([inv('001', 100), inv('002', 100), inv('003', 100)], SALES_LEDGER);
    expect(rows[2].grandTotal).toBe(300);
  });
  test('discount, opening balance and returns are all part of the chain', () => {
    const rows = computeLedger(
      [inv('001', 1000, 0, 0, { manualPreviousBalance: 200, discountAmount: 50 }), inv('002', 100)],
      SALES_LEDGER,
      { returnsByInvoice: returnsTotalsByInvoice([{ invoiceNo: '001', returnAmount: '150' }]) },
    );
    expect(rows[0]).toMatchObject({ grandTotal: 1150, balanceDue: 1150, totalReturns: 150, closingBalance: 1000 });
    expect(rows[1]).toMatchObject({ previousBalance: 1000, grandTotal: 1100 });
  });
  test('order: date, then number (financial-year restarts), then creation time', () => {
    const rows = computeLedger(
      [
        inv('001', 10, 0, 0, { invoiceDate: '2026-04-01' }),
        inv('999', 10, 0, 0, { invoiceDate: '2026-03-31' }),
        inv('002', 10, 0, 0, { invoiceDate: '2026-04-01', createdAt: '2026-04-01T10:00:00Z' }),
      ],
      SALES_LEDGER,
    );
    expect(rows.map((r) => r.bill.invoiceNo)).toEqual(['999', '001', '002']);
  });
  test('purchase: grand total never below zero, paid read from the nested payment or top-level fields', () => {
    const rows = computeLedger(
      [
        { invoiceNo: '001', invoiceDate: '2026-01-01', subtotal: 100, previousBalance: -300, payment: { totalPaid: 0 } },
        { invoiceNo: '002', invoiceDate: '2026-01-02', subtotal: 500, amountPaid: 100 },
      ],
      PURCHASE_LEDGER,
    );
    expect(rows[0]).toMatchObject({ grandTotal: 0, balanceDue: 0 });
    expect(rows[1]).toMatchObject({ previousBalance: 0, grandTotal: 500, balanceDue: 400 });
  });
  test('a legacy bill without any paid field keeps what it says it owes', () => {
    const legacy = { ...inv('001', 1000), amountPaid: undefined, balanceDue: 300 };
    expect(computeLedger([legacy], SALES_LEDGER)[0]).toMatchObject({ amountPaid: 700, balanceDue: 300 });
  });
});

describe('previousBalanceAt / partyMatcher', () => {
  test('phone wins when both sides have one, otherwise the case-insensitive name', () => {
    const match = partyMatcher(SALES_LEDGER, ' sln tex ', '9876543210');
    expect(match(inv('1', 1))).toBe(true);
    expect(match(inv('1', 1, 0, 0, { customerPhone: '1111111111' }))).toBe(false);
    expect(match(inv('1', 1, 0, 0, { customerPhone: '' }))).toBe(true);
    expect(partyMatcher(SALES_LEDGER, '', '')(inv('1', 1, 0, 0, { customerPhone: '' }))).toBe(false);
  });
  test('a new bill without number or date goes after every stored bill', () => {
    const r = previousBalanceAt([inv('001', 100), inv('002', 50, 0, 100)], SALES_LEDGER, {});
    expect(r).toMatchObject({ previousBalance: 150, count: 2, totalPreviousBills: 250 });
  });
  test('a party without bills has no anchor (null): the caller uses the opening balance', () => {
    expect(previousBalanceAt([], SALES_LEDGER, { invoiceNo: '001' }).previousBalance).toBeNull();
  });
  test('a bill back-dated before every other takes over their opening balance', () => {
    const r = previousBalanceAt([inv('005', 100, 0, 75)], SALES_LEDGER, { invoiceNo: '006', invoiceDate: '2026-01-01' });
    expect(r).toMatchObject({ previousBalance: 75, count: 0 });
  });
});

describe('changes written back', () => {
  test('only differing fields; returns fields only when the bill has returns or already stores them', () => {
    const [row] = computeLedger([inv('001', 100)], SALES_LEDGER);
    expect(salesLedgerChanges(row)).toBeNull();
    const [stale] = computeLedger([inv('001', 100, 0, 0, { grandTotal: 90 })], SALES_LEDGER);
    expect(salesLedgerChanges(stale)).toEqual({ grandTotal: 100 });
    const [withReturns] = computeLedger([inv('001', 100)], SALES_LEDGER, {
      returnsByInvoice: returnsTotalsByInvoice([{ invoiceNo: '001', returnAmount: 30 }]),
    });
    expect(salesLedgerChanges(withReturns)).toEqual({ totalReturns: 30, adjustedBalanceDue: 70 });
  });
  test('purchase: top-level balanceDue is added for bills that only had the nested one; nested follows', () => {
    const bill = { invoiceNo: '001', subtotal: 100, previousBalance: 0, grandTotal: 100, payment: { totalPaid: 0, balanceDue: 90 } };
    const [row] = computeLedger([bill], PURCHASE_LEDGER);
    expect(purchaseLedgerChanges(row)).toEqual({ balanceDue: 100, 'payment.balanceDue': 100 });
  });
});

describe('db.syncSalesLedger / updateSubsequentInvoices', () => {
  test('a payment on an older invoice flows into every later invoice', async () => {
    // 001 got 40 paid after 002 and 003 were written
    const writes = setup({
      invoices: [inv('001', 100, 40), inv('002', 100, 0, 100), inv('003', 100, 0, 200)],
      returns: [],
    });
    await db.updateSubsequentInvoices('SLN TEX', '001');
    expect(writes['invoices/001']).toBeUndefined();
    expect(writes['invoices/002']).toEqual({ previousBalance: 60, grandTotal: 160, balanceDue: 160 });
    expect(writes['invoices/003']).toEqual({ previousBalance: 160, grandTotal: 260, balanceDue: 260 });
  });
  test('other customers are never touched; a consistent ledger writes nothing', async () => {
    const writes = setup({
      invoices: [inv('001', 100), inv('002', 100, 0, 100), inv('003', 999, 0, 0, { customerName: 'X', customerPhone: '1' })],
      returns: [],
    });
    await db.syncSalesLedger({ customerName: 'SLN TEX', customerPhone: '9876543210' });
    expect(writes).toEqual({});
  });
  test('deleting the first invoice hands its opening balance to the next one', async () => {
    const removed = inv('001', 100, 0, 500);
    const writes = setup({ invoices: [inv('002', 100, 0, 600)], returns: [] });
    await db.syncSalesLedger(removed, { removed });
    expect(writes['invoices/002']).toEqual({ previousBalance: 500, grandTotal: 600, balanceDue: 600 });
  });
  test('deleting a middle invoice: the later ones stop carrying its balance', async () => {
    const removed = inv('002', 100, 0, 100);
    const writes = setup({ invoices: [inv('001', 100), inv('003', 100, 0, 200)], returns: [] });
    await db.syncSalesLedger(removed, { removed });
    expect(writes['invoices/003']).toEqual({ previousBalance: 100, grandTotal: 200, balanceDue: 200 });
  });
  test('a read failure writes nothing and does not throw (the next sync repairs the chain)', async () => {
    jest.spyOn(db, '_all').mockRejectedValue(new Error('offline'));
    const apply = jest.spyOn(db, '_applyUpdates');
    await expect(db.syncSalesLedger(inv('001', 1))).resolves.toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('db.syncPurchaseLedger', () => {
  const pbill = (no, subtotal, paid = 0, previousBalance = 0) => ({
    invoiceNo: no,
    invoiceDate: '2026-05-10',
    supplierName: 'S',
    supplierPhone: '9',
    subtotal,
    previousBalance,
    grandTotal: subtotal + previousBalance,
    balanceDue: subtotal + previousBalance - paid,
    payment: { cash: paid, upi: 0, account: 0, totalPaid: paid, balanceDue: subtotal + previousBalance - paid },
  });
  test('a return on an older bill lowers every later bill', async () => {
    const writes = setup({
      purchase_invoices: [pbill('001', 500), pbill('002', 300, 0, 500)],
      purchaseReturns: [{ invoiceNo: '001', returnAmount: 100 }],
    });
    await db.syncPurchaseLedger({ supplierName: 'S', supplierPhone: '9' });
    expect(writes['purchase_invoices/001']).toEqual({ totalReturns: 100, adjustedBalanceDue: 400 });
    expect(writes['purchase_invoices/002']).toEqual({
      previousBalance: 400,
      grandTotal: 700,
      balanceDue: 700,
      'payment.balanceDue': 700,
    });
  });
});
