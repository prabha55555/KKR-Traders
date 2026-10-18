import { db } from '@/core/db';
import {
  computeStocks,
  filterStocks,
  historyDate,
  historyInvoiceNo,
  historyTotal,
  openingActions,
  OPENING_STOCK_INVALID,
  parseOpeningStockQty,
  stockTone,
} from '@/features/overview/stocks/stocksLogic';
import { loadStocks } from '@/features/overview/stocks/stocksService';
const line = (description, qty, rate) => ({ description, qty, rate, amount: qty * rate });
const purchase = (over) => ({
  invoiceNo: 'P-001',
  invoiceDate: '2026-09-01',
  supplierName: 'ABC',
  supplierPhone: '',
  supplierAddress: '',
  products: [],
  subtotal: 0,
  grandTotal: 0,
  ...over,
});
const sale = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-09-20',
  customerName: 'SLN',
  customerAddress: '',
  customerPhone: '',
  products: [],
  subtotal: 0,
  previousBalance: 0,
  grandTotal: 0,
  amountPaid: 0,
  balanceDue: 0,
  ...over,
});
const opening = [
  { description: ' Cotton Shirt ', qty: 5 },
  { description: 'Old Item', qty: '2.5' },
];
const purchases = [
  purchase({
    invoiceNo: 'P-001',
    invoiceDate: '2026-09-01',
    supplierName: 'ABC',
    grandTotal: 1500,
    products: [line('Cotton Shirt ', 10, 100), line('T Shirt', 3, 50.5)],
  }),
  purchase({
    invoiceNo: 'P-002',
    invoiceDate: '2026-09-15',
    supplierName: '',
    grandTotal: 500,
    products: [line('Cotton Shirt', 2.5, 20)],
  }),
];
const sales = [
  sale({
    invoiceNo: '001',
    invoiceDate: '2026-09-20',
    grandTotal: 2000,
    amountPaid: 800,
    products: [line('cotton shirt', 3, 150), line('Cotton Shirt', 4, 150)],
  }),
  sale({
    invoiceNo: '002',
    invoiceDate: '2026-09-25',
    customerName: '',
    grandTotal: 100.5,
    amountPaid: 100,
    products: [line('T Shirt', 1, 99.999)],
  }),
];
afterEach(() => jest.restoreAllMocks());
describe('computeStocks', () => {
  const { rows, summary } = computeStocks(purchases, sales, opening);
  const row = (d) => rows.find((r) => r.description === d);
  test('available = opening + purchased - sold (no returns), per TRIMMED, case-sensitive description', () => {
    expect(row('Cotton Shirt')).toMatchObject({ opening: 5, purchased: 12.5, sold: 4, available: 13.5 });
    expect(row('cotton shirt')).toMatchObject({ opening: 0, purchased: 0, sold: 3, available: -3 });
    expect(row('Old Item')).toMatchObject({ opening: 2.5, purchased: 0, sold: 0, available: 2.5 });
    expect(row('T Shirt')).toMatchObject({ opening: 0, purchased: 3, sold: 1, available: 2 });
    expect(rows).toHaveLength(4);
  });
  test('integrates dyeing batches: reduces raw grey stock and adds finished colored rolls at unit cost (Workflow 2)', () => {
    const greyPurchases = [
      purchase({
        invoiceNo: 'P-100',
        supplierName: 'Yarn Mills',
        products: [line('Cotton 30s Grey', 10, 100)],
      }),
    ];
    const dyeingBatches = [
      {
        batchId: 'B-001',
        status: 'COMPLETED',
        batchDate: '2026-10-14',
        processorName: 'Murugan Dyers',
        input: { description: 'Cotton 30s Grey', qty: 10, avgGreyRate: 100 },
        output: [{ description: 'Cotton 30s Red', qty: 10, unitCost: 130 }],
      },
    ];
    const out = computeStocks(greyPurchases, [], [], [], [], [], dyeingBatches);
    const greyRow = out.rows.find((r) => r.description === 'Cotton 30s Grey');
    const redRow = out.rows.find((r) => r.description === 'Cotton 30s Red');

    // 10 purchased - 10 issued to dyeing = 0 available
    expect(greyRow).toMatchObject({ purchased: 10, sold: 10, available: 0 });
    // 10 received from dyeing = 10 available at average purchase rate 130
    expect(redRow).toMatchObject({ purchased: 10, sold: 0, available: 10, avgPurchaseRate: 130 });
  });
  test('opening stock with the same trimmed description: last one wins', () => {
    const out = computeStocks(
      [],
      [],
      [
        { description: 'X', qty: 1 },
        { description: ' X ', qty: 7 },
      ],
    );
    expect(out.rows).toEqual([expect.objectContaining({ description: 'X', opening: 7, available: 7 })]);
  });
  test('quantities are rounded to 3 decimals (float noise removed)', () => {
    const out = computeStocks(
      [purchase({ products: [line('Y', 0.1, 1), line('Y', 0.2, 1)] })],
      [sale({ products: [line('Y', 0.1, 1)] })],
      [],
    );
    expect(out.rows[0]).toMatchObject({ purchased: 0.3, sold: 0.1, available: 0.2 });
  });
  test('rows are ordered alphabetically by description', () => {
    const out = computeStocks(
      [purchase({ products: [line('cherry', 1, 1), line('Apple', 1, 1), line('banana', 1, 1)] })],
      [],
      [],
    );
    expect(out.rows.map((r) => r.description)).toEqual(['Apple', 'banana', 'cherry']);
  });
  test('purchase history: newest first, supplier fallback, amount = qty x rate to 2 decimals', () => {
    expect(row('Cotton Shirt').purchaseHistory).toEqual([
      {
        date: '2026-09-15',
        party: 'Unknown',
        qty: 2.5,
        rate: 20,
        invoiceNo: 'P-002',
        rawInvoiceNo: 'P-002',
        amount: 50,
      },
      {
        date: '2026-09-01',
        party: 'ABC',
        qty: 10,
        rate: 100,
        invoiceNo: 'P-001',
        rawInvoiceNo: 'P-001',
        amount: 1000,
      },
    ]);
    expect(historyTotal(row('Cotton Shirt').purchaseHistory)).toBe(1050);
    expect(row('Cotton Shirt').avgPurchaseRate).toBe(84); // (1000 + 50) / (10 + 2.5) = 1050 / 12.5 = 84
  });
  test('sales history carries the customer; amount is rounded per entry before it is summed', () => {
    expect(row('Cotton Shirt').salesHistory).toEqual([
      {
        date: '2026-09-20',
        party: 'SLN',
        qty: 4,
        rate: 150,
        invoiceNo: '001',
        rawInvoiceNo: '001',
        amount: 600,
      },
    ]);
    expect(row('T Shirt').salesHistory).toEqual([
      {
        date: '2026-09-25',
        party: 'Unknown',
        qty: 1,
        rate: 99.999,
        invoiceNo: '002',
        rawInvoiceNo: '002',
        amount: 100,
      },
    ]);
    expect(row('T Shirt').purchaseHistory[0].amount).toBe(151.5);
  });
  test('financial summary: sales and purchases at grand total, cash = amount paid, net = sales - purchases', () => {
    expect(summary).toEqual({
      totalSales: 2100.5,
      totalPurchases: 2000,
      cashReceived: 900,
      netProfitLoss: 100.5,
    });
  });
  test('bills without products or description-less lines still count towards the totals', () => {
    const out = computeStocks(
      [purchase({ grandTotal: 10, products: undefined })],
      [sale({ grandTotal: 40, products: [line('', 1, 1)] })],
      [{ description: '', qty: 3 }],
    );
    expect(out.rows).toEqual([]);
    expect(out.summary).toMatchObject({ totalSales: 40, totalPurchases: 10, netProfitLoss: 30 });
  });
  test('legacy `date` is used when invoiceDate is missing', () => {
    const out = computeStocks(
      [{ ...purchase({ invoiceDate: '', products: [line('Z', 1, 1)] }), date: '2026-01-02' }],
      [],
      [],
    );
    expect(out.rows[0].purchaseHistory[0].date).toBe('2026-01-02');
  });
});
describe('filterStocks / presentation helpers', () => {
  const { rows } = computeStocks(purchases, sales, opening);
  test('search is a case-insensitive substring of the description', () => {
    expect(
      filterStocks(rows, 'SHIRT')
        .map((r) => r.description)
        .sort(),
    ).toEqual(['Cotton Shirt', 'T Shirt', 'cotton shirt']);
    expect(filterStocks(rows, 'old').map((r) => r.description)).toEqual(['Old Item']);
    expect(filterStocks(rows, 'old ').map((r) => r.description)).toEqual(['Old Item']);
    expect(filterStocks(rows, '')).toBe(rows);
    expect(filterStocks(rows, 'zzz')).toEqual([]);
  });
  test('stock colour tone and opening-stock actions', () => {
    expect(stockTone(2)).toBe('positive');
    expect(stockTone(-0.5)).toBe('negative');
    expect(stockTone(0)).toBe('zero');
    expect(openingActions({ opening: 5 })).toBe('edit');
    expect(openingActions({ opening: 0 })).toBe('add');
    expect(openingActions({ opening: -2 })).toBe('add');
  });
  test('history tables drop a "P-" prefix and print en-IN dates', () => {
    expect(historyInvoiceNo('P-001')).toBe('001');
    expect(historyInvoiceNo('012')).toBe('012');
    expect(historyDate('2026-09-15')).toBe('15/9/2026');
    expect(historyDate('')).toBe('');
  });
});
describe('parseOpeningStockQty (the web prompt validator)', () => {
  test('empty or non-numeric input is rejected', () => {
    expect(parseOpeningStockQty('')).toEqual({ error: OPENING_STOCK_INVALID });
    expect(parseOpeningStockQty('  ')).toEqual({ error: OPENING_STOCK_INVALID });
    expect(parseOpeningStockQty('.')).toEqual({ error: OPENING_STOCK_INVALID });
    expect(OPENING_STOCK_INVALID).toBe('You need to write a valid number!');
  });
  test('0, decimals and negatives are accepted', () => {
    expect(parseOpeningStockQty('0')).toEqual({ qty: 0 });
    expect(parseOpeningStockQty('12.5')).toEqual({ qty: 12.5 });
    expect(parseOpeningStockQty('-3')).toEqual({ qty: -3 });
  });
});
describe('loadStocks', () => {
  test('combines purchases, sales and opening stocks from db', async () => {
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(purchases);
    jest.spyOn(db, 'getAllInvoices').mockResolvedValue(sales);
    jest.spyOn(db, 'getAllOpeningStocks').mockResolvedValue(opening);
    jest.spyOn(db, 'getAllProductMetadata').mockResolvedValue([]);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    jest.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue([]);
    const { rows, summary } = await loadStocks();
    expect(rows).toHaveLength(4);
    expect(summary.netProfitLoss).toBe(100.5);
  });
});
