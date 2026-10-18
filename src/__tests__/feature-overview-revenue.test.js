import { db } from '@/core/db';
import {
  buildAvgCostLookup,
  computeRevenueRows,
  filterRevenueRows,
  invoiceDiscount,
  totalNetProfit,
} from '@/features/overview/revenue/revenueLogic';
import { loadRevenueRows } from '@/features/overview/revenue/revenueService';
const bill = (over) => ({
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
const inv = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-10-01',
  customerName: 'SLN TEX',
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
const prod = (description, qty, rate) => ({ description, qty, rate, amount: 0 });
// Cotton Shirt: (10 x 100 + 10 x 120) / 20 = 110 ; T Shirt: 5 x 50 / 5 = 50
const purchases = [
  bill({ products: [prod('Cotton Shirt', 10, 100), prod('  cotton shirt ', 10, 120)] }),
  bill({
    invoiceNo: 'P-002',
    products: [prod('T Shirt', '5', '50'), prod('', 3, 3), prod('Zero Qty', 0, 99)],
  }),
];
afterEach(() => jest.restoreAllMocks());
describe('average purchase cost', () => {
  test('total cost / total qty per trimmed UPPERCASE description, over all bills', () => {
    const avg = buildAvgCostLookup(purchases);
    expect(avg('Cotton Shirt')).toBe(110);
    expect(avg(' COTTON SHIRT  ')).toBe(110);
    expect(avg('t shirt')).toBe(50);
  });
  test('unknown product, empty description and zero purchased qty cost 0', () => {
    const avg = buildAvgCostLookup(purchases);
    expect(avg('Mystery')).toBe(0);
    expect(avg('')).toBe(0);
    expect(avg('zero qty')).toBe(0);
  });
  test('tolerates bills without a products array', () => {
    const avg = buildAvgCostLookup([{ products: undefined }, ...purchases]);
    expect(avg('Cotton Shirt')).toBe(110);
  });
  test('factors in completed dyeing batches for manufactured products (Workflow 2)', () => {
    // 10 raw grey rolls bought for ₹100 each, dyed with ₹300 expenses -> 10 rolls of 'Cotton 30s Red' at ₹130 unit cost
    const batches = [
      {
        batchId: 'B-001',
        status: 'COMPLETED',
        output: [{ description: 'Cotton 30s Red', qty: 10, unitCost: 130 }],
      },
    ];
    const avg = buildAvgCostLookup(purchases, batches);
    expect(avg('Cotton 30s Red')).toBe(130);

    // When sold for ₹180, profit is ₹50
    const sales = [
      inv({
        invoiceNo: '050',
        products: [{ description: 'Cotton 30s Red', qty: 1, rate: 180, amount: 180 }],
      }),
    ];
    const rows = computeRevenueRows(sales, purchases, batches);
    expect(rows[0].cost).toBe(130);
    expect(rows[0].profit).toBe(50);
  });
});
describe('invoiceDiscount', () => {
  test('discountAmount, else legacy discount, else 0', () => {
    expect(invoiceDiscount({ discountAmount: 25 })).toBe(25);
    expect(invoiceDiscount({ discountAmount: 0, discount: 15 })).toBe(15);
    expect(invoiceDiscount({ discount: 15 })).toBe(15);
    expect(invoiceDiscount({})).toBe(0);
    expect(invoiceDiscount({ discountAmount: '12.5' })).toBe(12.5);
  });
});
describe('computeRevenueRows', () => {
  const invoices = [
    // newest first like db.getAllInvoices
    inv({ invoiceNo: '010', invoiceDate: '2026-10-03', customerName: 'ZED', products: [] }),
    inv({
      invoiceNo: '003',
      invoiceDate: '2026-10-02',
      subtotal: 900,
      discountAmount: 25,
      products: [
        { description: 'Cotton Shirt', qty: 4, rate: 150, amount: 600 }, // (150-110) x 4 = 160, cost 440
        { description: 'T Shirt', qty: 2, rate: 60, amount: 120 }, // (60-50) x 2 = 20, cost 100
        { description: 'Mystery', qty: 1, rate: 30, amount: 30 }, // cost 0 -> profit 30
      ],
    }),
    {
      ...inv({
        invoiceNo: 'INV-001',
        invoiceDate: '',
        customerName: '',
        discount: 10,
        products: [{ description: 'Cotton Shirt', qty: '2', rate: '110' }],
      }),
      date: '2026-09-01',
    },
  ];
  const rows = computeRevenueRows(invoices, purchases);
  test('sorted by bill number ascending, "INV-" stripped for display only', () => {
    expect(rows.map((r) => r.billNo)).toEqual(['001', '003', '010']);
    expect(rows[0].rawBillNo).toBe('INV-001');
  });
  test('profit = sum((rate - avg cost) x qty) - discount; per-line numbers', () => {
    const r = rows[1];
    expect(r.lines).toEqual([
      {
        description: 'Cotton Shirt',
        qty: 4,
        sellingRate: 150,
        costRate: 110,
        profitPerUnit: 40,
        totalProfit: 160,
      },
      { description: 'T Shirt', qty: 2, sellingRate: 60, costRate: 50, profitPerUnit: 10, totalProfit: 20 },
      { description: 'Mystery', qty: 1, sellingRate: 30, costRate: 0, profitPerUnit: 30, totalProfit: 30 },
    ]);
    expect(r.discount).toBe(25);
    expect(r.profit).toBe(160 + 20 + 30 - 25);
    expect(r.cost).toBe(4 * 110 + 2 * 50);
    expect(r.revenue).toBe(900); // invoice.subtotal wins
  });
  test('legacy fields: discount, date, missing customer; revenue falls back to profit + cost', () => {
    const r = rows[0];
    expect(r.profit).toBe(-10); // (110 - 110) x 2 - 10
    expect(r.discount).toBe(10);
    expect(r.name).toBe('Unknown');
    expect(r.date).toBe('2026-09-01');
    expect(r.revenue).toBe(0 + 2 * 110); // subtotal 0 -> totalBillProfit + totalCost
  });
  test('invoice without products, without any date', () => {
    const r = rows[2];
    expect(r.lines).toEqual([]);
    expect(r.profit).toBe(0);
    expect(r.name).toBe('ZED');
    const [noDate] = computeRevenueRows([inv({ invoiceDate: '' })], []);
    expect(noDate.date).toBe('Unknown');
  });
  test('a product without a description is listed as "Unknown Item" at cost 0', () => {
    const [r] = computeRevenueRows(
      [inv({ products: [{ description: '', qty: 1, rate: 5, amount: 5 }] })],
      purchases,
    );
    expect(r.lines[0]).toMatchObject({ description: 'Unknown Item', costRate: 0, totalProfit: 5 });
  });
  test('bill numbers that are not numeric keep their incoming order', () => {
    const out = computeRevenueRows([inv({ invoiceNo: 'B' }), inv({ invoiceNo: 'A' })], []);
    expect(out.map((r) => r.billNo)).toEqual(['B', 'A']);
  });
  test('total net profit of the shown rows', () => {
    expect(totalNetProfit(rows)).toBe(-10 + 185 + 0);
    expect(totalNetProfit([])).toBe(0);
  });
});
describe('filterRevenueRows', () => {
  const rows = computeRevenueRows(
    [
      inv({ invoiceNo: '001', invoiceDate: '2026-10-02', customerName: 'SLN TEX' }),
      inv({ invoiceNo: '002', invoiceDate: '2026-10-03', customerName: 'Sri Lakshmi' }),
      inv({ invoiceNo: '003', invoiceDate: '2026-09-30', customerName: 'sln Fabrics' }),
    ],
    [],
  );
  const names = (d, n) => filterRevenueRows(rows, d, n).map((r) => r.billNo);
  test('no terms -> everything', () => expect(names('', '  ')).toEqual(['001', '002', '003']));
  test('date is a substring of the stored date', () => {
    expect(names('2026-10-02', '')).toEqual(['001']);
    expect(names('2026-10', '')).toEqual(['001', '002']);
  });
  test('name is a case-insensitive substring; both terms must match', () => {
    expect(names('', 'SLN')).toEqual(['001', '003']);
    expect(names('2026-09', 'sln')).toEqual(['003']);
    expect(names('2026-10-03', 'sln')).toEqual([]);
  });
});
describe('loadRevenueRows', () => {
  test('reads invoices and purchase bills through db', async () => {
    jest
      .spyOn(db, 'getAllInvoices')
      .mockResolvedValue([
        inv({ invoiceNo: '001', products: [{ description: 'T Shirt', qty: 2, rate: 60, amount: 120 }] }),
      ]);
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(purchases);
    const rows = await loadRevenueRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].profit).toBe(20);
  });
});

describe('revenueTotals', () => {
  test('sums bills, revenue, cost and profit over the whole list', async () => {
    const { revenueTotals } = await import('@/features/overview/revenue/revenueLogic');
    const rows = [
      { revenue: 1000, cost: 700, profit: 300 },
      { revenue: '500', cost: 600, profit: -100 },
    ];
    expect(revenueTotals(rows)).toEqual({ bills: 2, revenue: 1500, cost: 1300, profit: 200 });
    expect(revenueTotals([])).toEqual({ bills: 0, revenue: 0, cost: 0, profit: 0 });
  });
});
