import { getDoc } from 'firebase/firestore';
import { db } from '@/core/db';
import {
  PURCHASE_LEDGER,
  SALES_LEDGER,
  computeLedger,
  partyBills,
  partyOpening,
  previousBalanceAt,
  purchaseLedgerChanges,
  returnsTotalsByInvoice,
  salesLedgerChanges,
  sameParty,
} from '@/core/ledger';
/**
 * The party ledger (core/ledger.js) and its Firestore sync (db.syncSalesLedger / syncPurchaseLedger, also behind the
 * legacy db.updateSubsequentInvoices): every bill's previous balance is the closing balance of the bill before it, the
 * first bill starts from the party's opening, and any change to a bill flows into all later bills automatically.
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
  ledgerOpening: 0,
  ...over,
});
/** Stubs the fresh collection reads of the sync and records the batched updates per document id. */
function setup(collections) {
  const writes = {};
  jest
    .spyOn(db, '_allWithIds')
    .mockImplementation(async (name) =>
      (collections[name] ?? []).map((d) => ({ ...d, __docId: d.__docId ?? String(d.invoiceNo ?? d.id) })),
    );
  jest.spyOn(db, '_applyUpdates').mockImplementation(async (name, updates) => {
    updates.forEach((u) => {
      writes[`${name}/${u.id}`] = u.fields;
    });
  });
  return writes;
}
/** Applies recorded writes to the bills (what Firestore would hold after the sync). */
const applied = (bills, writes, name = 'invoices') =>
  bills.map((b) => ({ ...b, ...(writes[`${name}/${b.invoiceNo}`] ?? {}) }));
afterEach(() => jest.restoreAllMocks());

describe('computeLedger', () => {
  test('chains closing balances: previous = closing of the bill before; the first starts from the opening', () => {
    const rows = computeLedger(
      [inv('002', 100), inv('001', 100, 0, 50, { ledgerOpening: 50 }), inv('003', 100, 120)],
      SALES_LEDGER,
    );
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
    expect(rows[0]).toMatchObject({
      grandTotal: 1150,
      balanceDue: 1150,
      totalReturns: 150,
      closingBalance: 1000,
    });
    expect(rows[1]).toMatchObject({ previousBalance: 1000, grandTotal: 1100 });
  });
  test('a return refunded in cash / bank is listed but does not lower what is owed', () => {
    const rows = computeLedger([inv('001', 1000, 1000)], SALES_LEDGER, {
      returnsByInvoice: returnsTotalsByInvoice([
        { invoiceNo: '001', returnAmount: 200, settlementType: 'refund', refundMethod: 'cash' },
        { invoiceNo: '001', returnAmount: 50, settlementType: 'adjustment' },
      ]),
    });
    expect(rows[0]).toMatchObject({ totalReturns: 250, closingBalance: -50 });
  });
  test('order: date, then the running number, then the whole number text, then creation time', () => {
    const rows = computeLedger(
      [
        inv('001', 10, 0, 0, { invoiceDate: '2026-04-01' }),
        inv('999', 10, 0, 0, { invoiceDate: '2026-03-31' }),
        inv('INV/2026-27/002', 10, 0, 0, { invoiceDate: '2026-04-02', createdAt: '2026-04-01T00:00:00Z' }),
        inv('INV/2026-27/001', 10, 0, 0, { invoiceDate: '2026-04-02', createdAt: '2026-04-09T00:00:00Z' }),
      ],
      SALES_LEDGER,
    );
    expect(rows.map((r) => r.bill.invoiceNo)).toEqual(['999', '001', 'INV/2026-27/001', 'INV/2026-27/002']);
  });
  test('purchase: a supplier credit is carried, not clamped to 0; paid from the nested payment or top-level', () => {
    const rows = computeLedger(
      [
        { invoiceNo: '001', invoiceDate: '2026-01-01', subtotal: 400, payment: { totalPaid: 1000 } },
        { invoiceNo: '002', invoiceDate: '2026-01-02', subtotal: 300, amountPaid: 0 },
        { invoiceNo: '003', invoiceDate: '2026-01-03', subtotal: 500, amountPaid: 0 },
      ],
      PURCHASE_LEDGER,
      { opening: 0 },
    );
    expect(rows.map((r) => r.closingBalance)).toEqual([-600, -300, 200]);
  });
  test('legacy bills: no paid field keeps what the bill says it owes; no subtotal / products keeps its total', () => {
    const noPaid = { ...inv('001', 1000), amountPaid: undefined, balanceDue: 300 };
    expect(computeLedger([noPaid], SALES_LEDGER)[0]).toMatchObject({ amountPaid: 700, balanceDue: 300 });
    const bare = {
      ...inv('001', 0),
      subtotal: undefined,
      products: [],
      discountAmount: 100,
      grandTotal: 900,
    };
    expect(computeLedger([bare], SALES_LEDGER)[0].grandTotal).toBe(900);
  });
});

describe('party membership', () => {
  const ravi = (no, phone, subtotal) =>
    inv(no, subtotal, 0, 0, { customerName: 'Ravi', customerPhone: phone });
  const bills = [ravi('1', '1111111111', 100), ravi('2', '2222222222', 1000), ravi('3', '', 10)];
  test('two customers sharing a name are never merged; a phone-less bill of that name joins neither', () => {
    expect(partyBills(SALES_LEDGER, bills, 'Ravi', '1111111111').map((b) => b.invoiceNo)).toEqual(['1']);
    expect(partyBills(SALES_LEDGER, bills, 'Ravi', '2222222222').map((b) => b.invoiceNo)).toEqual(['2']);
    expect(partyBills(SALES_LEDGER, bills, 'ravi', '').map((b) => b.invoiceNo)).toEqual(['3']);
  });
  test('a phone-less bill joins the only customer using that name; a phone-less party takes that phone', () => {
    const one = [ravi('1', '1111111111', 100), ravi('3', '', 10)];
    expect(partyBills(SALES_LEDGER, one, ' RAVI ', '1111111111').map((b) => b.invoiceNo)).toEqual(['1', '3']);
    expect(partyBills(SALES_LEDGER, one, 'Ravi', '').map((b) => b.invoiceNo)).toEqual(['1', '3']);
  });
  test('phones compare by their last 10 digits', () => {
    expect(partyBills(SALES_LEDGER, bills, 'x', '+91 11111 11111').map((b) => b.invoiceNo)).toEqual(['1']);
    expect(sameParty(SALES_LEDGER, { customerPhone: '0 11111 11111' }, { customerPhone: '1111111111' })).toBe(
      true,
    );
    expect(sameParty(SALES_LEDGER, { customerName: 'A' }, { customerName: ' a ' })).toBe(true);
    expect(sameParty(SALES_LEDGER, { customerName: 'A', customerPhone: '1' }, { customerName: 'A' })).toBe(
      false,
    );
  });
});

describe('previousBalanceAt / partyOpening', () => {
  test('a new bill without number or date goes after every stored bill', () => {
    const r = previousBalanceAt([inv('001', 100), inv('002', 50, 0, 100)], SALES_LEDGER, {});
    expect(r).toMatchObject({ previousBalance: 150, count: 2, totalPreviousBills: 250 });
  });
  test('a party without bills has no opening (null): the caller uses the customer / supplier record', () => {
    expect(previousBalanceAt([], SALES_LEDGER, { invoiceNo: '001' }).previousBalance).toBeNull();
  });
  test('a bill moved before every other starts from the party opening, never from its own carried balance', () => {
    const bills = [
      inv('001', 100, 0, 0, { invoiceDate: '2026-05-01' }),
      inv('002', 50, 0, 100, { invoiceDate: '2026-05-05' }),
    ];
    const r = previousBalanceAt(bills, SALES_LEDGER, { invoiceNo: '002', invoiceDate: '2026-04-30' });
    expect(r).toMatchObject({ previousBalance: 0, count: 0 });
  });
  test('the opening comes from the stamped ledgerOpening, else the first bill as stored', () => {
    expect(
      partyOpening([
        inv('002', 1, 0, 100, { ledgerOpening: 7 }),
        inv('001', 1, 0, 3, { ledgerOpening: undefined }),
      ]),
    ).toBe(7);
    expect(
      partyOpening([
        inv('002', 1, 0, 100, { ledgerOpening: undefined }),
        inv('001', 1, 0, 3, { ledgerOpening: undefined }),
      ]),
    ).toBe(3);
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
    const [unstamped] = computeLedger([inv('001', 100, 0, 25, { ledgerOpening: undefined })], SALES_LEDGER);
    expect(salesLedgerChanges(unstamped)).toEqual({ ledgerOpening: 25 });
  });
  test('purchase: top-level balanceDue is added for bills that only had the nested one; nested follows', () => {
    const bill = {
      invoiceNo: '001',
      subtotal: 100,
      previousBalance: 0,
      ledgerOpening: 0,
      grandTotal: 100,
      payment: { totalPaid: 0, balanceDue: 90 },
    };
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
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => inv('001', 100, 40) });
    await db.updateSubsequentInvoices('SLN TEX', '001');
    expect(writes['invoices/001']).toBeUndefined();
    expect(writes['invoices/002']).toEqual({ previousBalance: 60, grandTotal: 160, balanceDue: 160 });
    expect(writes['invoices/003']).toEqual({ previousBalance: 160, grandTotal: 260, balanceDue: 260 });
  });
  test('updateSubsequentInvoices does nothing when the invoice cannot be read (no name-only guess)', async () => {
    const apply = jest.spyOn(db, '_applyUpdates');
    getDoc.mockResolvedValueOnce({ exists: () => false });
    await expect(db.updateSubsequentInvoices('SLN TEX', '404')).resolves.toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
  test('other customers are never touched; a consistent ledger writes nothing', async () => {
    const writes = setup({
      invoices: [
        inv('001', 100),
        inv('002', 100, 0, 100),
        inv('003', 999, 0, 0, { customerName: 'X', customerPhone: '1' }),
      ],
      returns: [],
    });
    await db.syncSalesLedger({ customerName: 'SLN TEX', customerPhone: '9876543210' });
    expect(writes).toEqual({});
  });
  test('a sync from a phone-less bill never rewrites same-name customers that have phones', async () => {
    const bills = [
      inv('1', 100, 0, 0, { customerName: 'Ravi', customerPhone: '1111111111' }),
      inv('2', 1000, 0, 0, { customerName: 'Ravi', customerPhone: '2222222222' }),
      inv('3', 10, 0, 0, { customerName: 'Ravi', customerPhone: '' }),
    ];
    const writes = setup({ invoices: bills, returns: [] });
    await db.syncSalesLedger({ customerName: 'Ravi', customerPhone: '' });
    // only the phone-less bill is touched: it is stamped as its own (phone-less) chain
    expect(writes).toEqual({ 'invoices/3': { ledgerParty: '' } });
  });
  test('a phone-less bill stays in the chain it was put in when a namesake with another phone appears', async () => {
    const old = inv('1', 100, 0, 0, { customerName: 'Ravi', customerPhone: '', invoiceDate: '2026-05-01' });
    const later = inv('2', 50, 0, 100, {
      customerName: 'Ravi',
      customerPhone: '1111111111',
      invoiceDate: '2026-05-02',
    });
    let writes = setup({ invoices: [old, later], returns: [] });
    await db.syncSalesLedger(later);
    expect(writes['invoices/1']).toEqual({ ledgerParty: '1111111111' });
    // another customer named Ravi (different phone) gets a bill; customer 111's chain must not lose bill 1
    const stamped = applied([old, later], writes);
    const namesake = inv('3', 999, 0, 0, { customerName: 'Ravi', customerPhone: '2222222222' });
    writes = setup({ invoices: [...stamped, namesake], returns: [] });
    const rows = await db.syncSalesLedger(later);
    expect(rows.map((r) => r.bill.invoiceNo)).toEqual(['1', '2']);
    expect(writes['invoices/2']).toBeUndefined();
  });
  test("adding a phone to a never-synced party's first bill keeps the real opening (no carried balance as opening)", async () => {
    const before = inv('1', 100, 0, 100, {
      customerName: 'Ravi',
      customerPhone: '',
      ledgerOpening: undefined,
    });
    const edited = { ...before, customerPhone: '1111111111' };
    const second = inv('2', 100, 0, 200, {
      customerName: 'Ravi',
      customerPhone: '',
      ledgerOpening: undefined,
    });
    setup({ invoices: [edited, second], returns: [] });
    const rows = await db.syncSalesLedger(edited, { changedNo: '1', before });
    expect(rows.map((r) => r.previousBalance)).toEqual([100, 200]);
  });
  test("restoring a party's first bill deleted by the old web app (no ripple then) uses its own opening", async () => {
    const restored = inv('001', 100, 0, 0, { ledgerOpening: undefined, invoiceDate: '2026-05-01' });
    const second = inv('002', 50, 0, 100, { ledgerOpening: undefined, invoiceDate: '2026-05-05' });
    setup({ invoices: [restored, second], returns: [] });
    const rows = await db.syncSalesLedger(restored, { changedNo: '001', restored: true });
    expect(rows.map((r) => r.closingBalance)).toEqual([100, 150]);
  });
  test("a party's very first bill takes its opening from the customer record, not from the screen", async () => {
    const first = inv('001', 100, 0, 0, { ledgerOpening: undefined });
    const writes = setup({ invoices: [first], returns: [] });
    getDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ openingBalance: '250' }) });
    await db.syncSalesLedger(first, { changedNo: '001' });
    expect(writes['invoices/001']).toEqual({
      ledgerOpening: 250,
      previousBalance: 250,
      grandTotal: 350,
      balanceDue: 350,
    });
  });
  test('an explicit opening (customer form changed) re-bases the whole chain', async () => {
    const writes = setup({ invoices: [inv('001', 100), inv('002', 50, 0, 100)], returns: [] });
    await db.syncSalesLedger({ customerName: 'SLN TEX', customerPhone: '9876543210' }, { opening: 40 });
    expect(writes['invoices/002']).toMatchObject({ previousBalance: 140, balanceDue: 190 });
  });
  test('deleting the first invoice keeps the opening for the next one (stamped or not)', async () => {
    const removed = inv('001', 100, 0, 500, { ledgerOpening: undefined });
    const writes = setup({ invoices: [inv('002', 100, 0, 600, { ledgerOpening: undefined })], returns: [] });
    await db.syncSalesLedger(removed, { before: removed });
    expect(writes['invoices/002']).toEqual({
      ledgerOpening: 500,
      previousBalance: 500,
      grandTotal: 600,
      balanceDue: 600,
    });
  });
  test('deleting a middle invoice: the later ones stop carrying its balance', async () => {
    const removed = inv('002', 100, 0, 100);
    const writes = setup({ invoices: [inv('001', 100), inv('003', 100, 0, 200)], returns: [] });
    await db.syncSalesLedger(removed, { before: removed });
    expect(writes['invoices/003']).toEqual({ previousBalance: 100, grandTotal: 200, balanceDue: 200 });
  });
  test('moving the first bill after the second never double counts (opening from before the change)', async () => {
    // never-synced data: 001 (opening 0, 100 owed), 002 (carried 100, 50 more). The user moves 001 after 002.
    const before = inv('001', 100, 0, 0, { invoiceDate: '2026-05-01', ledgerOpening: undefined });
    const moved = { ...before, invoiceDate: '2026-05-20' };
    const second = inv('002', 50, 0, 100, { invoiceDate: '2026-05-05', ledgerOpening: undefined });
    const writes = setup({ invoices: [moved, second], returns: [] });
    const rows = await db.syncSalesLedger(moved, { changedNo: '001', before });
    expect(rows.map((r) => [r.bill.invoiceNo, r.previousBalance, r.closingBalance])).toEqual([
      ['002', 0, 50],
      ['001', 50, 150],
    ]);
    // and a later plain sync (stamped opening) keeps it that way
    const stored = applied([moved, second], writes);
    setup({ invoices: stored, returns: [] });
    const again = await db.syncSalesLedger(moved);
    expect(again[again.length - 1].closingBalance).toBe(150);
  });
  test('back-dating a bill before the first one: its own carried balance is not taken as the opening', async () => {
    const first = inv('001', 100, 0, 0, { invoiceDate: '2026-05-01' });
    const before = inv('002', 50, 0, 100, { invoiceDate: '2026-05-05' });
    const moved = { ...before, invoiceDate: '2026-04-30' };
    setup({ invoices: [first, moved], returns: [] });
    const rows = await db.syncSalesLedger(moved, { changedNo: '002', before });
    expect(rows[rows.length - 1].closingBalance).toBe(150);
  });
  test('writes go to the real document id, even when the stored invoiceNo differs', async () => {
    const writes = setup({
      invoices: [inv('001', 100, 0, 0, { grandTotal: 1, __docId: 'doc-001' })],
      returns: [],
    });
    await db.syncSalesLedger({ customerName: 'SLN TEX', customerPhone: '9876543210' });
    expect(Object.keys(writes)).toEqual(['invoices/doc-001']);
  });
  test('a read failure writes nothing and does not throw (the next sync repairs the chain)', async () => {
    jest.spyOn(db, '_allWithIds').mockRejectedValue(new Error('offline'));
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
    supplierPhone: '9000000001',
    subtotal,
    previousBalance,
    ledgerOpening: 0,
    grandTotal: subtotal + previousBalance,
    balanceDue: subtotal + previousBalance - paid,
    payment: {
      cash: paid,
      upi: 0,
      account: 0,
      totalPaid: paid,
      balanceDue: subtotal + previousBalance - paid,
    },
  });
  test('a return on an older bill lowers every later bill; a refunded one does not', async () => {
    const writes = setup({
      purchase_invoices: [pbill('001', 500), pbill('002', 300, 0, 500)],
      purchaseReturns: [
        { invoiceNo: '001', returnAmount: 100 },
        { invoiceNo: '001', returnAmount: 40, settlementType: 'refund', refundMethod: 'bank' },
      ],
    });
    await db.syncPurchaseLedger({ supplierName: 'S', supplierPhone: '9000000001' });
    expect(writes['purchase_invoices/001']).toEqual({ totalReturns: 140, adjustedBalanceDue: 400 });
    expect(writes['purchase_invoices/002']).toEqual({
      previousBalance: 400,
      grandTotal: 700,
      balanceDue: 700,
      'payment.balanceDue': 700,
    });
  });
});
