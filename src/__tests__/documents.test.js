import { db } from '@/core/db';
import { loadInvoiceContext, resolvePaymentSplit } from '@/core/services/invoiceContext';
import { buildCombinedInvoiceHtml, buildInvoiceHtml } from '@/core/services/invoiceHtml';
import { buildStatementMessage, normalizeWhatsAppPhone, whatsAppUrl } from '@/core/services/whatsapp';
const invoice = {
  invoiceNo: '012',
  invoiceDate: '2026-10-03',
  customerName: 'SLN <TEX> & Co',
  customerAddress: 'Tirupur',
  customerPhone: '9876543210',
  products: [
    { sno: 1, description: 'Cotton Shirt', qty: 10, rate: 120.5, amount: 1205 },
    { sno: 2, description: 'T Shirt', qty: 2, rate: 99, amount: 198 },
  ],
  subtotal: 1403,
  previousBalance: 300,
  grandTotal: 1703,
  paymentBreakdown: { cash: 500, upi: 200, account: 0 },
  amountPaid: 700,
  balanceDue: 1003,
};
const returns = [
  {
    id: 'r1',
    invoiceNo: '012',
    returnDate: '2026-10-05',
    description: 'T Shirt',
    qty: 1,
    rate: 99,
    returnAmount: 99,
    reason: 'Torn',
  },
];
afterEach(() => jest.restoreAllMocks());
describe('invoice HTML', () => {
  test('contains invoice number, formatted money, words and escapes customer text', () => {
    const html = buildInvoiceHtml({ invoice, logoSrc: 'data:image/png;base64,AAA' });
    expect(html).toContain('Invoice No:</strong> 012');
    expect(html).toContain('3/10/2026');
    expect(html).toContain('1,403.00');
    expect(html).toContain('Rupees One Thousand Seven Hundred Three Only');
    expect(html).toContain('SLN &lt;TEX&gt; &amp; Co');
    expect(html).not.toContain('SLN <TEX>');
    expect(html).toContain('data:image/png;base64,AAA');
  });
  test('return section appears only when there are returns, and uses the adjusted balance', () => {
    const without = buildInvoiceHtml({ invoice });
    expect(without).not.toContain('RETURN INFORMATION');
    expect(without).toContain('Balance Due:');
    const withReturns = buildInvoiceHtml({ invoice, returns, totalReturns: 99, adjustedBalanceDue: 904 });
    expect(withReturns).toContain('RETURN INFORMATION');
    expect(withReturns).toContain('Adjusted Balance Due:');
    expect(withReturns).toContain('904.00');
  });
  test('legacy invoices without a breakdown print the single payment method (UPI is printed as Account)', () => {
    const html = buildInvoiceHtml({
      invoice: { ...invoice, paymentBreakdown: undefined, paymentMethod: 'upi' },
    });
    expect(html).toContain('Payment Method:');
    expect(html).toContain('>ACCOUNT<');
    expect(html).not.toContain('UPI');
    const cash = buildInvoiceHtml({
      invoice: { ...invoice, paymentBreakdown: undefined, paymentMethod: 'cash' },
    });
    expect(cash).toContain('>CASH<');
  });
  test('a legacy UPI amount is printed inside Account Paid; no UPI row; "Payment No" line', () => {
    const html = buildInvoiceHtml({ invoice, accountBankName: 'HDFC' });
    expect(html).not.toContain('UPI');
    expect(html).not.toContain('G-pay');
    expect(html).toMatch(/Account Paid \(HDFC\):<\/span><span>Rs\. 200\.00/);
    expect(html).toMatch(/Cash Paid:<\/span><span>Rs\. 500\.00/);
    expect(html).toContain('Payment No :');
  });
  test('legacy UPI / bank payment documents are listed as Account', () => {
    const html = buildInvoiceHtml({
      invoice,
      payments: [
        { paymentMethod: 'upi', amount: 200, paymentDate: '2026-10-03', bankAccountName: 'HDFC' },
        { paymentMethod: 'bank', amount: 50, paymentDate: '2026-10-04' },
        { paymentMethod: 'cash', amount: 500, paymentDate: '2026-10-03', paymentType: 'additional' },
      ],
    });
    expect(html).toContain('Account: HDFC');
    expect(html).toContain('Bank Account');
    expect(html).toContain('Cash in Hand (Additional)');
  });
  test('discount gets its own row so subtotal + previous balance - discount = total', () => {
    const html = buildInvoiceHtml({ invoice: { ...invoice, discountAmount: 100, grandTotal: 1603 } });
    expect(html).toMatch(/Discount:<\/span><span>-Rs\. 100\.00/);
    expect(buildInvoiceHtml({ invoice })).not.toContain('Discount:');
  });
  test('refunded returns are listed but do not lower the balance due', () => {
    const refund = { ...returns[0], settlementType: 'refund', refundMethod: 'cash' };
    const html = buildInvoiceHtml({
      invoice,
      returns: [refund],
      totalReturns: 99,
      balanceReturns: 0,
      adjustedBalanceDue: 1003,
    });
    expect(html).toContain('RETURN INFORMATION');
    expect(html).toContain('Returns (refunded):');
    expect(html).not.toContain('Adjusted Balance Due:');
    expect(html).toContain('Balance Due:');
    expect(html).toContain('1,003.00');
    expect(html).toContain('were refunded to the customer');
    expect(html).not.toContain('has been adjusted');
    const mixed = buildInvoiceHtml({
      invoice,
      returns: [refund, { ...returns[0], id: 'r2', returnAmount: 50 }],
      totalReturns: 149,
      balanceReturns: 50,
      adjustedBalanceDue: 953,
    });
    expect(mixed).toContain('Adjusted Balance Due:');
    expect(mixed).toContain('953.00');
    expect(mixed).toMatch(/Return Amount:<\/span><span class="amount-return">-Rs\. 50\.00/);
    expect(mixed).toMatch(/Returns \(refunded\):<\/span><span>Rs\. 99\.00/);
  });
  test('combined document = ORIGINAL page + page break + COPY page', () => {
    const html = buildCombinedInvoiceHtml({ invoice });
    expect(html).toContain('(ORIGINAL)');
    expect(html).toContain('(COPY)');
    expect(html.indexOf('(ORIGINAL)')).toBeLessThan(html.indexOf('page-break-before'));
    expect(html.indexOf('page-break-before')).toBeLessThan(html.indexOf('(COPY)'));
  });
  test('includes manual bill slip page when invoice has manualBillImage', () => {
    const withManual = buildCombinedInvoiceHtml({
      invoice: { ...invoice, manualBillImage: 'data:image/jpeg;base64,TESTIMAGE' },
    });
    expect(withManual).toContain('Manual Bill Attachment');
    expect(withManual).toContain('data:image/jpeg;base64,TESTIMAGE');
  });
  test('buildInvoiceHtml contains ORIGINAL and manual bill image, but no COPY page', () => {
    const html = buildInvoiceHtml({
      invoice: { ...invoice, manualBillImage: 'data:image/jpeg;base64,TESTIMAGE' },
    });
    expect(html).toContain('(ORIGINAL)');
    expect(html).not.toContain('(COPY)');
    expect(html).toContain('Manual Bill Attachment');
    expect(html).toContain('data:image/jpeg;base64,TESTIMAGE');
  });
});
describe('WhatsApp', () => {
  test('phone normalisation adds 91 to bare 10-digit numbers only', () => {
    expect(normalizeWhatsAppPhone('98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppPhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizeWhatsAppPhone('9123456789')).toBe('919123456789'); // starts with 91 but is still a bare 10-digit number
    expect(normalizeWhatsAppPhone('919123456789')).toBe('919123456789');
    expect(normalizeWhatsAppPhone('')).toBe('');
    expect(normalizeWhatsAppPhone(undefined)).toBe('');
  });
  test('wa.me url with and without a number', () => {
    expect(whatsAppUrl('9876543210', 'hi there')).toBe('https://wa.me/919876543210?text=hi%20there');
    expect(whatsAppUrl('', 'hi')).toBe('https://wa.me/?text=hi');
  });
  test('statement message structure and numbers', () => {
    const msg = buildStatementMessage({ invoice, returns, totalReturns: 99, adjustedBalanceDue: 904 });
    expect(msg).toContain('*INVOICE STATEMENT*');
    expect(msg).toContain('No: 012');
    expect(msg).toContain('Date: 3/10/2026');
    expect(msg).toContain('10 x Rs. 120.50 = Rs. 1205'); // non-whole rate keeps 2 decimals; whole amounts print raw (no commas), like the web app
    expect(msg).toContain('2 x Rs. 99 = Rs. 198'); // whole numbers drop decimals
    expect(msg).toContain('RETURNED ITEMS');
    expect(msg).toContain('Rsn: Torn');
    expect(msg).toContain('Prev Bal:   Rs. 300'); // grandTotal - subtotal
    expect(msg).toContain('Returns:   -Rs. 99');
    expect(msg).toContain('Cash:   Rs. 500');
    expect(msg).toContain('Acct:   Rs. 200'); // a legacy UPI amount is shown as Account
    expect(msg).not.toContain('UPI');
    expect(msg).toContain('*DUE:       Rs. 904*');
    expect(msg).not.toMatch(/�/); // the web source had mangled characters; none here
  });
  test('long customer name/address are clipped to 20 chars + ".."', () => {
    const msg = buildStatementMessage({
      invoice: { ...invoice, customerName: 'A very long customer name indeed', customerAddress: '' },
      returns: [],
      totalReturns: 0,
      adjustedBalanceDue: 0,
    });
    expect(msg).toContain('A very long customer..');
    expect(msg).toContain('Not specified');
    expect(msg).toContain('*DUE:       Rs. 1003*');
  });
  test('previous balance and discount are separate lines (a negative carried balance is shown too)', () => {
    const msg = buildStatementMessage({
      invoice: {
        ...invoice,
        previousBalance: -200,
        manualPreviousBalance: 50,
        discountAmount: 100,
        grandTotal: 1153,
      },
      returns: [],
      totalReturns: 0,
    });
    expect(msg).toContain('Prev Bal:   Rs. -150');
    expect(msg).toContain('Discount:  -Rs. 100');
    const cashOnly = buildStatementMessage({
      invoice: { ...invoice, paymentBreakdown: { cash: 700, account: 0 } },
      returns: [],
      totalReturns: 0,
    });
    expect(cashOnly).not.toContain('Acct'); // zero methods are omitted
  });
  test('refunded returns are listed but the due stays the stored balance', () => {
    const refund = { ...returns[0], settlementType: 'refund', refundMethod: 'bank' };
    const msg = buildStatementMessage({
      invoice,
      returns: [refund],
      totalReturns: 99,
      balanceReturns: 0,
      adjustedBalanceDue: 1003,
    });
    expect(msg).toContain('RETURNED ITEMS');
    expect(msg).toContain('Refunded:   Rs. 99');
    expect(msg).not.toContain('Returns:   -Rs.');
    expect(msg).toContain('*DUE:       Rs. 1003*');
  });
});
describe('invoice outputs use the stored paid / due (payment documents only split the methods)', () => {
  test('resolvePaymentSplit: documents when they add up, else the stored split, else documents + untracked cash', () => {
    const docs = [
      { amount: 500, paymentMethod: 'cash' },
      { amount: 200, paymentMethod: 'upi' },
    ];
    expect(resolvePaymentSplit({ amountPaid: 700 }, docs)).toEqual({ cash: 500, account: 200 });
    // an older bill's initial payment has no document: the stored breakdown (it adds up) wins
    expect(
      resolvePaymentSplit({ amountPaid: 700, paymentBreakdown: { cash: 600, upi: 100 } }, [
        { amount: 100, paymentMethod: 'cash' },
      ]),
    ).toEqual({ cash: 600, account: 100 });
    // nothing adds up: the untracked rest counts as cash (like the edit form)
    expect(resolvePaymentSplit({ amountPaid: 700 }, [{ amount: 100, paymentMethod: 'bank' }])).toEqual({
      cash: 600,
      account: 100,
    });
    expect(resolvePaymentSplit({ amountPaid: 50, paymentBreakdown: { cash: 20, upi: 30 } }, [])).toEqual({
      cash: 20,
      account: 30,
    });
    expect(resolvePaymentSplit({ amountPaid: 50 }, [])).toBeNull();
  });
  test('loadInvoiceContext: stored amountPaid / balanceDue; only balance-settled returns lower the due', async () => {
    jest.spyOn(db, 'getReturnsByInvoice').mockResolvedValue([
      { invoiceNo: '012', returnAmount: 300, settlementType: 'refund', refundMethod: 'cash' },
      { invoiceNo: '012', returnAmount: 40 }, // legacy return: settled against the balance
    ]);
    jest
      .spyOn(db, 'getPaymentsByInvoice')
      .mockResolvedValue([
        { amount: 100, paymentMethod: 'account', paymentType: 'additional', bankAccountId: 'b1' },
      ]);
    jest
      .spyOn(db, 'getAllBankAccounts')
      .mockResolvedValue([{ id: 'b1', accountName: 'SBI', bankName: 'SBI' }]);
    const ctx = await loadInvoiceContext({
      ...invoice,
      invoiceNo: '012',
      grandTotal: 1000,
      amountPaid: 700,
      balanceDue: 300,
      paymentBreakdown: { cash: 600, account: 100 },
    });
    expect(ctx.invoice).toMatchObject({ amountPaid: 700, balanceDue: 300 });
    expect(ctx.invoice.paymentBreakdown).toEqual({ cash: 600, account: 100 });
    expect(ctx).toMatchObject({ totalReturns: 340, balanceReturns: 40, adjustedBalanceDue: 260 });
    expect(ctx.accountBankName).toBe('SBI');
    expect(ctx.payments[0].bankAccountName).toBe('SBI');
    const html = buildInvoiceHtml(ctx);
    expect(html).toContain('Adjusted Balance Due:');
    expect(html).toContain('260.00');
    expect(html).toContain('Returns (refunded):');
  });
});
describe('rolls on the invoice outputs (only when a line has a roll count)', () => {
  const withRolls = {
    ...invoice,
    products: [
      { sno: 1, description: 'Cotton Shirt', qty: 10, rolls: 3, rate: 120.5, amount: 1205 },
      { sno: 2, description: 'T Shirt', qty: 2, rate: 99, amount: 198 },
    ],
  };
  const rolledReturn = [{ ...returns[0], rolls: 1 }];
  test('printed invoice: bills without rolls print exactly as before', () => {
    const html = buildInvoiceHtml({ invoice, returns, totalReturns: 99, adjustedBalanceDue: 904 });
    expect(html).not.toContain('Rolls');
    expect(html).toContain('<th style="width: 52%">Product Description</th>');
    expect(html).toContain('<th style="width: 45%">Product</th>');
    expect(html).toContain('colspan="4"');
  });
  test('printed invoice: a Rolls column between description and qty, "-" for a line without rolls', () => {
    const html = buildInvoiceHtml({ invoice: withRolls });
    expect(html.match(/>Rolls<\/th>/g)).toHaveLength(1);
    expect(html).toContain('<th style="width: 44%">Product Description</th>');
    expect(html).toMatch(/Cotton Shirt<\/td>\s*<td>3<\/td>\s*<td>10<\/td>/);
    expect(html).toMatch(/T Shirt<\/td>\s*<td>-<\/td>\s*<td>2<\/td>/);
    // the money is unchanged
    expect(html).toContain('1,205.00');
    expect(html).toContain('Rupees One Thousand Seven Hundred Three Only');
  });
  test('printed invoice: the return table gets its own Rolls column when a return has rolls', () => {
    const html = buildInvoiceHtml({
      invoice,
      returns: rolledReturn,
      totalReturns: 99,
      adjustedBalanceDue: 904,
    });
    expect(html.match(/>Rolls<\/th>/g)).toHaveLength(1);
    expect(html).toContain('<th style="width: 37%">Product</th>');
    expect(html).toMatch(/T Shirt<\/td>\s*<td>1<\/td>\s*<td>1<\/td>/);
    expect(html).toContain('colspan="5"');
  });
  test('WhatsApp statement: a Rolls line under products / returns that have one', () => {
    const msg = buildStatementMessage({
      invoice: withRolls,
      returns: rolledReturn,
      totalReturns: 99,
      adjustedBalanceDue: 904,
    });
    expect(msg).toContain('│ 🧵 Cotton Shirt\n│ 🧻 Rolls: 3\n│ 10 x Rs. 120.50 = Rs. 1205');
    expect(msg).toContain('│ 🧵 T Shirt\n│ 2 x Rs. 99 = Rs. 198');
    expect(msg).toContain('│ 🧵 T Shirt\n│ 🧻 Rolls: 1\n│ 1 x Rs. 99 = -Rs. 99');
    expect(buildStatementMessage({ invoice, returns, totalReturns: 99 })).not.toContain('Rolls');
  });
});
