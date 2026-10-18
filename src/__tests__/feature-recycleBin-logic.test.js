import { db } from '@/core/db';
import {
  BIN_CONFIG,
  binItemName,
  binSearchText,
  buildBinDetail,
  computeBinStats,
  daysAgo,
  daysAgoText,
  displayBillNo,
  filterBinItems,
  formatBinDate,
  formatBinDateTime,
  sortNewestFirst,
  toDate,
} from '@/features/recycleBin/binLogic';
import {
  emptyBin,
  loadBinItems,
  permanentlyDeleteBinItem,
  restoreBinItem,
} from '@/features/recycleBin/binService';
const NOW = new Date(2026, 9, 3, 12, 0, 0); // 3 Oct 2026, 12:00 local
const ts = (d) => ({ seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0, toDate: () => d });
const salesItem = (over = {}) => ({
  id: 'invoice_001_1',
  type: 'invoice',
  originalId: '001',
  data: {
    invoiceNo: '001',
    invoiceDate: '2026-09-28',
    customerName: 'SLN TEX',
    customerAddress: 'Tirupur',
    customerPhone: '9876543210',
    products: [
      { description: 'Cotton Shirt', qty: 10, rate: 120.5, amount: 1205 },
      { description: 'T Shirt', qty: 2, rate: 99, amount: 198 },
    ],
    subtotal: 1403,
    previousBalance: 300,
    grandTotal: 1703,
    amountPaid: 700,
    balanceDue: 1003,
  },
  payments: [
    {
      id: 'p1',
      invoiceNo: '001',
      paymentDate: '2026-09-28',
      amount: 500,
      paymentMethod: 'cash',
      paymentType: 'initial',
    },
    { id: 'p2', invoiceNo: '001', paymentDate: '2026-09-30', amount: 200, paymentMethod: 'upi' },
  ],
  returns: [
    {
      id: 'r1',
      invoiceNo: '001',
      returnDate: '2026-10-01',
      description: 'T Shirt',
      qty: 1,
      rate: 99,
      returnAmount: 99,
    },
  ],
  deletedAt: ts(new Date(2026, 9, 1, 10, 0, 0)),
  customerName: 'SLN TEX',
  customerPhone: '9876543210',
  invoiceDate: '2026-09-28',
  grandTotal: 1703,
  ...over,
});
const purchaseItem = (over = {}) => ({
  id: 'pinvoice_P-007_1',
  type: 'purchase_invoice',
  originalId: 'P-007',
  data: {
    invoiceNo: 'P-007',
    invoiceDate: '2026-09-20',
    supplierName: 'ABC YARNS',
    supplierPhone: '',
    supplierAddress: 'Erode',
    products: [{ description: 'Yarn 30s', qty: 4, rate: 250, amount: 1000 }],
    subtotal: 1000,
    grandTotal: 1000,
    payment: { cash: 400, upi: 0, account: 0, totalPaid: 400, balanceDue: 600 },
  },
  payments: [],
  deletedAt: ts(new Date(2026, 9, 2, 9, 0, 0)),
  supplierName: 'ABC YARNS',
  supplierPhone: '',
  invoiceDate: '2026-09-20',
  grandTotal: 1000,
  ...over,
});
afterEach(() => jest.restoreAllMocks());
describe('toDate', () => {
  test('reads live and cache-revived Timestamps, plain {seconds}, Date, ISO string, millis', () => {
    const d = new Date(2026, 9, 1, 10, 0, 0);
    expect(toDate(ts(d))?.getTime()).toBe(d.getTime());
    expect(toDate({ seconds: 1_700_000_000, nanoseconds: 500_000_000 })?.getTime()).toBe(1_700_000_000_500);
    expect(toDate(d)?.getTime()).toBe(d.getTime());
    expect(toDate('2026-10-01T04:30:00.000Z')?.getTime()).toBe(Date.UTC(2026, 9, 1, 4, 30));
    expect(toDate(1_700_000_000_000)?.getTime()).toBe(1_700_000_000_000);
  });
  test('missing / invalid values are null (the web showed 1970)', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate(undefined)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('garbage')).toBeNull();
    expect(toDate({})).toBeNull();
  });
});
describe('dates', () => {
  test('whole days ago, never negative, singular/plural', () => {
    expect(daysAgo(new Date(2026, 9, 1, 10, 0, 0), NOW)).toBe(2); // 2 d 2 h
    expect(daysAgo(new Date(2026, 9, 3, 11, 0, 0), NOW)).toBe(0);
    expect(daysAgo(new Date(2026, 9, 4, 12, 0, 0), NOW)).toBe(0); // clock skew
    expect(daysAgoText(1)).toBe('1 day ago');
    expect(daysAgoText(0)).toBe('0 days ago');
    expect(daysAgoText(2)).toBe('2 days ago');
  });
  test('en-IN formats', () => {
    expect(formatBinDate(new Date(2026, 9, 3, 14, 30, 45))).toBe('3/10/2026');
    expect(formatBinDateTime(new Date(2026, 9, 3, 14, 30, 45))).toBe('3/10/2026, 2:30:45 pm');
    expect(formatBinDateTime(new Date(2026, 0, 15, 0, 5, 9))).toBe('15/1/2026, 12:05:09 am');
    expect(formatBinDateTime(new Date(2026, 0, 15, 12, 0, 0))).toBe('15/1/2026, 12:00:00 pm');
  });
});
describe('list helpers', () => {
  test('newest deletion first; items without a date go last; ties keep order', () => {
    const a = salesItem({ id: 'a', deletedAt: ts(new Date(2026, 9, 1)) });
    const b = salesItem({ id: 'b', deletedAt: ts(new Date(2026, 9, 3)) });
    const c = salesItem({ id: 'c', deletedAt: undefined });
    const d = salesItem({ id: 'd', deletedAt: ts(new Date(2026, 9, 3)) });
    expect(sortNewestFirst([a, c, b, d]).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c']);
  });
  test('purchase bill numbers lose the "P-" prefix, sales numbers are untouched', () => {
    expect(displayBillNo(purchaseItem())).toBe('007');
    expect(displayBillNo(salesItem({ originalId: 'INV-12' }))).toBe('INV-12');
    expect(binItemName(purchaseItem())).toBe('Invoice 007');
  });
  test('search text = what the card shows (name, invoice date, deletion date + age, party, amount), lower-cased', () => {
    expect(binSearchText(salesItem(), NOW)).toBe(
      'invoice 001 28/9/2026 1/10/2026 (2 days ago) sln tex ₹1,703.00',
    );
  });
  test('search matches name, bill no, date, age text, party and amount; not the button captions', () => {
    const items = [
      salesItem(),
      salesItem({ id: 'x', originalId: '002', customerName: 'Other Co', grandTotal: 50 }),
    ];
    const ids = (term) => filterBinItems(items, 'all', term, NOW).map((i) => i.id);
    expect(ids('sln')).toEqual(['invoice_001_1']);
    expect(ids('002')).toEqual(['x']);
    expect(ids('1/10/2026')).toEqual(['invoice_001_1', 'x']);
    expect(ids('28/9/2026')).toEqual(['invoice_001_1', 'x']);
    expect(ids('2 days ago')).toEqual(['invoice_001_1', 'x']);
    expect(ids('1,703')).toEqual(['invoice_001_1']);
    expect(ids('₹50.00')).toEqual(['x']);
    expect(ids('restore')).toEqual([]);
    expect(ids('  OTHER ')).toEqual(['x']);
    expect(ids('')).toEqual(['invoice_001_1', 'x']);
  });
  test('type filter selects the bin type (purchase page bug fixed)', () => {
    const items = [purchaseItem()];
    expect(filterBinItems(items, 'purchase_invoice', '', NOW)).toHaveLength(1);
    expect(filterBinItems(items, 'invoice', '', NOW)).toHaveLength(0);
    expect(filterBinItems(items, 'all', 'abc', NOW)).toHaveLength(1);
  });
  test('stats: total, items of the bin type, age of the oldest deletion', () => {
    const items = [
      salesItem({ id: 'a', deletedAt: ts(new Date(2026, 9, 1, 10)) }),
      salesItem({ id: 'b', deletedAt: ts(new Date(2026, 8, 20, 10)) }), // 13 d 2 h
      salesItem({ id: 'c', deletedAt: undefined }),
    ];
    expect(computeBinStats(items, 'invoice', NOW)).toEqual({
      totalItems: 3,
      invoiceItems: 3,
      oldestDays: 13,
    });
    expect(computeBinStats([], 'invoice', NOW)).toEqual({ totalItems: 0, invoiceItems: 0, oldestDays: null });
    expect(computeBinStats(items, 'purchase_invoice', NOW).invoiceItems).toBe(0);
  });
});
describe('buildBinDetail', () => {
  test('sales invoice: products, totals as stored, payments and returns', () => {
    const d = buildBinDetail(salesItem(), BIN_CONFIG.sales);
    expect(d.heading).toBe('Invoice #001');
    expect(d.dateText).toBe('28/9/2026');
    expect(d.partyLabel).toBe('Customer');
    expect([d.partyName, d.phone, d.address]).toEqual(['SLN TEX', '9876543210', 'Tirupur']);
    expect(d.deletedText).toBe('1/10/2026, 10:00:00 am');
    expect(d.lines).toEqual([
      { description: 'Cotton Shirt', qty: 10, rate: 120.5, amount: 1205 },
      { description: 'T Shirt', qty: 2, rate: 99, amount: 198 },
    ]);
    expect(d.summary).toEqual({
      subtotal: 1403,
      oldBalance: 300,
      grandTotal: 1703,
      paid: 700,
      balanceDue: 1003,
    });
    expect(d.payments.map((p) => [p.amount, p.method, p.type])).toEqual([
      [500, 'Cash', 'Initial'],
      [200, 'UPI', 'Added later'],
    ]);
    expect(d.returns).toEqual([{ id: 'r1', date: '2026-10-01', description: 'T Shirt', qty: 1, amount: 99 }]);
  });
  test("web fallbacks: 'N/A' text, zero numbers, invoice date from createdAt, grand total from the invoice", () => {
    const item = salesItem({
      customerName: '',
      customerPhone: '',
      invoiceDate: '',
      grandTotal: 0,
      deletedAt: undefined,
      payments: [],
      returns: [],
      data: {
        ...salesItem().data,
        customerAddress: '',
        createdAt: '2026-08-05T10:00:00.000Z',
        products: [],
        grandTotal: 99,
      },
    });
    const d = buildBinDetail(item, BIN_CONFIG.sales);
    expect(d.partyName).toBe('N/A');
    expect(d.phone).toBe('N/A');
    expect(d.address).toBe('N/A');
    expect(d.dateText).toBe(formatBinDate(new Date('2026-08-05T10:00:00.000Z')));
    expect(d.deletedText).toBe('N/A');
    expect(d.lines).toEqual([]);
    expect(d.summary.grandTotal).toBe(99);
    expect(
      buildBinDetail(
        salesItem({ invoiceDate: '', data: { ...salesItem().data, createdAt: undefined } }),
        BIN_CONFIG.sales,
      )?.dateText,
    ).toBe('N/A');
  });
  test('purchase bill: "Purchase Bill #", supplier, paid / due read through the nested payment object', () => {
    const d = buildBinDetail(purchaseItem(), BIN_CONFIG.purchase);
    expect(d.heading).toBe('Purchase Bill #007');
    expect(d.partyLabel).toBe('Supplier');
    expect([d.partyName, d.phone, d.address]).toEqual(['ABC YARNS', 'N/A', 'Erode']);
    expect(d.summary).toEqual({
      subtotal: 1000,
      oldBalance: 0,
      grandTotal: 1000,
      paid: 400,
      balanceDue: 600,
    });
    expect(d.returns).toEqual([]);
  });
  test('a purchase item in the sales bin has no preview', () => {
    expect(buildBinDetail(purchaseItem(), BIN_CONFIG.sales)).toBeNull();
  });
});
describe('binService maps each bin to its own db methods', () => {
  test('loadBinItems reads the right collection and sorts newest first', async () => {
    const older = salesItem({ id: 'old', deletedAt: ts(new Date(2026, 9, 1)) });
    const newer = salesItem({ id: 'new', deletedAt: ts(new Date(2026, 9, 2)) });
    const sales = jest.spyOn(db, 'getRecycleBinItems').mockResolvedValue([older, newer]);
    const purchase = jest.spyOn(db, 'getPurchaseRecycleBinItems').mockResolvedValue([purchaseItem()]);
    expect((await loadBinItems('sales')).map((i) => i.id)).toEqual(['new', 'old']);
    expect(sales).toHaveBeenCalledTimes(1);
    expect(purchase).not.toHaveBeenCalled();
    expect(await loadBinItems('purchase')).toHaveLength(1);
  });
  test('restore / permanent delete / empty', async () => {
    const restoreS = jest.spyOn(db, 'restoreFromRecycleBin').mockResolvedValue('001');
    const restoreP = jest.spyOn(db, 'restorePurchaseFromRecycleBin').mockResolvedValue('P-007');
    const delS = jest.spyOn(db, 'permanentDeleteFromRecycleBin').mockResolvedValue();
    const delP = jest.spyOn(db, 'permanentDeletePurchaseFromRecycleBin').mockResolvedValue();
    const emptyS = jest.spyOn(db, 'emptyRecycleBin').mockResolvedValue(3);
    const emptyP = jest.spyOn(db, 'emptyPurchaseRecycleBin').mockResolvedValue(5);
    await restoreBinItem('sales', 'a');
    await restoreBinItem('purchase', 'b');
    await permanentlyDeleteBinItem('sales', 'c');
    await permanentlyDeleteBinItem('purchase', 'd');
    expect(await emptyBin('sales')).toBe(3);
    expect(await emptyBin('purchase')).toBe(5);
    expect(restoreS).toHaveBeenCalledWith('a');
    expect(restoreP).toHaveBeenCalledWith('b');
    expect(delS).toHaveBeenCalledWith('c');
    expect(delP).toHaveBeenCalledWith('d');
    expect(emptyS).toHaveBeenCalledTimes(1);
    expect(emptyP).toHaveBeenCalledTimes(1);
  });
});
