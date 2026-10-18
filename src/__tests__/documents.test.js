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
  test('legacy invoices without a breakdown print the single payment method', () => {
    const html = buildInvoiceHtml({
      invoice: { ...invoice, paymentBreakdown: undefined, paymentMethod: 'upi' },
    });
    expect(html).toContain('Payment Method:');
    expect(html).toContain('>UPI<');
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
    expect(msg).toContain('UPI:    Rs. 200');
    expect(msg).not.toContain('Acct:'); // zero methods are omitted
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
});
