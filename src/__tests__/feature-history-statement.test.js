import { CREDIT_LINE } from '@/core/branding';
import { db } from '@/core/db';
import {
  buildCombinedStatement,
  buildEasyStatement,
  matchPartyInvoices,
  sortByDateAsc,
  sortByInvoiceNumberDesc,
  statementBalanceLabel,
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
  paymentBreakdown: { cash: 400, upi: 0, account: 0 },
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
const statement = () => buildCombinedStatement('sln', history());
afterEach(() => jest.restoreAllMocks());
describe('sales view-model (same numbers as the web card)', () => {
  test('previous balance = previous + opening; adjusted balance = balanceDue - returns; discount legacy fallback', () => {
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
        sales({ invoiceNo: '003', invoiceDate: '2026-10-01', customerName: 'Other' }),
        sales({ invoiceNo: '004', invoiceDate: '2026-10-01', customerName: 'Other' }),
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
  test('matches customers whose name contains the text, ignoring case', () => {
    expect(
      matchPartyInvoices(history(), 'sln')
        .map((i) => i.invoiceNo)
        .sort(),
    ).toEqual(['001', '002']);
    expect(matchPartyInvoices(history(), ' TEX ').length).toBe(2);
    expect(matchPartyInvoices(history(), 'nobody')).toEqual([]);
  });
  test('invoices newest-number first; totals follow displayCustomerStatementResults', () => {
    const s = statement();
    expect(s.invoices.map((i) => i.invoiceNo)).toEqual(['002', '001']);
    expect(s.mostRecent.invoiceNo).toBe('002');
    expect(s.partyName).toBe('sln');
    expect(s.partyPhone).toBe('98765 43210');
    expect(s.totals).toEqual({
      totalInvoices: 2,
      totalCurrentBill: 1600,
      totalPaid: 600,
      totalDiscount: 50,
      totalReturns: 100,
      totalCash: 400,
      totalUpi: 200,
      totalAccount: 0,
      adjustedBalanceDue: 850, // most recent invoice: 950 - 100
    });
    expect(statementBalanceLabel(s.totals)).toBe('Adjusted Balance Due');
    expect(statementBalanceLabel({ totalReturns: 0 })).toBe('Balance Due');
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
    expect(sortByInvoiceNumberDesc(rows).map((r) => r.invoiceNo)).toEqual(['010', '003', '002']);
    expect(sortByDateAsc(rows).map((r) => r.invoiceNo)).toEqual(['003', '002', '010']);
  });
});
describe('simplified ("Easy") statement', () => {
  test('oldest first; particulars joined and cut at 50 chars; balance = bill - paid - returns', () => {
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
    expect(easy).toMatchObject({ totalBill: 1602, totalPaid: 600, totalReturns: 100, balanceDue: 902 });
    expect(easy.partyPhone).toBe('98765 43210');
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
    expect(html).toContain('INVOICE #002 - 3/10/2026');
    expect(html.indexOf('INVOICE #002')).toBeLessThan(html.indexOf('INVOICE #001'));
    for (const header of ['S.No.', 'Description', 'Qty', 'Rate', 'Amount', 'Date', 'Product', 'Balance'])
      expect(html).toContain(`>${header}</th>`);
    expect(html).toContain('RETURN INFORMATION');
    expect(html).toContain('PAYMENT HISTORY');
    expect(html).toContain('Payment - Additional (UPI)'.replace('Additional', 'Initial')); // payment p2 has paymentType 'initial'
    expect(html).toContain('-Rs. 200.00');
    expect(html).toContain('Product Returns');
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
    for (const header of ['Invoice', 'Date', 'Particulars', 'Amount', 'Received'])
      expect(html).toContain(`>${header}</th>`);
    expect(html).toContain('(Returns deducted: -Rs. 100.00)');
    expect(html).toContain('Total Amount:</span><span>Rs. 1,600.00');
    expect(html).toContain('Total Received:</span><span>Rs. 600.00');
    expect(html).toContain('Total Returns:</span><span>-Rs. 100.00');
    expect(html).toContain('Balance Due:</span><span>Rs. 900.00');
    expect(html).not.toContain('Powered by Brightlight Solutions');
    expect(html.indexOf('>001<')).toBeLessThan(html.indexOf('>002<'));
    const noReturns = buildEasyStatementHtml({
      partyName: 'x',
      invoices: [history().find((i) => i.invoiceNo === '001')],
      labels: SALES_LABELS,
      now: NOW,
    });
    expect(noReturns).not.toContain('Total Returns');
    expect(
      buildEasyStatementHtml({ partyName: 'x', invoices: [], labels: SALES_LABELS, now: NOW }),
    ).toBeNull();
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
    expect(html).toContain('Total Returns: -Rs. 100.00');
    expect(html).toContain('Adjusted Balance Due: Rs. 850.00');
    expect(html).toContain('RETURN INFORMATION');
    expect(html).toContain('4/10/2026'); // PARITY: opening payment-table row carries today's date
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
  const message = buildCombinedStatementMessage(statement(), SALES_LABELS);
  test('header, customer block and invoices (newest first) with their figures', () => {
    expect(message).toContain('*SANTHAMANI TEXTILES - ACCOUNT STATEMENT*');
    expect(message).toContain('*CUSTOMER DETAILS*');
    expect(message).toContain('👤 Customer: sln');
    expect(message).toContain('📍 Address: Tirupur');
    expect(message).toContain('📊 Total Invoices: 2');
    expect(message.indexOf('*INVOICE #002*')).toBeLessThan(message.indexOf('*INVOICE #001*'));
    expect(message).toContain('📅 Date: 3/10/2026');
    expect(message).toContain('   Current Bill: ₹600.00');
    expect(message).toContain('   Previous Balance: ₹600.00');
    expect(message).toContain('   Discount Amount: -₹50.00');
    expect(message).toContain('   Total Amount: ₹1,150.00');
    expect(message).toContain('   Amount Paid: ₹200.00');
    expect(message).toContain('💳 📱 UPI: ₹200.00');
    expect(message).toContain('   Returns: -₹100.00');
    expect(message).toContain('   1. Cotton Shirt\n      Qty: 5 × Rate: ₹100.00 = ₹500.00');
    expect(message).toContain('   1. T Shirt\n      Qty: 2 × Rate: ₹50.00 = -₹100.00\n      Reason: torn');
    expect(message).toContain('✅ *ADJUSTED BALANCE DUE: ₹850.00*');
    expect(message).toContain('✅ *BALANCE DUE: ₹600.00*');
  });
  test('overall summary, return summary, invoice list, contact block', () => {
    expect(message).toContain('💰 Total Current Bill Amount: ₹1,600.00');
    expect(message).toContain('💳 Total Amount Paid: ₹600.00');
    expect(message).toContain('   💵 Cash: ₹400.00');
    expect(message).toContain('   📱 UPI: ₹200.00');
    expect(message).not.toContain('🏦 Account: ₹');
    expect(message).toContain('🔄 Total Returns: -₹100.00');
    expect(message).toContain('✅ *ADJUSTED OUTSTANDING BALANCE: ₹850.00*');
    expect(message).toContain('*RETURN SUMMARY*');
    expect(message).toContain('📦 Total Return Amount: ₹100.00');
    expect(message).toContain('• #002 - 3/10/2026 - Due: ₹850.00');
    expect(message).toContain('• #001 - 1/9/2026 - Due: ₹600.00');
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
  test('substring match on the customer name; returns and payments attached once', async () => {
    jest
      .spyOn(db, 'getAllInvoices')
      .mockResolvedValue([...INVOICES, sales({ invoiceNo: '009', customerName: 'Someone Else' })]);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue(RETURNS);
    jest.spyOn(db, 'getAllPayments').mockResolvedValue(PAYMENTS);
    const s = await loadCustomerStatement('tex');
    expect(s?.invoices.map((i) => i.invoiceNo)).toEqual(['002', '001']);
    expect(s?.invoices[0].returns).toHaveLength(1);
    expect(s?.invoices[1].payments.map((p) => p.id)).toEqual(['p1']);
    expect(s?.totals.adjustedBalanceDue).toBe(850);
  });
  test('no match -> null', async () => {
    jest.spyOn(db, 'getAllInvoices').mockResolvedValue(INVOICES);
    jest.spyOn(db, 'getAllReturns').mockResolvedValue([]);
    jest.spyOn(db, 'getAllPayments').mockResolvedValue([]);
    expect(await loadCustomerStatement('zzz')).toBeNull();
  });
});
