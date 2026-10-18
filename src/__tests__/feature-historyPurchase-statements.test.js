import { db } from '@/core/db';
import { generatePaymentTableData, validatePaymentInput } from '@/features/history/lib/payments';
import {
  buildCombinedStatementHtml,
  buildEasyStatementHtml,
  buildInvoiceStatementHtml,
} from '@/features/history/lib/statementHtml';
import { buildCombinedStatementMessage } from '@/features/history/lib/statementMessage';
import { PURCHASE_LABELS, toHistoryPurchase } from '@/features/history/purchase/purchaseModel';
import { statementPayments } from '@/features/history/purchase/purchasePayments';
import { loadSupplierStatement } from '@/features/history/purchase/purchaseStatements';
const bill = (over = {}) => ({
  invoiceNo: '001',
  invoiceDate: '2026-10-01',
  supplierName: 'Sri Ganesh Yarns',
  supplierPhone: '9876543210',
  supplierAddress: 'Tirupur',
  products: [{ description: 'Cotton Yarn', qty: 10, rate: 100, amount: 1000 }],
  subtotal: 1000,
  grandTotal: 1000,
  payment: { cash: 400, upi: 0, account: 0, totalPaid: 400, balanceDue: 600 },
  ...over,
});
const initialDoc = (invoiceNo, amount) => ({
  id: `purchase_payment_${invoiceNo}_initial_cash`,
  invoiceNo,
  paymentDate: '2026-10-01',
  amount,
  paymentMethod: 'cash',
  paymentType: 'initial',
});
const returnDoc = (invoiceNo, returnAmount) => ({
  id: `r_${invoiceNo}`,
  invoiceNo,
  returnDate: '2026-10-04',
  description: 'Cotton Yarn',
  qty: 1,
  rate: returnAmount,
  returnAmount,
  reason: 'damaged',
});
const NOW = new Date(2026, 9, 5, 16, 5, 9);
afterEach(() => jest.restoreAllMocks());
describe('shared wording hooks used by purchase', () => {
  test('the add-payment amount message can be replaced; the sales default is unchanged', () => {
    const none = { cash: 0, upi: 0, account: 0 };
    expect(validatePaymentInput(none, '2026-10-01', 'Please enter a valid payment amount.')?.message).toBe(
      'Please enter a valid payment amount.',
    );
    expect(validatePaymentInput(none, '2026-10-01')?.message).toBe(
      'Please enter a valid payment amount in at least one payment method.',
    );
  });
  test("the first row of the statement's payment table can be relabelled; the default stays", () => {
    expect(generatePaymentTableData([], 100, 0, '2026-10-05')[0][1]).toBe('Invoice - Goods/Services');
    expect(generatePaymentTableData([], 100, 0, '2026-10-05', 'Purchase Bill')[0]).toEqual([
      '5/10/2026',
      'Purchase Bill',
      '100.00',
      '100.00',
    ]);
  });
});
describe('loadSupplierStatement (searchSupplierInvoices + displaySupplierStatementResults)', () => {
  const bills = [
    bill({ invoiceNo: '001' }),
    bill({
      invoiceNo: '002',
      subtotal: 2000,
      previousBalance: 600,
      grandTotal: 2600,
      payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 2600 },
    }),
    bill({ invoiceNo: '003', supplierName: 'Lakshmi Dyers' }),
  ];
  beforeEach(() => {
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(bills);
    jest.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue([returnDoc('002', 100)]);
    jest.spyOn(db, 'getAllPurchasePayments').mockResolvedValue([initialDoc('001', 400)]);
  });
  test('suppliers whose name contains the text (case-insensitive) are combined, newest bill first, returns included', async () => {
    const statement = await loadSupplierStatement('ganesh');
    expect(statement?.invoices.map((i) => i.invoiceNo)).toEqual(['002', '001']);
    expect(statement?.totals).toMatchObject({
      totalInvoices: 2,
      totalCurrentBill: 3000,
      totalPaid: 400,
      totalReturns: 100,
      adjustedBalanceDue: 2500,
    });
    expect(statement?.partyName).toBe('ganesh');
  });
  test('nothing matches -> null', async () => {
    expect(await loadSupplierStatement('nobody')).toBeNull();
  });
  test('WhatsApp text and PDFs speak of the supplier and hide the P- prefix', async () => {
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue([bill({ invoiceNo: 'P-007' })]);
    const statement = await loadSupplierStatement('ganesh');
    const message = buildCombinedStatementMessage(statement, PURCHASE_LABELS);
    expect(message).toContain('*SUPPLIER DETAILS*');
    expect(message).toContain('*INVOICE #007*');
    expect(message).not.toContain('P-007');
    const detailed = buildCombinedStatementHtml({ statement, labels: PURCHASE_LABELS, now: NOW });
    expect(detailed).toContain('SUPPLIER INFORMATION');
    expect(detailed).toContain('INVOICE #007 - 1/10/2026');
    expect(detailed).not.toContain('P-007');
    const easy = buildEasyStatementHtml({
      partyName: 'ganesh',
      invoices: statement.invoices,
      labels: PURCHASE_LABELS,
      now: NOW,
    });
    expect(easy).toContain('SUPPLIER INFORMATION');
    expect(easy).toContain('<td class="l">007</td>');
  });
});
describe('single bill statement', () => {
  test('supplier wording, bill number without P-, payment table starts with "Purchase Bill" and carries the synthetic initial payment', () => {
    const b = bill({ invoiceNo: 'P-003' });
    const view = toHistoryPurchase(
      b,
      [
        {
          ...initialDoc('P-003', 0),
          id: 'a',
          amount: 50,
          paymentType: 'additional',
          paymentDate: '2026-10-03',
        },
      ],
      [],
      false,
    );
    const html = buildInvoiceStatementHtml({
      invoice: view,
      payments: statementPayments(b, view.payments),
      returns: [],
      totalReturns: 0,
      adjustedBalanceDue: view.adjustedBalanceDue,
      labels: PURCHASE_LABELS,
      now: NOW,
    });
    expect(html).toContain('SUPPLIER INFORMATION');
    expect(html).toContain('Invoice No: 003');
    expect(html).toContain('Purchase Bill');
    expect(html).not.toContain('Invoice - Goods/Services');
    // synthetic initial (400, dated the bill date) + the additional 50
    expect(html).toContain('Payment - Initial (CASH)');
    expect(html).toContain('-Rs. 400.00');
    expect(html).toContain('Payment - Additional (CASH)');
    expect(html).toContain('Balance Due: Rs. 600.00');
  });
  test('returns are included: Total Returns, Adjusted Balance Due and the return table', () => {
    const b = bill();
    const view = toHistoryPurchase(b, [], [returnDoc('001', 100)], false);
    const html = buildInvoiceStatementHtml({
      invoice: view,
      payments: [],
      returns: view.returns,
      totalReturns: view.totalReturns,
      adjustedBalanceDue: view.adjustedBalanceDue,
      labels: PURCHASE_LABELS,
      now: NOW,
    });
    expect(html).toContain('RETURN INFORMATION');
    expect(html).toContain('Total Returns: -Rs. 100.00');
    expect(html).toContain('Adjusted Balance Due: Rs. 500.00');
  });
});
