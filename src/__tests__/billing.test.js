import {
  breakdownFromPayments,
  buildProductLines,
  calcPurchaseTotals,
  calcSalesTotals,
  calcSubtotal,
  calculateCustomerBalance,
  calculatePreviousBalanceAtTime,
  calculateSupplierPreviousBalanceAtTime,
  highestInvoiceNumber,
  purchaseAmountPaid,
  purchaseBalanceDue,
  suggestPurchaseInvoiceNumber,
  suggestSalesInvoiceNumber,
  totalRolls,
} from '@/core/billing';
import { db } from '@/core/db';
const inv = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-05-10',
  customerName: 'SLN TEX',
  customerAddress: '',
  customerPhone: '9876543210',
  products: [],
  subtotal: 0,
  previousBalance: 0,
  grandTotal: 0,
  amountPaid: 0,
  balanceDue: 0,
  ...over,
});
afterEach(() => jest.restoreAllMocks());
describe('totals', () => {
  test('subtotal = sum(qty*rate) with parseFloat(x)||0 coercion', () => {
    expect(
      calcSubtotal([
        { qty: '2', rate: '10.5' },
        { qty: '', rate: '5' },
        { qty: 3, rate: '2' },
      ]),
    ).toBe(27);
  });
  test('sales totals: previous + opening - discount, paid across methods + later payments', () => {
    const t = calcSalesTotals({
      subtotal: 1000,
      previousBalance: 250,
      manualPreviousBalance: 50,
      discount: 100,
      cash: 400,
      account: 100,
      additionalPaid: 200,
    });
    expect(t.grandTotal).toBe(1200);
    expect(t.totalPaid).toBe(700);
    expect(t.balanceDue).toBe(500);
  });
  test('sales totals read only cash + account (forms have no UPI amount any more)', () => {
    expect(
      calcSalesTotals({ subtotal: 100, previousBalance: 0, cash: 10, account: 20, upi: 999 }).totalPaid,
    ).toBe(30);
  });
  test('sales and purchase grand totals may go negative (a credit carries into the next bill)', () => {
    expect(calcSalesTotals({ subtotal: 100, previousBalance: 0, discount: 500 }).grandTotal).toBe(-400);
    // the web clamped purchases at 0, which silently dropped an advance paid to the supplier
    const p = calcPurchaseTotals({ subtotal: 100, previousBalance: -600, cash: 20 });
    expect(p.grandTotal).toBe(-500);
    expect(p.balanceDue).toBe(-520);
  });
  test('purchase totals ignore additionalPaid (purchase.js has no such concept)', () => {
    expect(
      calcPurchaseTotals({ subtotal: 100, previousBalance: 0, cash: 10, additionalPaid: 999 }).totalPaid,
    ).toBe(10);
  });
  test('buildProductLines: skips blank descriptions, numbers sequentially, optional qty>0 rule', () => {
    const rows = [
      { description: 'A', qty: '2', rate: '10' },
      { description: '  ', qty: '5', rate: '5' },
      { description: 'B', qty: '0', rate: '7' },
      { description: ' C ', qty: '1', rate: '3' },
    ];
    expect(buildProductLines(rows).map((l) => [l.sno, l.description, l.amount])).toEqual([
      [1, 'A', 20],
      [2, 'B', 0],
      [3, 'C', 3],
    ]);
    expect(buildProductLines(rows, { requirePositiveQty: true }).map((l) => l.description)).toEqual([
      'A',
      'C',
    ]);
  });
  test('buildProductLines keeps the optional roll count; rolls never decide a line or change its amount', () => {
    const rows = [
      { description: 'Cotton Grey', rolls: '12', qty: '80', rate: '100' },
      // an older form row without the field, and a blank box
      { description: 'Yarn', qty: '2', rate: '10' },
      { description: 'Silk', rolls: '', qty: '1', rate: '5' },
      // rolls alone do not make a line: no description / no qty
      { description: '', rolls: '4', qty: '3', rate: '1' },
      { description: 'Zero', rolls: '6', qty: '0', rate: '1' },
    ];
    expect(buildProductLines(rows)).toEqual([
      { sno: 1, description: 'Cotton Grey', qty: 80, rolls: 12, rate: 100, amount: 8000 },
      { sno: 2, description: 'Yarn', qty: 2, rolls: 0, rate: 10, amount: 20 },
      { sno: 3, description: 'Silk', qty: 1, rolls: 0, rate: 5, amount: 5 },
      { sno: 4, description: 'Zero', qty: 0, rolls: 6, rate: 1, amount: 0 },
    ]);
    expect(buildProductLines(rows, { requirePositiveQty: true }).map((l) => l.description)).toEqual([
      'Cotton Grey',
      'Yarn',
      'Silk',
    ]);
    expect(calcSubtotal(rows)).toBe(8028);
    expect(totalRolls(buildProductLines(rows))).toBe(18);
    expect(totalRolls([{ rolls: '3' }, {}, null, { rolls: 'x' }])).toBe(3);
  });
  test('breakdownFromPayments: Cash / Account; legacy UPI, GPay and bank count as account; unknown counts as cash', () => {
    expect(
      breakdownFromPayments([
        { amount: 100, paymentMethod: 'cash' },
        { amount: 50, paymentMethod: 'UPI' },
        { amount: 25, paymentMethod: 'bank' },
        { amount: 10, paymentMethod: 'account' },
        { amount: 5, paymentMethod: 'cheque' },
        { amount: 1, paymentMethod: '' },
        { amount: 4, paymentMethod: 'GPAY' },
        { amount: 2 },
      ]),
    ).toEqual({ cash: 108, account: 89 });
  });
});
describe('purchase bill field access (hybrid schema)', () => {
  test('nested payment object wins; falls back to top-level fields', () => {
    const fresh = { payment: { cash: 0, upi: 0, account: 0, totalPaid: 300, balanceDue: 700 } };
    const edited = { amountPaid: 100, balanceDue: 900 };
    expect(purchaseBalanceDue(fresh)).toBe(700);
    expect(purchaseAmountPaid(fresh)).toBe(300);
    expect(purchaseBalanceDue(edited)).toBe(900);
    expect(purchaseAmountPaid(edited)).toBe(100);
    expect(purchaseBalanceDue({})).toBe(0);
  });
  test('a nested balanceDue of 0 is respected (not treated as missing)', () => {
    expect(purchaseBalanceDue({ payment: { totalPaid: 5, balanceDue: 0 }, balanceDue: 999 })).toBe(0);
  });
});
describe('sales invoice numbering', () => {
  test('first invoice of the financial year is 001', () => {
    expect(suggestSalesInvoiceNumber([], '2026-05-01')).toMatchObject({
      nextInvoiceNo: '001',
      lastInvoiceNo: 'No invoices yet',
    });
  });
  test('increments the highest number in the FY, zero-padded', () => {
    const list = [inv({ invoiceNo: '007' }), inv({ invoiceNo: '012' }), inv({ invoiceNo: '003' })];
    expect(suggestSalesInvoiceNumber(list, '2026-06-01')).toMatchObject({
      lastInvoiceNo: '012',
      nextInvoiceNo: '013',
      nextNumber: 13,
    });
  });
  test('only the same financial year counts (April resets)', () => {
    const list = [
      inv({ invoiceNo: '250', invoiceDate: '2026-03-31' }),
      inv({ invoiceNo: '004', invoiceDate: '2026-04-02' }),
    ];
    expect(highestInvoiceNumber(list, '2026-05-01').highestNumber).toBe(4);
    expect(highestInvoiceNumber(list, '2026-02-01').highestNumber).toBe(250);
  });
  test('wraps 999 -> 001 and flags the cycle restart', () => {
    const r = suggestSalesInvoiceNumber([inv({ invoiceNo: '999' })], '2026-05-01');
    expect(r.nextInvoiceNo).toBe('001');
    expect(r.cycleRestarted).toBe(true);
  });
  test('keeps the letter prefix / suffix of the last invoice', () => {
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: 'INV-009' })], '2026-05-01').nextInvoiceNo).toBe(
      'INV010',
    );
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: '009A' })], '2026-05-01').nextInvoiceNo).toBe('010A');
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: 'S009X' })], '2026-05-01').nextInvoiceNo).toBe(
      'S010X',
    );
  });
  test('pads a purely numeric last invoice for display', () => {
    expect(suggestSalesInvoiceNumber([inv({ invoiceNo: '5' })], '2026-05-01').lastInvoiceNo).toBe('005');
  });
});
describe('purchase invoice numbering', () => {
  test('empty list', () =>
    expect(suggestPurchaseInvoiceNumber([])).toEqual({
      lastInvoiceNo: 'No invoices yet',
      nextInvoiceNo: '001',
    }));
  test('ignores a P- prefix and uses all bills (no FY reset)', () => {
    expect(
      suggestPurchaseInvoiceNumber([{ invoiceNo: 'P-009' }, { invoiceNo: '12' }, { invoiceNo: 'x' }]),
    ).toEqual({
      lastInvoiceNo: '012',
      nextInvoiceNo: '013',
    });
  });
});
describe('balance carried forward (running-balance ledger)', () => {
  const stub = (invoices, returns = []) => {
    jest.spyOn(db, 'getAllInvoices').mockResolvedValue(invoices);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue(returns);
  };
  /** a self-consistent invoice: grandTotal / balanceDue follow from subtotal, previous balance and payments */
  const bill = (no, subtotal, paid, previousBalance = 0, over = {}) =>
    inv({
      invoiceNo: no,
      subtotal,
      previousBalance,
      grandTotal: subtotal + previousBalance,
      amountPaid: paid,
      balanceDue: subtotal + previousBalance - paid,
      ...over,
    });
  test('new bill: carries the latest invoice closing balance (balance due minus its returns)', async () => {
    stub([bill('001', 1000, 600), bill('002', 900, 600, 400)], [{ invoiceNo: '002', returnAmount: 150 }]);
    // 001: 1000 - 600 = 400 carried; 002: 900 + 400 - 600 = 700, minus 150 returned = 550
    const r = await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', null);
    expect(r.balanceCarriedForward).toBe(550);
    expect(r.invoiceCount).toBe(2);
    expect(r.totalPreviousBills).toBe(2300);
  });
  test('stale stored balances of earlier bills do not leak into the new bill', async () => {
    // 002 was saved when 001 still owed 1000; 001 was paid in full later and 002 was never refreshed
    stub([bill('001', 1000, 1000), bill('002', 500, 0, 1000)]);
    expect((await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', null)).balanceCarriedForward).toBe(
      500,
    );
  });
  test('discount and opening balance of earlier bills are part of the carried balance', async () => {
    stub([bill('001', 1000, 0, 0, { manualPreviousBalance: 200, discountAmount: 50 })]);
    expect((await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', null)).balanceCarriedForward).toBe(
      1150,
    );
  });
  test('orders by invoice date first: numbers restart every financial year', async () => {
    stub([
      bill('250', 1000, 1000, 0, { invoiceDate: '2026-03-30' }),
      bill('001', 300, 0, 0, { invoiceDate: '2026-04-02' }),
    ]);
    // the latest bill is 001 of the new year (300 owed), not 250 of the old year (settled)
    expect((await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', null)).balanceCarriedForward).toBe(
      300,
    );
  });
  test('a back-dated new bill carries the balance of the bill before its date', async () => {
    stub([
      bill('001', 1000, 0, 0, { invoiceDate: '2026-05-01' }),
      bill('002', 500, 0, 1000, { invoiceDate: '2026-05-20' }),
    ]);
    const r = await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', '003', '2026-05-10');
    expect(r.balanceCarriedForward).toBe(1000);
    expect(r.invoiceCount).toBe(1);
  });
  test('matches by phone when present, else by case-insensitive name', async () => {
    stub([bill('001', 50, 0, 0, { customerPhone: '1111111111', customerName: 'Other' })]);
    jest.spyOn(db, 'getCustomer').mockResolvedValue(null);
    expect((await calculatePreviousBalanceAtTime('anything', '2222222222')).invoiceCount).toBe(0);
    stub([bill('001', 50, 0, 0, { customerPhone: '', customerName: 'SLN Tex' })]);
    expect((await calculatePreviousBalanceAtTime('sln tex', null)).balanceCarriedForward).toBe(50);
  });
  test("a customer's first bill starts from the customer's opening balance", async () => {
    stub([]);
    jest.spyOn(db, 'getCustomer').mockResolvedValue({ phone: '9876543210', openingBalance: '750' });
    expect((await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', null)).balanceCarriedForward).toBe(
      750,
    );
  });
  test('editing an existing invoice: balance comes from the invoice before it; the first keeps its opening', async () => {
    stub([bill('001', 1000, 700, 0), bill('002', 1000, 500, 300)], [{ invoiceNo: '001', returnAmount: 100 }]);
    const r = await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', '002');
    expect(r.balanceCarriedForward).toBe(200);
    expect(r.totalPreviousBills).toBe(1000);
    stub([bill('001', 1000, 0, 125), bill('002', 100, 0, 1125)]);
    expect((await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', '001')).balanceCarriedForward).toBe(
      125,
    );
  });
  test('a failed read is reported as failed (callers keep what they had)', async () => {
    jest.spyOn(db, 'getAllInvoices').mockRejectedValue(new Error('offline'));
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    const r = await calculatePreviousBalanceAtTime('SLN TEX', '9876543210', null);
    expect(r).toMatchObject({ failed: true, balanceCarriedForward: 0 });
  });
  test('calculateCustomerBalance uses the most recent invoice (by number) excluding the current one', async () => {
    stub([
      inv({ invoiceNo: '001', balanceDue: 10, grandTotal: 100 }),
      inv({ invoiceNo: '002', balanceDue: 20, grandTotal: 200 }),
    ]);
    jest.spyOn(db, 'getReturnsByInvoice').mockResolvedValue([]);
    const r = await calculateCustomerBalance('SLN TEX', '002');
    expect(r.lastInvoiceNo).toBe('001');
    expect(r.balanceCarriedForward).toBe(10);
  });
});
describe('supplier balance carried forward', () => {
  const pbill = (no, subtotal, paid, previousBalance = 0, over = {}) => ({
    invoiceNo: no,
    invoiceDate: '2026-05-10',
    supplierName: 'S',
    supplierPhone: '9',
    subtotal,
    previousBalance,
    grandTotal: subtotal + previousBalance,
    payment: {
      cash: paid,
      upi: 0,
      account: 0,
      totalPaid: paid,
      balanceDue: subtotal + previousBalance - paid,
    },
    ...over,
  });
  const stub = (bills, returns = []) => {
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(bills);
    jest.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue(returns);
  };
  test('reads the nested payment of bills created on the purchase screen (the web carried 0 for them)', async () => {
    stub([pbill('001', 500, 0)]);
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', null)).balanceCarriedForward).toBe(500);
  });
  test('edited / legacy bills with top-level amountPaid count too; returns lower the carried balance', async () => {
    stub(
      [
        pbill('001', 500, 0),
        { ...pbill('002', 300, 0, 500), payment: undefined, amountPaid: 680, balanceDue: 120 },
      ],
      [{ invoiceNo: '002', returnAmount: 20 }],
    );
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', null)).balanceCarriedForward).toBe(100);
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', '002')).balanceCarriedForward).toBe(500);
  });
  test('a bill paid later is followed by every later bill without re-saving anything', async () => {
    // 001 got a 500 payment from history after 002 was written with 500 carried
    stub([pbill('001', 500, 500), pbill('002', 300, 0, 500)]);
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', null)).balanceCarriedForward).toBe(300);
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', '002')).balanceCarriedForward).toBe(0);
  });
  test("a supplier's first bill starts from the supplier's opening balance", async () => {
    stub([]);
    jest.spyOn(db, 'getSupplier').mockResolvedValue({ phone: '9', openingBalance: 40 });
    expect((await calculateSupplierPreviousBalanceAtTime('S', '9', null)).balanceCarriedForward).toBe(40);
  });
});
