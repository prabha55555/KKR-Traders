import {
  PURCHASE_LEDGER,
  SALES_LEDGER,
  computeLedger,
  partyMatcher,
  previousBalanceAt,
  salesLedgerChanges,
  purchaseLedgerChanges,
} from '@/core/ledger';

const sale = (no, date, subtotal, prev, paid = 0, over = {}) => ({
  invoiceNo: no,
  invoiceDate: date,
  customerName: 'Ravi',
  customerPhone: '1111111111',
  subtotal,
  previousBalance: prev,
  grandTotal: subtotal + prev,
  amountPaid: paid,
  balanceDue: subtotal + prev - paid,
  ...over,
});
// simulate db.syncSalesLedger over an in-memory "collection"
function sync(store, party, kind = SALES_LEDGER, changes = salesLedgerChanges) {
  const bills = store.filter(partyMatcher(kind, kind.name(party), kind.phone(party)));
  const rows = computeLedger(bills, kind);
  rows.forEach((r) => {
    const f = changes(r);
    if (f) {
      const i = store.findIndex((b) => b.invoiceNo === r.bill.invoiceNo);
      const next = { ...store[i] };
      Object.entries(f).forEach(([k, v]) => {
        if (k === 'payment.balanceDue') next.payment = { ...next.payment, balanceDue: v };
        else next[k] = v;
      });
      store[i] = next;
    }
  });
  return rows;
}
const closing = (store) => computeLedger(store, SALES_LEDGER).at(-1).closingBalance;

describe('probe math', () => {
  it('back-dating an edited non-first bill before the first one double counts', () => {
    // opening 0; A=100 unpaid, B=50 unpaid -> customer owes 150
    let store = [sale('1', '2026-05-01', 100, 0), sale('2', '2026-05-05', 50, 100)];
    sync(store, store[0]);
    expect(closing(store)).toBe(150);
    // user edits bill 2 and corrects its date to 2026-04-30 (before bill 1)
    const pb = previousBalanceAt(store, SALES_LEDGER, { invoiceNo: '2', invoiceDate: '2026-04-30' });
    console.log('edit form previous balance', pb);
    const edited = { ...store[1], invoiceDate: '2026-04-30', previousBalance: pb.previousBalance, grandTotal: 50 + pb.previousBalance, balanceDue: 50 + pb.previousBalance };
    store = [store[0], edited];
    sync(store, edited);
    console.log('after save', store.map((b) => [b.invoiceNo, b.previousBalance, b.balanceDue]), 'owes', closing(store));
    expect(closing(store)).toBe(150);
  });
  it('moving the first bill after the second double counts', () => {
    let store = [sale('1', '2026-05-01', 100, 0), sale('2', '2026-05-05', 50, 100)];
    const pb = previousBalanceAt(store, SALES_LEDGER, { invoiceNo: '1', invoiceDate: '2026-05-06' });
    console.log('edit form previous balance', pb.previousBalance);
    const edited = { ...store[0], invoiceDate: '2026-05-06', previousBalance: pb.previousBalance };
    store = [edited, store[1]];
    sync(store, edited);
    console.log('after save', store.map((b) => [b.invoiceNo, b.previousBalance, b.balanceDue]), 'owes', closing(store));
    expect(closing(store)).toBe(150);
  });
  it('legacy chain built in invoice-number order, but a lower-dated later number becomes first', () => {
    // old app ordered by number: #5 (Mar 2) opening 0, #6 entered later but dated Mar 1 carried #5's 100
    const store = [sale('5', '2026-03-02', 100, 0), sale('6', '2026-03-01', 40, 100)];
    sync(store, store[0]);
    console.log('legacy after first sync', store.map((b) => [b.invoiceNo, b.previousBalance, b.balanceDue]), 'owes', closing(store));
    expect(closing(store)).toBe(140);
  });
  it('name-only bill shared between two same-name customers flips', () => {
    const store = [
      sale('1', '2026-05-01', 100, 0, 0, { customerPhone: '1111111111' }),
      sale('2', '2026-05-02', 1000, 0, 0, { customerPhone: '2222222222' }),
      sale('3', '2026-05-03', 10, 0, 0, { customerPhone: '' }),
    ];
    sync(store, store[0]);
    const after1 = store[2].previousBalance;
    sync(store, store[1]);
    const after2 = store[2].previousBalance;
    console.log('phoneless bill prev after sync of 111:', after1, 'after sync of 222:', after2);
    // saving a phone-less "Ravi" bill merges both customers' chains
    sync(store, { customerName: 'Ravi', customerPhone: '' });
    console.log('after phoneless sync', store.map((b) => [b.invoiceNo, b.customerPhone, b.previousBalance, b.balanceDue]));
    expect(store[1].previousBalance).toBe(0);
  });
  it('purchase floor loses supplier credit', () => {
    const p = (no, date, subtotal, prev, paid) => ({
      invoiceNo: no, invoiceDate: date, supplierName: 'S', supplierPhone: '9', subtotal, previousBalance: prev,
      payment: { totalPaid: paid },
    });
    // paid 1000 advance on a 400 bill -> credit -600; next bill 300 -> credit should be -300
    const rows = computeLedger([p('1', '2026-05-01', 400, 0, 1000), p('2', '2026-05-02', 300, 0, 0), p('3', '2026-05-03', 500, 0, 0)], PURCHASE_LEDGER);
    console.log(rows.map((r) => [r.bill.invoiceNo, r.previousBalance, r.grandTotal, r.balanceDue]));
    expect(rows[2].closingBalance).toBe(200);
  });
  it('same date purchase bills with year-prefixed numbers reorder when createdAt is rewritten', () => {
    const p = (no, createdAt, subtotal) => ({
      invoiceNo: no, invoiceDate: '2026-05-01', supplierName: 'S', supplierPhone: '9', subtotal, previousBalance: 0,
      payment: { totalPaid: 0 }, createdAt,
    });
    const a = p('INV/2026-27/001', '2026-05-01T10:00:00.000Z', 100);
    const b = p('INV/2026-27/002', '2026-05-01T11:00:00.000Z', 50);
    console.log(computeLedger([a, b], PURCHASE_LEDGER).map((r) => r.bill.invoiceNo));
    // a payment on bill 001 re-saves it via savePurchaseBill -> createdAt = now
    const a2 = { ...a, createdAt: '2026-05-02T09:00:00.000Z' };
    const order = computeLedger([a2, b], PURCHASE_LEDGER).map((r) => r.bill.invoiceNo);
    console.log(order);
    expect(order[0]).toBe('INV/2026-27/001');
  });
});
