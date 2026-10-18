/**
 * Review fixes in Revenue / Statistics / Stocks:
 *  1. sales returns come off the bill's revenue, cost and profit (the goods go back into stock and can be sold again);
 *     purchase returns come off Purchases and stay out of the average cost (as in Stocks)
 *  2. fabric a processing unit sent back unprocessed is in the average cost at the value Stocks gives it
 *  3. Stocks "Cash Received" is net of refunded sales returns; Total Sales / Total Purchases / Net are net of returns,
 *     the same figures as Statistics
 *  4. processing-lot history lines open the lot where it is now
 *  5. a negative opening stock is an opening stock (Edit / Delete, real value)
 *  6. Oversold is red
 */
import { db } from '@/core/db';
import {
  computeAnalytics,
  computeInsights,
  fetchDashboardData,
  prepareDashboardData,
} from '@/features/overview/revenue/dashboardAnalytics';
import {
  buildAvgCostLookup,
  computeRevenueRows,
  revenueTotals,
  salesReturnsOfBill,
} from '@/features/overview/revenue/revenueLogic';
import { loadRevenueRows } from '@/features/overview/revenue/revenueService';
import { stockStatus } from '@/features/overview/stocks/StockRowParts';
import { computeStocks, openingActions, processingLotLink } from '@/features/overview/stocks/stocksLogic';
import { LOT_STATUS } from '@/features/processing/lotLogic';

afterEach(() => vi.restoreAllMocks());

const ALL_TIME = { start: new Date(0), end: new Date(2100, 1, 1) };

// 10 Cotton bought at 100; all 10 sold to Ravi at 150; Ravi returns 4 (refunded); the same 4 are sold to Kumar.
const purchases = [
  {
    invoiceNo: 'P-1',
    invoiceDate: '2026-09-01',
    supplierName: 'Mill',
    supplierPhone: '9100000001',
    products: [{ description: 'Cotton', qty: 10, rate: 100, amount: 1000 }],
    subtotal: 1000,
    grandTotal: 1000,
  },
];
const sale = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-09-10',
  customerName: 'Ravi',
  customerPhone: '9000000001',
  products: [],
  subtotal: 0,
  previousBalance: 0,
  grandTotal: 0,
  amountPaid: 0,
  balanceDue: 0,
  ...over,
});
const bill1 = sale({
  products: [{ description: 'Cotton', qty: 10, rate: 150, amount: 1500 }],
  subtotal: 1500,
  grandTotal: 1500,
  amountPaid: 1500,
});
const bill2 = sale({
  invoiceNo: '002',
  invoiceDate: '2026-09-20',
  customerName: 'Kumar',
  customerPhone: '9000000002',
  products: [{ description: 'Cotton', qty: 4, rate: 150, amount: 600 }],
  subtotal: 600,
  grandTotal: 600,
  amountPaid: 600,
});
const cashRefund = {
  id: 'ret1',
  invoiceNo: '001',
  customerName: 'Ravi',
  description: 'Cotton',
  qty: 4,
  rate: 150,
  returnAmount: 600,
  returnDate: '2026-09-15',
  settlementType: 'refund',
  refundMethod: 'cash',
};

describe('1. sales returns: revenue page', () => {
  test('the return comes off its bill: revenue, cost and profit, listed as a "Returned" line', () => {
    const rows = computeRevenueRows([bill2, bill1], purchases, [], [], [], [cashRefund]);
    const r1 = rows.find((r) => r.rawBillNo === '001');
    expect(r1).toMatchObject({ revenue: 900, cost: 600, profit: 300, returns: 600 });
    expect(r1.lines[1]).toEqual({
      description: 'Cotton',
      qty: -4,
      sellingRate: 150,
      costRate: 100,
      profitPerUnit: 50,
      totalProfit: -200,
      amount: -600,
      isReturn: true,
    });
    // detail lines still add up to the bill's profit
    expect(r1.lines.reduce((s, l) => s + l.totalProfit, 0) - r1.discount).toBe(r1.profit);
    // reselling the returned goods is not counted twice: 10 units net sold × ₹50 margin
    expect(revenueTotals(rows)).toEqual({ bills: 2, revenue: 1500, cost: 1000, profit: 500 });
    // ... and Stocks agrees that all 10 are gone
    const stock = computeStocks(purchases, [bill1, bill2], [], [], [cashRefund]);
    expect(stock.rows.find((r) => r.description === 'Cotton').available).toBe(0);
  });
  test('an older return without settlement fields (a balance adjustment) is taken off too', () => {
    const legacy = { ...cashRefund, settlementType: undefined, refundMethod: undefined };
    const [r1] = computeRevenueRows([bill1], purchases, [], [], [], [legacy]);
    expect(r1).toMatchObject({ revenue: 900, cost: 600, profit: 300 });
  });
  test('no returns: rows are unchanged', () => {
    const [r1] = computeRevenueRows([bill1], purchases);
    expect(r1).toMatchObject({ revenue: 1500, cost: 1000, profit: 500, returns: 0 });
    expect(r1.lines).toHaveLength(1);
  });
  test('return value falls back to the legacy `amount`, then qty × rate', () => {
    const cost = () => 100;
    expect(salesReturnsOfBill([{ description: 'X', qty: 2, rate: 150, amount: 290 }], cost)).toMatchObject({
      amount: 290,
      cost: 200,
      profit: 90,
    });
    expect(salesReturnsOfBill([{ description: 'X', qty: 2, rate: 150 }], cost).amount).toBe(300);
    expect(salesReturnsOfBill(undefined, cost)).toMatchObject({ amount: 0, cost: 0, profit: 0, lines: [] });
  });
  test('loadRevenueRows reads the sales returns', async () => {
    vi.spyOn(db, 'getAllInvoices').mockResolvedValue([bill1]);
    vi.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(purchases);
    vi.spyOn(db, 'getAllDyeingBatches').mockResolvedValue([]);
    vi.spyOn(db, 'getAllCombingBatches').mockResolvedValue([]);
    vi.spyOn(db, 'getAllProcessingLots').mockResolvedValue([]);
    const returns = vi.spyOn(db, 'getAllReturns').mockResolvedValue([cashRefund]);
    const [row] = await loadRevenueRows();
    expect(returns).toHaveBeenCalled();
    expect(row).toMatchObject({ revenue: 900, profit: 300 });
  });
});

describe('1. sales / purchase returns: statistics', () => {
  // purchased 10 @100 + 10 @120 (average 110); 5 sent back to the mill at 120
  const purchases2 = [
    ...purchases,
    {
      ...purchases[0],
      invoiceNo: 'P-2',
      invoiceDate: '2026-09-02',
      products: [{ description: 'Cotton', qty: 10, rate: 120, amount: 1200 }],
      subtotal: 1200,
      grandTotal: 1200,
    },
  ];
  const purchaseReturn = {
    invoiceNo: 'P-2',
    supplierName: 'Mill',
    description: 'Cotton',
    qty: 5,
    rate: 120,
    returnAmount: 600,
    settlementType: 'refund',
    refundMethod: 'cash',
  };
  const raw = {
    salesBills: [bill1, bill2],
    purchaseBills: purchases2,
    salesReturns: [cashRefund],
    purchaseReturns: [purchaseReturn],
  };

  test('each bill carries its profit and returned value net of its returns', () => {
    const data = prepareDashboardData(raw);
    const [b1, b2] = data.salesBills;
    // cost 110: (150 − 110) × 10 − (600 − 4 × 110)
    expect(b1).toMatchObject({ computedProfit: 400 - 160, computedReturns: 600 });
    expect(b2).toMatchObject({ computedProfit: 160, computedReturns: 0 });
    expect(data.purchaseBills.map((b) => b.computedReturns)).toEqual([0, 600]);
  });
  test('KPIs: Sales, Purchases and Gross Profit are net of returns', () => {
    const viaPrepared = computeAnalytics(prepareDashboardData(raw), 'all');
    expect(viaPrepared.current).toMatchObject({
      salesAmount: 1500, // 1500 + 600 − 600 returned
      salesCount: 2,
      profitAmount: 400, // 10 units net sold × (150 − 110)
      purchasesAmount: 1600, // 2200 − 600 sent back
    });
    // raw collections are prepared the same way
    expect(computeAnalytics(raw, 'all').current).toEqual(viaPrepared.current);
  });
  test('top tables: product qty / revenue / profit, customer sales and supplier purchases net of returns', () => {
    const { topProducts, topCustomers, topSuppliers } = computeInsights(prepareDashboardData(raw), ALL_TIME);
    expect(topProducts).toEqual([{ name: 'Cotton', qty: 10, revenue: 1500, profit: 400 }]);
    expect(topCustomers.map((c) => [c.name, c.sales])).toEqual([
      ['Ravi', 900],
      ['Kumar', 600],
    ]);
    expect(topSuppliers.map((s) => [s.name, s.purchases])).toEqual([['Mill', 1600]]);
  });
  test('purchase returns stay out of the average cost, exactly like the Stocks average purchase rate', () => {
    const cost = buildAvgCostLookup(purchases2);
    const stock = computeStocks(purchases2, [], [], [], [], [purchaseReturn]);
    expect(cost('Cotton')).toBe(110);
    expect(stock.rows[0].avgPurchaseRate).toBe(110);
  });
  test('fetchDashboardData loads the returns and prepares the bills', async () => {
    const spy = (name, value) => vi.spyOn(db, name).mockResolvedValue(value);
    spy('getAllInvoices', raw.salesBills);
    spy('getAllPurchaseBills', raw.purchaseBills);
    spy('getAllExpenses', []);
    spy('getAllCustomers', []);
    spy('getAllSuppliers', []);
    spy('getAllReturns', raw.salesReturns);
    spy('getAllPurchaseReturns', raw.purchaseReturns);
    spy('getAllDyeingBatches', []);
    spy('getAllCombingBatches', []);
    spy('getAllProcessingLots', []);
    const data = await fetchDashboardData();
    expect(data.salesBills[0].computedReturns).toBe(600);
    expect(computeAnalytics(data, 'all').current.salesAmount).toBe(1500);
  });
  test('the Stocks financial summary shows the same sales / purchases as Statistics (all time)', () => {
    const { current } = computeAnalytics(raw, 'all');
    const { summary } = computeStocks(
      raw.purchaseBills,
      raw.salesBills,
      [],
      [],
      raw.salesReturns,
      raw.purchaseReturns,
    );
    expect(summary).toMatchObject({
      totalSales: current.salesAmount,
      totalPurchases: current.purchasesAmount,
      netProfitLoss: current.salesAmount - current.purchasesAmount,
    });
    expect(summary).toMatchObject({ totalSales: 1500, totalPurchases: 1600, netProfitLoss: -100 });
  });
});

// 50 kg grey (₹100/kg) issued on DC-001; the dyer returns 5 kg grey, dyes 43 kg; the comber returns 3 kg dyed
// fabric ("Navy Dyed 30s", at the dyed cost 125.58/kg) and gives back 38 kg finished.
const lotAt = (status) => ({
  id: 'lot_1',
  dcNo: 'DC-001',
  dcDate: '2026-10-01',
  status,
  grey: { description: 'Grey 30s', rolls: 10, qty: 50, rate: 100 },
  finishedDescription: 'Navy Combed 30s',
  dyer: { id: 'dyer_1', name: 'Sri Dyes' },
  dyeingRate: 20,
  dyeingCharge: 1000,
  combingUnit: status === LOT_STATUS.AT_DYEING ? null : { id: 'proc_1', name: 'Kumar Combing' },
  combingRate: 10,
  combingCharge: 470,
  dyeing: status === LOT_STATUS.AT_DYEING ? null : { dcNo: 'SD-77', date: '2026-10-05', rolls: 9, qty: 43 },
  received: status === LOT_STATUS.RECEIVED ? { dcNo: 'KC-12', date: '2026-10-09', rolls: 8, qty: 38 } : null,
  returns: [
    { id: 'r1', from: 'dyeing', qty: 5, description: 'Grey 30s', date: '2026-10-04' },
    ...(status === LOT_STATUS.AT_DYEING
      ? []
      : [{ id: 'r2', from: 'combing', qty: 3, description: 'Navy Dyed 30s', date: '2026-10-07' }]),
  ],
  dyeingPayments: [],
  combingPayments: [],
});

describe('2. processing returns in the average cost', () => {
  const lot = lotAt(LOT_STATUS.RECEIVED);
  test('fabric back from a unit costs what Stocks values it at (not ₹0)', () => {
    const cost = buildAvgCostLookup([], [], [], [lot]);
    const stock = computeStocks([], [], [], [], [], [], [], [], [lot]);
    const rate = (d) => stock.rows.find((r) => r.description === d).avgPurchaseRate;
    expect(cost('Navy Dyed 30s')).toBeCloseTo(125.58, 2);
    expect(cost('Navy Dyed 30s')).toBeCloseTo(rate('Navy Dyed 30s'), 2);
    expect(cost('Navy Combed 30s')).toBeCloseTo(rate('Navy Combed 30s'), 2);
    // selling the returned dyed fabric: profit over its cost, not 100 %
    const [row] = computeRevenueRows(
      [sale({ products: [{ description: 'Navy Dyed 30s', qty: 3, rate: 150, amount: 450 }], subtotal: 450 })],
      [],
      [],
      [],
      [lot],
    );
    expect(row.cost).toBeCloseTo(376.74, 2);
    expect(row.profit).toBeCloseTo(73.26, 2);
  });
  test('a grey return is averaged in with the purchases, as on the Stocks page', () => {
    const greyBill = {
      ...purchases[0],
      products: [{ description: 'Grey 30s', qty: 100, rate: 90, amount: 9000 }],
    };
    const cost = buildAvgCostLookup([greyBill], [], [], [lot]);
    const stock = computeStocks([greyBill], [], [], [], [], [], [], [], [lot]);
    expect(cost('Grey 30s')).toBeCloseTo(9500 / 105, 6);
    expect(cost('Grey 30s')).toBeCloseTo(
      stock.rows.find((r) => r.description === 'Grey 30s').avgPurchaseRate,
      2,
    );
  });
});

describe('3. Stocks financial summary: net of returns', () => {
  test('cash and account refunds come off; balance adjustments (no money moved) do not', () => {
    const bankRefund = { ...cashRefund, id: 'ret2', qty: 1, returnAmount: 150, refundMethod: 'bank' };
    const legacyAdjustment = {
      invoiceNo: '002',
      description: 'Cotton',
      qty: 1,
      rate: 150,
      returnAmount: 150,
    };
    const refundWithoutLine = {
      invoiceNo: '002',
      returnAmount: 50,
      settlementType: 'refund',
      refundMethod: 'cash',
    };
    const out = computeStocks(
      purchases,
      [bill1, bill2],
      [],
      [],
      [cashRefund, bankRefund, legacyAdjustment, refundWithoutLine],
    );
    // 1500 + 600 paid − 600 − 150 − 50 refunded
    expect(out.summary.cashReceived).toBe(1300);
    // every return (refunded or adjusted) comes off Total Sales: 2100 − (600 + 150 + 150 + 50)
    expect(out.summary).toMatchObject({ totalSales: 1150, totalPurchases: 1000, netProfitLoss: 150 });
  });
  test('Total Sales / Purchases: return value = returnAmount, else amount, else qty × rate; only returns of loaded bills', () => {
    const salesReturns = [
      { invoiceNo: '001', description: 'Cotton', qty: 1, rate: 150, amount: 140 },
      { invoiceNo: '002', description: 'Cotton', qty: 2, rate: 150 },
      // a return whose bill is not loaded (Statistics cannot attach it to a bill either)
      { invoiceNo: '999', description: 'Cotton', qty: 1, rate: 150, returnAmount: 150 },
    ];
    const purchaseReturns = [
      { invoiceNo: 'P-1', description: 'Cotton', qty: 1, rate: 100, returnAmount: 100 },
      { invoiceNo: 'P-1', qty: 2, rate: 100 },
      { invoiceNo: 'P-404', description: 'Cotton', qty: 1, rate: 100, returnAmount: 100 },
    ];
    const { summary } = computeStocks(purchases, [bill1, bill2], [], [], salesReturns, purchaseReturns);
    // sales 2100 − (140 + 300); purchases 1000 − (100 + 200)
    expect(summary).toMatchObject({ totalSales: 1660, totalPurchases: 700, netProfitLoss: 960 });
    const { current } = computeAnalytics(
      { salesBills: [bill1, bill2], purchaseBills: purchases, salesReturns, purchaseReturns },
      'all',
    );
    expect([current.salesAmount, current.purchasesAmount]).toEqual([1660, 700]);
  });
});

describe('4. processing history lines open the lot where it is now', () => {
  const linkOf = (status, description = 'Grey 30s') => {
    const { rows } = computeStocks([], [], [], [], [], [], [], [], [lotAt(status)]);
    const row = rows.find((r) => r.description === description);
    return [...row.purchaseHistory, ...row.salesHistory].map((e) => [
      e.isProcessingIssue ? 'issue' : e.isProcessingReturn ? 'return' : 'receipt',
      processingLotLink(e),
    ]);
  };
  test('at dyeing / at combing -> Processing Lots on that stage; received -> Completed Lots', () => {
    expect(linkOf(LOT_STATUS.AT_DYEING)).toEqual([
      ['return', '/processing/lots?search=DC-001&stage=dyeing'],
      ['issue', '/processing/lots?search=DC-001&stage=dyeing'],
    ]);
    expect(linkOf(LOT_STATUS.AT_COMBING)).toEqual([
      ['return', '/processing/lots?search=DC-001&stage=combing'],
      ['issue', '/processing/lots?search=DC-001&stage=combing'],
    ]);
    expect(linkOf(LOT_STATUS.AT_COMBING, 'Navy Dyed 30s')).toEqual([
      ['return', '/processing/lots?search=DC-001&stage=combing'],
    ]);
    expect(linkOf(LOT_STATUS.RECEIVED)).toEqual([
      ['return', '/processing/completed?search=DC-001'],
      ['issue', '/processing/completed?search=DC-001'],
    ]);
    expect(linkOf(LOT_STATUS.RECEIVED, 'Navy Combed 30s')).toEqual([
      ['receipt', '/processing/completed?search=DC-001'],
    ]);
  });
  test('the search is the DC as the lot pages show it', () => {
    expect(processingLotLink({ rawInvoiceNo: '12', lotStatus: LOT_STATUS.AT_DYEING })).toBe(
      '/processing/lots?search=DC-12&stage=dyeing',
    );
  });
});

describe('5. negative opening stock', () => {
  test('is an opening stock: Edit / Delete, and its real value counts', () => {
    expect(openingActions({ opening: -3 })).toBe('edit');
    expect(openingActions({ opening: '-3' })).toBe('edit');
    expect(openingActions({ opening: 0, openingRolls: 0 })).toBe('add');
    expect(openingActions({})).toBe('add');
    const { rows } = computeStocks(purchases, [], [{ description: 'Cotton', qty: -3 }]);
    expect(rows[0]).toMatchObject({ opening: -3, available: 7 });
    expect(openingActions(rows[0])).toBe('edit');
  });
});

describe('6. stock status colours', () => {
  test('Oversold (negative stock) is red', () => {
    // the tone is passed explicitly, so the pill is red whatever the shared status map says about the text
    expect(stockStatus({ available: -2, minStockLevel: 0 })).toEqual({ label: 'Oversold', tone: 'danger' });
  });
});
