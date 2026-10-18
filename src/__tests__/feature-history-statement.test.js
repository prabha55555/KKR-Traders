import { CREDIT_LINE } from '@/core/branding';
import { db } from '@/core/db';
import { SALES_LEDGER, partySummary, returnsTotalsByInvoice } from '@/core/ledger';
import {
  buildCombinedStatement,
  buildEasyStatement,
  findStatementParties,
  partyChoice,
  sortNewestFirst,
  sortOldestFirst,
  statementState,
} from '@/features/history/lib/statement';
import {
  buildCombinedStatementHtml,
  buildEasyStatementHtml,
  buildInvoiceStatementHtml,
  combinedStatementFileName,
  easyStatementFileName,
  esc,
  invoiceStatementFileName,
} from '@/features/history/lib/statementHtml';
import {
  buildCombinedStatementMessage,
  checkWhatsAppPhone,
  combinedStatementWhatsAppUrl,
} from '@/features/history/lib/statementMessage';
import { SALES_LABELS } from '@/features/history/lib/types';
import { buildSalesHistoryData, toHistoryInvoice } from '@/features/history/sales/salesModel';
import { loadCustomerStatement } from '@/features/history/sales/salesStatements';
const NOW = new Date(2026, 9, 4, 16, 5, 9);
const sales = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-09-01',
  customerName: 'SLN TEX',
  customerAddress: 'Tirupur',
  customerPhone: '98765 43210',
  products: [{ description: 'Cotton Shirt', qty: 10, rate: 100, amount: 1000 }],
  subtotal: 1000,
  previousBalance: 0,
  grandTotal: 1000,
  paymentBreakdown: { cash: 400, account: 0 },
  amountPaid: 400,
  balanceDue: 600,
  ...over,
});
const payment = (over) => ({
  id: 'p',
  invoiceNo: '001',
  paymentDate: '2026-09-01',
  amount: 0,
  paymentMethod: 'cash',
  paymentType: 'initial',
  ...over,
});
const ret = (over) => ({
  id: 'r',
  invoiceNo: '002',
  returnDate: '2026-10-04',
  description: 'T Shirt',
  qty: 2,
  rate: 50,
  returnAmount: 100,
  reason: 'torn',
  ...over,
});
const INVOICES = [
  sales({}),
  sales({
    invoiceNo: '002',
    invoiceDate: '2026-10-03',
    products: [
      { description: 'Cotton Shirt', qty: 5, rate: 100, amount: 500 },
      { description: 'T Shirt', qty: 2, rate: 50, amount: 100 },
    ],
    subtotal: 600,
    previousBalance: 600,
    manualPreviousBalance: 0,
    discountAmount: 50,
    grandTotal: 1150,
    // a legacy split with a UPI amount: read as Account
    paymentBreakdown: { cash: 0, upi: 200, account: 0 },
    amountPaid: 200,
    balanceDue: 950,
  }),
];
const PAYMENTS = [
  payment({ id: 'p1', invoiceNo: '001', amount: 400, paymentDate: '2026-09-01' }),
  payment({ id: 'p2', invoiceNo: '002', amount: 200, paymentMethod: 'upi', paymentDate: '2026-10-03' }),
];
const RETURNS = [ret({})];
const history = () => buildSalesHistoryData(INVOICES, RETURNS, PAYMENTS).invoices;
/** the party's ledger position, as loadCustomerStatement passes it */
const summary = () =>
  partySummary(SALES_LEDGER, INVOICES, { returnsByInvoice: returnsTotalsByInvoice(RETURNS) });
const statement = () => buildCombinedStatement('sln', history(), summary());
afterEach(() => jest.restoreAllMocks());
describe('sales view-model (same numbers as the web card)', () => {
  test('previous balance = previous + opening; adjusted balance = balanceDue - (balance-settled) returns; discount legacy fallback', () => {
    const inv = toHistoryInvoice(
      sales({
        previousBalance: 200,
        manualPreviousBalance: 50,
        discountAmount: undefined,
        discount: 25,
        balanceDue: 900,
      }),
      [],
      [ret({ invoiceNo: '001', returnAmount: 100 }), ret({ id: 'r2', invoiceNo: '001', returnAmount: 20.5 })],
      true,
    );
    expect(inv).toMatchObject({
      previousBalance: 250,
      discountAmount: 25,
      totalReturns: 120.5,
      adjustedBalanceDue: 779.5,
      canAddPayment: true,
      partyName: 'SLN TEX',
      partyPhone: '98765 43210',
    });
  });
  test('refunded returns are listed in totalReturns but do not lower the adjusted balance', () => {
    const inv = toHistoryInvoice(
      sales({ balanceDue: 600 }),
      [],
      [
        ret({ invoiceNo: '001', returnAmount: 100 }), // legacy: adjusted the balance
        ret({ id: 'c', invoiceNo: '001', returnAmount: 50, settlementType: 'refund', refundMethod: 'cash' }),
        ret({ id: 'b', invoiceNo: '001', returnAmount: 30, refundMethod: 'bank', bankAccountId: 'hdfc' }),
      ],
      false,
    );
    expect(inv).toMatchObject({
      totalReturns: 180,
      balanceReturns: 100,
      refundedReturns: 80,
      adjustedBalanceDue: 500,
      billAmount: 1000,
    });
    expect(inv.returns.find((r) => r.id === 'b')).toMatchObject({
      refundMethod: 'bank',
      bankAccountId: 'hdfc',
    });
  });
  test('payments and the split are Cash / Account only (legacy UPI reads as Account)', () => {
    const inv = toHistoryInvoice(
      sales({ paymentMethod: 'UPI', paymentBreakdown: { cash: 100, upi: 300 } }),
      [payment({ id: 'u', paymentMethod: 'gpay', amount: 300 })],
      [],
      false,
    );
    expect(inv.paymentBreakdown).toEqual({ cash: 100, account: 300 });
    expect(inv.legacyPaymentMethod).toBe('account');
    expect(inv.payments[0].paymentMethod).toBe('account');
  });
  test('payments / returns come from the once-built lookups; legacy `date` fields are honoured', () => {
    const legacyPayment = {
      ...payment({ id: 'old', invoiceNo: '001' }),
      paymentDate: '',
      date: '2025-01-02',
    };
    const list = buildSalesHistoryData(
      INVOICES,
      [ret({ invoiceNo: '002' })],
      [legacyPayment, PAYMENTS[1]],
    ).invoices;
    const byNo = new Map(list.map((i) => [i.invoiceNo, i]));
    expect(byNo.get('001')?.payments.map((p) => p.paymentDate)).toEqual(['2025-01-02']);
    expect(byNo.get('002')?.returns).toHaveLength(1);
    expect(byNo.get('002')?.totalReturns).toBe(100);
  });
  test('includes manualBillImage and hasManualBillImage indicator', () => {
    const withImg = toHistoryInvoice(sales({ manualBillImage: 'data:image/jpeg;base64,TEST' }), [], [], true);
    expect(withImg.manualBillImage).toBe('data:image/jpeg;base64,TEST');
    expect(withImg.hasManualBillImage).toBe(true);

    const withoutImg = toHistoryInvoice(sales({}), [], [], true);
    expect(withoutImg.manualBillImage).toBeNull();
    expect(withoutImg.hasManualBillImage).toBe(false);
  });
  test('"Add Payment" only on each customer\'s latest invoice (over all invoices); list is newest first', () => {
    const list = buildSalesHistoryData(
      [
        ...INVOICES,
        sales({
          invoiceNo: '003',
          invoiceDate: '2026-10-01',
          customerName: 'Other',
          customerPhone: '9000000000',
        }),
        sales({
          invoiceNo: '004',
          invoiceDate: '2026-10-01',
          customerName: 'Other',
          customerPhone: '9000000000',
        }),
      ],
      [],
      [],
    ).invoices;
    expect(list.map((i) => [i.invoiceNo, i.canAddPayment])).toEqual([
      ['002', true],
      ['004', true],
      ['003', false],
      ['001', false],
    ]);
  });
});
describe('combined statement aggregation', () => {
  const OTHER_RAVI = sales({ invoiceNo: '005', customerName: 'Ravi', customerPhone: '9000000001' });
  const RAVI = sales({ invoiceNo: '006', customerName: 'Ravi', customerPhone: '9000000002' });
  const RAVI_KUMAR = sales({ invoiceNo: '007', customerName: 'Ravi Kumar', customerPhone: '9000000003' });
  const ALL = [...INVOICES, OTHER_RAVI, RAVI, RAVI_KUMAR];
  const found = (q) => findStatementParties(SALES_LEDGER, ALL, q).map((p) => p.bills.map((b) => b.invoiceNo));
  test('one statement = one ledger party: phone, else exact name, else part of a name (ignoring case)', () => {
    expect(found('sln')).toEqual([['001', '002']]);
    expect(found(' TEX ')).toEqual([['001', '002']]);
    expect(found('nobody')).toEqual([]);
    expect(found('')).toEqual([]);
    // a typed phone (any spacing) is that party only
    expect(found('90000 00002')).toEqual([['006']]);
    // two customers called "Ravi" are two parties to pick from — never added up; "Ravi Kumar" is not an exact match
    expect(found('ravi')).toEqual([['005'], ['006']]);
    expect(found('kumar')).toEqual([['007']]);
    const [first] = findStatementParties(SALES_LEDGER, ALL, 'ravi');
    expect(partyChoice(first)).toEqual({ key: 'p:9000000001', name: 'Ravi', phone: '9000000001', count: 1 });
  });
  test('section state: nothing / pick a party / the statement', () => {
    expect(statementState(null, 'x')).toEqual({ status: 'empty', query: 'x' });
    expect(statementState({ choices: [{ key: 'a' }] }, 'x')).toEqual({
      status: 'choose',
      query: 'x',
      parties: [{ key: 'a' }],
    });
    expect(statementState({ invoices: [] }, 'x')).toEqual({ status: 'ready', statement: { invoices: [] } });
  });
  test('invoices newest first; totals come from the party ledger (outstanding = ledger closing)', () => {
    const s = statement();
    expect(s.invoices.map((i) => i.invoiceNo)).toEqual(['002', '001']);
    expect(s.mostRecent.invoiceNo).toBe('002');
    expect(s.partyName).toBe('sln');
    expect(s.partyPhone).toBe('98765 43210');
    expect(s.totals).toEqual({
      totalInvoices: 2,
      opening: 0,
      totalBilled: 1550, // 1000 + (600 - 50 discount): no carried balances
      totalPaid: 600,
      totalDiscount: 50,
      totalReturns: 100,
      balanceReturns: 100,
      refundedReturns: 0,
      totalCash: 400,
      totalAccount: 200, // the legacy UPI amount
      outstanding: 850, // 1000 - 400 = 600 carried; 600 + 550 - 200 = 950; minus the legacy return 100
    });
  });
  test("without a ledger summary the totals are summed from the views; outstanding = the latest bill's due", () => {
    expect(buildCombinedStatement('sln', history()).totals).toMatchObject({
      totalBilled: 1550,
      totalPaid: 600,
      outstanding: 850,
    });
  });
  test('a refunded return is shown but leaves the outstanding balance alone', () => {
    const refund = [{ ...RETURNS[0], settlementType: 'refund', refundMethod: 'cash' }];
    const s = buildCombinedStatement(
      'sln',
      buildSalesHistoryData(INVOICES, refund, PAYMENTS).invoices,
      partySummary(SALES_LEDGER, INVOICES, { returnsByInvoice: returnsTotalsByInvoice(refund) }),
    );
    expect(s.totals).toMatchObject({
      totalReturns: 100,
      balanceReturns: 0,
      refundedReturns: 100,
      outstanding: 950,
    });
  });
  test('nothing matched -> null', () => {
    expect(buildCombinedStatement('x', [])).toBeNull();
    expect(buildEasyStatement([])).toBeNull();
  });
  test('ordering helpers', () => {
    const rows = [
      { invoiceNo: '010', invoiceDate: '2026-01-02' },
      { invoiceNo: '002', invoiceDate: '2026-01-02' },
      { invoiceNo: '003', invoiceDate: '2026-01-01' },
    ];
    // ledger order: bill date, then bill number
    expect(sortNewestFirst(rows).map((r) => r.invoiceNo)).toEqual(['010', '002', '003']);
    expect(sortOldestFirst(rows).map((r) => r.invoiceNo)).toEqual(['003', '002', '010']);
  });
});
describe('simplified ("Easy") statement', () => {
  test('oldest first; particulars joined and cut at 50 chars; balance = opening + bills - paid - deducted returns', () => {
    const long = sales({
      invoiceNo: '003',
      invoiceDate: '2026-10-05',
      products: [
        { description: 'Extra Long Cotton Printed Round Neck Shirt', qty: 1, rate: 1, amount: 1 },
        { description: 'Another One', qty: 1, rate: 1, amount: 1 },
      ],
      subtotal: 2,
      amountPaid: 0,
      grandTotal: 2,
      balanceDue: 2,
    });
    const easy = buildEasyStatement(buildSalesHistoryData([...INVOICES, long], RETURNS, PAYMENTS).invoices);
    expect(easy.rows.map((r) => r.invoiceNo)).toEqual(['001', '002', '003']);
    expect(easy.rows[1].particulars).toBe('Cotton Shirt, T Shirt');
    expect(easy.rows[1].returnsDeducted).toBe(100);
    expect(easy.rows[2].particulars).toBe('Extra Long Cotton Printed Round Neck Shirt, Ano...');
    expect(easy.rows[2].particulars).toHaveLength(50);
    // bill amounts are after discount (1000 + 550 + 2)
    expect(easy).toMatchObject({ totalBill: 1552, totalPaid: 600, totalReturns: 100, balanceDue: 852 });
    expect(easy.partyPhone).toBe('98765 43210');
    // the ledger's outstanding figure wins when given; the opening is added
    expect(buildEasyStatement(history(), { opening: 200, outstanding: 1050 })).toMatchObject({
      opening: 200,
      totalBill: 1550,
      balanceDue: 1050,
    });
    expect(buildEasyStatement(history(), { opening: 200 }).balanceDue).toBe(200 + 1550 - 600 - 100);
  });
  test('refunded returns are noted on the line but not deducted', () => {
    const refund = [{ ...RETURNS[0], settlementType: 'refund', refundMethod: 'bank', bankAccountId: 'x' }];
    const easy = buildEasyStatement(buildSalesHistoryData(INVOICES, refund, PAYMENTS).invoices);
    expect(easy.rows[1]).toMatchObject({ returnsDeducted: 0, returnsRefunded: 100 });
    expect(easy).toMatchObject({ totalReturns: 0, balanceDue: 950 });
  });
  test('an invoice without products reads "Products Purchased"', () => {
    const easy = buildEasyStatement([toHistoryInvoice(sales({ products: [] }), [], [], false)]);
    expect(easy.rows[0].particulars).toBe('Products Purchased');
  });
});
describe('statement HTML', () => {
  test('combined (detailed): sections, per-invoice tables, payment history, footer', () => {
    const html = buildCombinedStatementHtml({ statement: statement(), labels: SALES_LABELS, now: NOW });
    expect(html).toContain('COMBINED ACCOUNT STATEMENT');
    expect(html).toContain('CUSTOMER INFORMATION');
    expect(html).toContain('Name: sln');
    expect(html).toContain('Phone: 98765 43210');
    expect(html).toContain('INVOICE NO 002 - 3/10/2026');
    expect(html.indexOf('INVOICE NO 002')).toBeLessThan(html.indexOf('INVOICE NO 001'));
    for (const header of ['S.No.', 'Description', 'Qty', 'Rate', 'Amount', 'Date', 'Product', 'Balance'])
      expect(html).toContain(`>${header}</th>`);
    expect(html).toContain('RETURN INFORMATION');
    expect(html).toContain('PAYMENT HISTORY');
    // payment p2 is a legacy UPI payment of type 'initial': printed as Account
    expect(html).toContain('Payment - Initial (ACCOUNT)');
    expect(html).not.toMatch(/UPI/i);
    expect(html).toContain('-Rs. 200.00');
    expect(html).toContain('Product Returns');
    expect(html).toContain('Total Billed:</span><span>Rs. 1,550.00');
    expect(html).toContain('Outstanding Balance:</span><span>Rs. 850.00');
    expect(html).toContain('This is a computer-generated statement. No signature is required.');
    expect(html).toContain('For any queries, please contact: 90872 93268, 9092779599');
    expect(html).toContain('Generated on: 4/10/2026, 4:05:09 pm');
    expect(html).toContain('Software created by Sabarish R.');
    expect(html).not.toContain('<img');
  });
  test('combined: the logo is used for header when given; return/payment sections only when present', () => {
    const only = buildCombinedStatement('SLN TEX', [toHistoryInvoice(INVOICES[0], [], [], false)]);
    const html = buildCombinedStatementHtml({
      statement: only,
      labels: SALES_LABELS,
      logoSrc: 'data:image/png;base64,AAA',
      now: NOW,
    });
    expect(html.match(/data:image\/png;base64,AAA/g)).toHaveLength(1);
    expect(html).not.toContain('RETURN INFORMATION');
    expect(html).not.toContain('PAYMENT HISTORY');
  });
  test('user text is escaped', () => {
    const s = buildCombinedStatement('<b>Tex</b> & Co', [
      toHistoryInvoice(sales({ customerAddress: '"A" <x>' }), [], [], false),
    ]);
    const html = buildCombinedStatementHtml({ statement: s, labels: SALES_LABELS, now: NOW });
    expect(html).toContain('Name: &lt;b&gt;Tex&lt;/b&gt; &amp; Co');
    expect(html).toContain('Address: &quot;A&quot; &lt;x&gt;');
    expect(esc(undefined)).toBe('');
  });
  test('easy: ledger table + totals; returns line only when there are returns; no developer credit line', () => {
    const html = buildEasyStatementHtml({
      partyName: 'sln',
      invoices: statement().invoices,
      labels: SALES_LABELS,
      now: NOW,
    });
    for (const header of ['Invoice No', 'Date', 'Particulars', 'Amount', 'Received'])
      expect(html).toContain(`>${header}</th>`);
    expect(html).toContain('(Returns deducted: -Rs. 100.00)');
    expect(html).toContain('(Discount: -Rs. 50.00)');
    expect(html).toContain('Total Amount:</span><span>Rs. 1,550.00');
    expect(html).toContain('Total Received:</span><span>Rs. 600.00');
    expect(html).toContain('Returns Deducted:</span><span>-Rs. 100.00');
    expect(html).toContain('Balance Due:</span><span>Rs. 850.00');
    expect(html).not.toContain('Opening Balance');
    expect(html).not.toContain('Powered by Brightlight Solutions');
    expect(html.indexOf('>001<')).toBeLessThan(html.indexOf('>002<'));
    const noReturns = buildEasyStatementHtml({
      partyName: 'x',
      invoices: [history().find((i) => i.invoiceNo === '001')],
      labels: SALES_LABELS,
      now: NOW,
    });
    expect(noReturns).not.toContain('Returns Deducted');
    expect(
      buildEasyStatementHtml({ partyName: 'x', invoices: [], labels: SALES_LABELS, now: NOW }),
    ).toBeNull();
    // with the ledger figures: an opening line and Balance Due = the ledger outstanding
    const ledger = buildEasyStatementHtml({
      partyName: 'sln',
      invoices: statement().invoices,
      labels: SALES_LABELS,
      now: NOW,
      opening: 250,
      outstanding: 1100,
    });
    expect(ledger).toContain('Opening Balance:</span><span>Rs. 250.00');
    expect(ledger).toContain('Balance Due:</span><span>Rs. 1,100.00');
  });
  test('single invoice statement: summary lines follow generatePDFStatement', () => {
    const inv = history().find((i) => i.invoiceNo === '002');
    const html = buildInvoiceStatementHtml({
      invoice: inv,
      payments: inv.payments,
      returns: inv.returns,
      totalReturns: 100,
      adjustedBalanceDue: 850,
      labels: SALES_LABELS,
      now: NOW,
    });
    expect(html).toContain('ACCOUNT STATEMENT');
    expect(html).toContain('Invoice No: 002');
    expect(html).toContain('Invoice Date: 3/10/2026');
    expect(html).toContain('INVOICE DETAILS');
    expect(html).toContain('Current Bill Amount: Rs. 600.00');
    expect(html).toContain('Previous Balance: Rs. 600.00');
    expect(html).toContain('Discount Amount: -Rs. 50.00');
    expect(html).toContain('Total Amount: Rs. 1,150.00');
    expect(html).toContain('Amount Paid: Rs. 200.00');
    expect(html).toContain('Returns (adjusted): -Rs. 100.00');
    expect(html).toContain('Adjusted Balance Due: Rs. 850.00');
    expect(html).toContain('RETURN INFORMATION');
    expect(html).toContain('4/10/2026'); // PARITY: opening payment-table row carries today's date
  });
  test('single invoice statement with a refunded return: listed, the balance due stays', () => {
    const refund = [{ ...RETURNS[0], settlementType: 'refund', refundMethod: 'cash' }];
    const inv = buildSalesHistoryData(INVOICES, refund, PAYMENTS).invoices.find((i) => i.invoiceNo === '002');
    const html = buildInvoiceStatementHtml({
      invoice: inv,
      payments: inv.payments,
      returns: inv.returns,
      totalReturns: inv.totalReturns,
      balanceReturns: inv.balanceReturns,
      adjustedBalanceDue: inv.adjustedBalanceDue,
      labels: SALES_LABELS,
      now: NOW,
    });
    expect(html).toContain('Returns (refunded): Rs. 100.00');
    expect(html).toContain('Balance Due: Rs. 950.00');
    expect(html).not.toContain('Adjusted Balance Due');
    // the payment table shows the refund as a row that does not change the balance
    expect(html).toContain('Product Returns (refunded)');
  });
  test('single invoice statement without returns / previous balance / discount', () => {
    const inv = history().find((i) => i.invoiceNo === '001');
    const html = buildInvoiceStatementHtml({
      invoice: inv,
      payments: [],
      returns: [],
      totalReturns: 0,
      adjustedBalanceDue: 600,
      labels: SALES_LABELS,
      now: NOW,
    });
    expect(html).toContain('Balance Due: Rs. 600.00');
    expect(html).not.toContain('Adjusted Balance Due');
    expect(html).not.toContain('Previous Balance');
    expect(html).not.toContain('Discount Amount');
    expect(html).not.toContain('RETURN INFORMATION');
    expect(html).toContain('PAYMENT HISTORY');
  });
  test('file names', () => {
    expect(combinedStatementFileName('SLN Tex & Co.', NOW)).toBe('SS_SLN_Tex___Co__2026-10-04.pdf');
    expect(easyStatementFileName('sln', NOW)).toBe('SS_Easy_sln_2026-10-04.pdf');
    expect(invoiceStatementFileName('002', 'SLN TEX', NOW)).toBe('SS_002_SLN TEX_2026-10-04.pdf');
    expect(invoiceStatementFileName('002', 'A/B', NOW)).toBe('SS_002_A_B_2026-10-04.pdf');
  });
});
describe('WhatsApp text of the combined statement', () => {
  // built per test: the business on it is the Settings of the test (applied before each test)
  let message;
  beforeEach(() => {
    message = buildCombinedStatementMessage(statement(), SALES_LABELS);
  });
  test('header, customer block and invoices (newest first) with their figures', () => {
    expect(message).toContain('*SANTHAMANI TEXTILES - ACCOUNT STATEMENT*');
    expect(message).toContain('*CUSTOMER DETAILS*');
    expect(message).toContain('👤 Customer: sln');
    expect(message).toContain('📍 Address: Tirupur');
    expect(message).toContain('📊 Total Invoices: 2');
    expect(message.indexOf('*INVOICE NO 002*')).toBeLessThan(message.indexOf('*INVOICE NO 001*'));
    expect(message).toContain('📅 Date: 3/10/2026');
    expect(message).toContain('   Current Bill: ₹600.00');
    expect(message).toContain('   Previous Balance: ₹600.00');
    expect(message).toContain('   Discount Amount: -₹50.00');
    expect(message).toContain('   Total Amount: ₹1,150.00');
    expect(message).toContain('   Amount Paid: ₹200.00');
    expect(message).toContain('💳 🏦 Account: ₹200.00');
    expect(message).not.toMatch(/UPI/i);
    expect(message).toContain('   Returns: -₹100.00');
    expect(message).toContain('   1. Cotton Shirt\n      Qty: 5 × Rate: ₹100.00 = ₹500.00');
    expect(message).toContain('   1. T Shirt\n      Qty: 2 × Rate: ₹50.00 = -₹100.00\n      Reason: torn');
    expect(message).toContain('✅ *ADJUSTED BALANCE DUE: ₹850.00*');
    expect(message).toContain('✅ *BALANCE DUE: ₹600.00*');
  });
  test('overall summary, return summary, invoice list, contact block', () => {
    expect(message).toContain('💰 Total Bill Amount: ₹1,550.00');
    expect(message).toContain('💳 Total Amount Paid: ₹600.00');
    expect(message).toContain('   💵 Cash: ₹400.00');
    expect(message).toContain('   🏦 Account: ₹200.00');
    expect(message).toContain('🔄 Total Returns: -₹100.00');
    expect(message).toContain('✅ *ADJUSTED OUTSTANDING BALANCE: ₹850.00*');
    expect(message).toContain('*RETURN SUMMARY*');
    expect(message).toContain('📦 Total Return Amount: ₹100.00');
    expect(message).toContain('*INVOICE NOS*');
    expect(message).toContain('• 002 - 3/10/2026 - Due: ₹850.00');
    expect(message).toContain('• 001 - 1/9/2026 - Due: ₹600.00');
    expect(message).toContain('📍 Tirupur');
    expect(message).toContain('📞 *Phone: 90872 93268, 9092779599*');
    expect(
      message.trimEnd().endsWith('_This is an automated statement. Please contact us for any queries._'),
    ).toBe(true);
  });
  test('without returns: outstanding balance of the most recent invoice and no return sections', () => {
    const plain = buildCombinedStatement('SLN TEX', buildSalesHistoryData(INVOICES, [], PAYMENTS).invoices);
    const text = buildCombinedStatementMessage(plain, SALES_LABELS);
    expect(text).toContain('✅ *OUTSTANDING BALANCE: ₹950.00*');
    expect(text).not.toContain('RETURN SUMMARY');
    expect(text).not.toContain('Total Returns');
  });
  test('phone check: country code added, zeros dropped, 12 digits required', () => {
    expect(checkWhatsAppPhone('98765 43210')).toEqual({ ok: true, phone: '919876543210' });
    expect(checkWhatsAppPhone('+91 98765-43210')).toEqual({ ok: true, phone: '919876543210' });
    expect(checkWhatsAppPhone('098765 43210')).toEqual({ ok: true, phone: '919876543210' });
    // deviation: a local number that merely starts with 91 still gets the country code
    expect(checkWhatsAppPhone('9123456789')).toEqual({ ok: true, phone: '919123456789' });
    expect(checkWhatsAppPhone('')).toEqual({
      ok: false,
      message: 'Customer phone number not found. Please check customer details.',
    });
    expect(checkWhatsAppPhone('12345')).toEqual({
      ok: false,
      message: "Invalid phone number format. Please ensure it's a 10-digit Indian number. Current: 9112345",
    });
  });
  test('link text gets the developer credit appended (the clipboard copy does not)', () => {
    const url = combinedStatementWhatsAppUrl('919876543210', 'Hello');
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(`Hello\n\n${CREDIT_LINE}`);
  });
});
describe('loadCustomerStatement (db mocked)', () => {
  test('substring match on the customer name; returns and payments attached once; ledger outstanding', async () => {
    jest
      .spyOn(db, 'getAllInvoices')
      .mockResolvedValue([
        ...INVOICES,
        sales({ invoiceNo: '009', customerName: 'Someone Else', customerPhone: '9000000009' }),
      ]);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue(RETURNS);
    jest.spyOn(db, 'getAllPayments').mockResolvedValue(PAYMENTS);
    const s = await loadCustomerStatement('tex');
    expect(s?.invoices.map((i) => i.invoiceNo)).toEqual(['002', '001']);
    expect(s?.invoices[0].returns).toHaveLength(1);
    expect(s?.invoices[1].payments.map((p) => p.id)).toEqual(['p1']);
    expect(s?.partyName).toBe('SLN TEX');
    expect(s?.totals.outstanding).toBe(850);
  });
  test('two customers with the same name: a list to pick from, then the picked one only', async () => {
    jest
      .spyOn(db, 'getAllInvoices')
      .mockResolvedValue([...INVOICES, sales({ invoiceNo: '009', customerPhone: '9000000009' })]);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    jest.spyOn(db, 'getAllPayments').mockResolvedValue([]);
    const result = await loadCustomerStatement('SLN TEX');
    expect(result?.choices).toHaveLength(2);
    const picked = await loadCustomerStatement('SLN TEX', 'p:9000000009');
    expect(picked?.invoices.map((i) => i.invoiceNo)).toEqual(['009']);
    expect(picked?.partyKey).toBe('p:9000000009');
  });
  test('no match -> null', async () => {
    jest.spyOn(db, 'getAllInvoices').mockResolvedValue(INVOICES);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    jest.spyOn(db, 'getAllPayments').mockResolvedValue([]);
    expect(await loadCustomerStatement('zzz')).toBeNull();
  });
});
