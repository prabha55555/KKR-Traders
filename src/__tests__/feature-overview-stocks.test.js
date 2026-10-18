import { setDoc } from 'firebase/firestore';
import { db } from '@/core/db';
import {
  buildStockMap,
  computeStocks,
  filterStocks,
  hasRolls,
  historyDate,
  historyInvoiceNo,
  historyRolls,
  historyTotal,
  lookupStock,
  openingActions,
  OPENING_ROLLS_INVALID,
  OPENING_STOCK_INVALID,
  parseOpeningStockQty,
  parseOpeningStockRolls,
  stockLabel,
  stockTone,
} from '@/features/overview/stocks/stocksLogic';
import {
  getStockQuantityMap,
  invalidateStocksCache,
  loadStocks,
} from '@/features/overview/stocks/stocksService';
const line = (description, qty, rate) => ({ description, qty, rate, amount: qty * rate });
const purchase = (over) => ({
  invoiceNo: 'P-001',
  invoiceDate: '2026-09-01',
  supplierName: 'ABC',
  supplierPhone: '',
  supplierAddress: '',
  products: [],
  // no carried balance in these fixtures: the bill's own amount is its grand total
  subtotal: over?.grandTotal ?? 0,
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
  // no carried balance in these fixtures: the bill's own amount is its grand total
  subtotal: over?.grandTotal ?? 0,
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
  test('available = opening + purchased - sold, per TRIMMED, case-sensitive description', () => {
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
        rolls: 0,
        rate: 20,
        invoiceNo: 'P-002',
        rawInvoiceNo: 'P-002',
        amount: 50,
      },
      {
        date: '2026-09-01',
        party: 'ABC',
        qty: 10,
        rolls: 0,
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
        rolls: 0,
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
        rolls: 0,
        rate: 99.999,
        invoiceNo: '002',
        rawInvoiceNo: '002',
        amount: 100,
      },
    ]);
    expect(row('T Shirt').purchaseHistory[0].amount).toBe(151.5);
  });
  test('financial summary: sales and purchases at each bill own amount, cash = amount paid, net = sales - purchases', () => {
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
  test('carried previous balances are not counted again in the sales / purchase totals', () => {
    const out = computeStocks(
      [purchase({ subtotal: 100, previousBalance: 900, grandTotal: 1000, products: undefined })],
      [sale({ subtotal: 50, previousBalance: 450, discountAmount: 5, grandTotal: 495, products: undefined })],
      [],
    );
    expect(out.summary).toMatchObject({ totalPurchases: 100, totalSales: 45 });
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
  test('history tables show the plain invoice number (no "P-" / "#") and print en-IN dates', () => {
    expect(historyInvoiceNo('P-001')).toBe('001');
    expect(historyInvoiceNo('012')).toBe('012');
    expect(historyInvoiceNo('#012')).toBe('012');
    // return / batch / DC references are shown as built
    expect(historyInvoiceNo('Return - Invoice No 001')).toBe('Return - Invoice No 001');
    expect(historyInvoiceNo('Batch B-101')).toBe('Batch B-101');
    expect(historyInvoiceNo('DC-001')).toBe('DC-001');
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
describe('average purchase price (Sales Bill "Avg buy" chip = Stocks page Average Purchase Rate)', () => {
  test('purchase returns are left out of the average but lower the purchased qty', () => {
    const out = computeStocks(
      [purchase({ products: [line('Yarn', 10, 100)] })],
      [],
      [],
      [],
      [],
      [{ description: 'Yarn', qty: 2, rate: 100, invoiceNo: 'P-001', returnDate: '2026-09-05' }],
    );
    expect(out.rows[0]).toMatchObject({ description: 'Yarn', purchased: 8, avgPurchaseRate: 100 });
  });
  test('a product with opening stock only has no average (0)', () => {
    const out = computeStocks([], [], [{ description: 'Old Yarn', qty: 7 }]);
    expect(out.rows[0]).toMatchObject({ opening: 7, avgPurchaseRate: 0 });
  });
  test('purchase lines and finished dyeing receipts are weighted together', () => {
    const out = computeStocks(
      [purchase({ products: [line('Cotton Red', 10, 100)] })],
      [],
      [],
      [],
      [],
      [],
      [
        {
          batchId: 'B-9',
          status: 'COMPLETED',
          batchDate: '2026-10-14',
          input: { description: 'Grey', qty: 10, avgGreyRate: 90 },
          output: [{ description: 'Cotton Red', qty: 10, unitCost: 130 }],
        },
      ],
    );
    expect(out.rows.find((r) => r.description === 'Cotton Red').avgPurchaseRate).toBe(115);
  });
});
describe('stock lookup map', () => {
  const rows = [
    { description: 'cotton shirt', available: 1, avgPurchaseRate: 10 },
    { description: 'Cotton Shirt', available: 2, avgPurchaseRate: 20 },
    { description: 'Yarn 30s', available: 3, avgPurchaseRate: 0 },
  ];
  test('a case variant never overwrites the exact key of another row', () => {
    const map = buildStockMap(rows);
    expect(lookupStock(map, 'cotton shirt')).toMatchObject({ available: 1, avgPurchaseRate: 10 });
    expect(lookupStock(map, ' Cotton Shirt ')).toMatchObject({ available: 2, avgPurchaseRate: 20 });
    // the other order gives the same answer
    const reversed = buildStockMap([...rows].reverse());
    expect(lookupStock(reversed, 'cotton shirt')).toMatchObject({ available: 1 });
    expect(lookupStock(reversed, 'Cotton Shirt')).toMatchObject({ available: 2 });
  });
  test('lower-case fallback for other casings; null for unknown / empty descriptions or no map', () => {
    const map = buildStockMap(rows);
    expect(lookupStock(map, 'YARN 30S')).toMatchObject({ available: 3 });
    expect(lookupStock(map, 'Mystery')).toBeNull();
    expect(lookupStock(map, '  ')).toBeNull();
    expect(lookupStock(map, undefined)).toBeNull();
    expect(lookupStock(null, 'Yarn 30s')).toBeNull();
  });
  test('getStockQuantityMap builds the map from the stock rows (with the average purchase rate)', async () => {
    invalidateStocksCache();
    jest
      .spyOn(db, 'getAllPurchaseBills')
      .mockResolvedValue([
        purchase({ products: [line('cotton shirt', 1, 10), line('Cotton Shirt', 1, 20)] }),
      ]);
    jest.spyOn(db, 'getAllInvoices').mockResolvedValue([]);
    jest.spyOn(db, 'getAllOpeningStocks').mockResolvedValue([]);
    jest.spyOn(db, 'getAllProductMetadata').mockResolvedValue([]);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    jest.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue([]);
    const map = await getStockQuantityMap(true);
    expect(lookupStock(map, 'cotton shirt').avgPurchaseRate).toBe(10);
    expect(lookupStock(map, 'Cotton Shirt').avgPurchaseRate).toBe(20);
    invalidateStocksCache();
  });
});
describe('rolls (counted next to the quantity, never in the money)', () => {
  const rollLine = (description, qty, rolls, rate) => ({ ...line(description, qty, rate), rolls });
  /** grey issued 50 kg / 10 rolls, 2 kg / 1 roll sent back by the dyer, 40 kg / 8 rolls received as Cotton Blue */
  const lot = {
    id: 'lot1',
    dcNo: 'DC-001',
    dcDate: '2026-10-01',
    status: 'RECEIVED',
    grey: { description: 'Cotton Grey', qty: 50, rolls: 10, rate: 100 },
    finishedDescription: 'Cotton Blue',
    dyer: { id: 'd1', name: 'Murugan Dyers' },
    combingUnit: { id: 'c1', name: 'KR Combers' },
    dyeing: { dcNo: 'D-9', date: '2026-10-05', qty: 45, rolls: 9 },
    received: { dcNo: 'C-3', date: '2026-10-10', qty: 40, rolls: 8 },
    returns: [{ from: 'dyeing', date: '2026-10-04', description: 'Cotton Grey', qty: 2, rolls: 1 }],
  };
  const out = computeStocks(
    [purchase({ invoiceNo: 'P-1', products: [rollLine('Cotton Grey', 100, 20, 100)] })],
    [
      sale({
        invoiceNo: '001',
        products: [rollLine('Cotton Grey', 30, 6, 150), rollLine('Cotton Blue', 10, 2, 300)],
      }),
    ],
    [{ description: 'Cotton Grey', qty: 5, rolls: 1 }],
    [],
    [{ description: 'Cotton Grey', qty: 5, rolls: 1, rate: 150, invoiceNo: '001', returnDate: '2026-10-12' }],
    [
      {
        description: 'Cotton Grey',
        qty: 10,
        rolls: 2,
        rate: 100,
        invoiceNo: 'P-1',
        returnDate: '2026-09-20',
      },
    ],
    [],
    [],
    [lot],
  );
  const row = (d) => out.rows.find((r) => r.description === d);
  test('available rolls = opening + purchased - sold, from bills, returns, opening stock and processing lots', () => {
    // purchased: 20 bought - 2 returned to the supplier + 1 sent back by the dyer; sold: 6 sold - 1 returned + 10 issued
    expect(row('Cotton Grey')).toMatchObject({
      opening: 5,
      purchased: 92,
      sold: 75,
      available: 22,
      openingRolls: 1,
      purchasedRolls: 19,
      soldRolls: 15,
      availableRolls: 5,
    });
    // the finished fabric enters with the rolls received back
    expect(row('Cotton Blue')).toMatchObject({
      purchased: 40,
      sold: 10,
      available: 30,
      purchasedRolls: 8,
      soldRolls: 2,
      availableRolls: 6,
    });
  });
  test('history entries carry their rolls (returns negative) and the money is untouched', () => {
    const grey = row('Cotton Grey');
    expect(grey.purchaseHistory.map((e) => [e.invoiceNo, e.qty, e.rolls, e.amount])).toEqual([
      ['DC-001', 2, 1, 200],
      ['Return - Invoice No 1', -10, -2, -1000],
      ['P-1', 100, 20, 10000],
    ]);
    // the return keeps the stored number for opening the bill
    expect(grey.purchaseHistory[1].rawInvoiceNo).toBe('P-1');
    expect(grey.salesHistory.map((e) => [e.invoiceNo, e.qty, e.rolls])).toEqual([
      ['Return - Invoice No 001', -5, -1],
      ['DC-001', 50, 10],
      ['001', 30, 6],
    ]);
    expect(historyRolls(grey.purchaseHistory)).toBe(19);
    expect(historyRolls(grey.salesHistory)).toBe(15);
    expect(historyRolls([{ qty: 1 }])).toBe(0);
    expect(grey.avgPurchaseRate).toBe(100);
  });
  test('lines, returns and opening stock without rolls count 0 (older data)', () => {
    const plain = computeStocks(purchases, sales, opening);
    plain.rows.forEach((r) => {
      expect(r).toMatchObject({ openingRolls: 0, purchasedRolls: 0, soldRolls: 0, availableRolls: 0 });
      expect(hasRolls(r)).toBe(false);
    });
    expect(hasRolls(row('Cotton Grey'))).toBe(true);
  });
  test('old dyeing / combing batches: only an explicit rolls field counts, never their fixed "Rolls" unit', () => {
    const batches = computeStocks(
      [],
      [],
      [],
      [],
      [],
      [],
      [
        {
          batchId: 'B-1',
          status: 'COMPLETED',
          input: { description: 'Old Grey', unit: 'Rolls', qty: 30, avgGreyRate: 10 },
          output: [{ description: 'Old Red', unit: 'Rolls', qty: 28, unitCost: 20 }],
        },
        {
          batchId: 'B-2',
          status: 'COMPLETED',
          input: { description: 'Old Grey', unit: 'Kgs', qty: 12, rolls: 3, avgGreyRate: 10 },
          output: [{ description: 'Old Red', qty: 11, rolls: 3, unitCost: 20 }],
        },
      ],
    );
    const find = (d) => batches.rows.find((r) => r.description === d);
    expect(find('Old Grey')).toMatchObject({ sold: 42, soldRolls: 3, availableRolls: -3 });
    expect(find('Old Red')).toMatchObject({ purchased: 39, purchasedRolls: 3, availableRolls: 3 });
  });
  test('stock map exposes availableRolls / hasRolls; the bill hint reads "80 kg · 12 rolls" only for roll products', () => {
    const map = buildStockMap(out.rows);
    expect(lookupStock(map, 'cotton grey')).toMatchObject({
      available: 22,
      availableRolls: 5,
      hasRolls: true,
    });
    expect(stockLabel(lookupStock(map, 'Cotton Grey'))).toBe('22 kg · 5 rolls');
    expect(stockLabel({ available: 3, availableRolls: 1, hasRolls: true })).toBe('3 kg · 1 roll');
    const plainMap = buildStockMap(computeStocks(purchases, sales, opening).rows);
    expect(lookupStock(plainMap, 'T Shirt')).toMatchObject({
      available: 2,
      availableRolls: 0,
      hasRolls: false,
    });
    expect(stockLabel(lookupStock(plainMap, 'T Shirt'))).toBe('2');
    expect(stockLabel(null)).toBe('');
  });
  test('opening stock: optional whole-number rolls; a rolls-only opening stock can be edited / deleted', () => {
    expect(parseOpeningStockRolls('')).toEqual({ rolls: 0 });
    expect(parseOpeningStockRolls(' 12 ')).toEqual({ rolls: 12 });
    expect(parseOpeningStockRolls('1.5')).toEqual({ error: OPENING_ROLLS_INVALID });
    expect(parseOpeningStockRolls('-2')).toEqual({ error: OPENING_ROLLS_INVALID });
    expect(openingActions({ opening: 0, openingRolls: 4 })).toBe('edit');
    expect(openingActions({ opening: 0, openingRolls: 0 })).toBe('add');
  });
  test('db.saveOpeningStock stores rolls when given; the old 2-argument call writes what it always did', async () => {
    setDoc.mockClear();
    await db.saveOpeningStock('Cotton Grey', 5, 3);
    await db.saveOpeningStock('Cotton Grey', 7);
    expect(setDoc.mock.calls.map((c) => c[1])).toEqual([
      { description: 'Cotton Grey', qty: 5, rolls: 3, updatedAt: '__serverTimestamp__' },
      { description: 'Cotton Grey', qty: 7, updatedAt: '__serverTimestamp__' },
    ]);
  });
});
