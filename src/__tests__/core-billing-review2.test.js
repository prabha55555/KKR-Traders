import { calcSubtotal, buildProductLines } from '@/core/billing';
import { db } from '@/core/db';
import { buildSalesInvoice, emptySalesForm, validateSalesBill } from '@/core/services/salesBill';
import { buildPurchaseBill, emptyPurchaseForm, validatePurchaseBill } from '@/core/services/purchaseBill';
import { buildInvoiceStatementHtml } from '@/features/history/lib/statementHtml';
import { aggregatePartyProducts, validateReturnDraft, newReturnItem } from '@/features/history/lib/returns';
import { applyAdditionalPayment } from '@/features/history/sales/salesPayments';
import { applyAdditionalPurchasePayment } from '@/features/history/purchase/purchasePayments';
import { invoiceStatusText } from '@/features/history/components/InvoiceParts';

afterEach(() => jest.restoreAllMocks());

const row = (description, qty, rate) => ({ description, rolls: '', qty: String(qty), rate: String(rate) });

describe('1. subtotal counts exactly the listed lines', () => {
  test('blank-description rows are not charged', () => {
    const rows = [row('Shirt', 2, 100), row('', 5, 100)];
    expect(calcSubtotal(rows)).toBe(200);
    expect(buildProductLines(rows).reduce((s, l) => s + l.amount, 0)).toBe(200);
  });
  test('purchase: rows without a positive qty are not charged either', () => {
    const rows = [row('Shirt', 2, 100), row('Pant', 0, 100), row('', 3, 10)];
    expect(calcSubtotal(rows, { requirePositiveQty: true })).toBe(200);
    const bill = buildPurchaseBill({
      ...emptyPurchaseForm(),
      invoiceNo: '1',
      supplierPhone: '9876543210',
      supplierName: 'S',
      rows,
    });
    expect(bill.subtotal).toBe(200);
  });
});

describe('2. float residue is rounded', () => {
  test('2.2 x 45 paid in full is Paid, stored with 2 decimals', () => {
    const form = { ...emptySalesForm(), invoiceNo: '1', rows: [row('Shirt', 45, 2.2)], cash: '99' };
    const inv = buildSalesInvoice(form);
    expect(inv.subtotal).toBe(99);
    expect(inv.grandTotal).toBe(99);
    expect(inv.balanceDue).toBe(0);
    expect(invoiceStatusText({ ...inv, adjustedBalanceDue: 1e-14 })).toBe('Paid');
  });
  test('purchase bill totals are rounded', () => {
    const bill = buildPurchaseBill({
      ...emptyPurchaseForm(),
      invoiceNo: '1',
      supplierPhone: '9876543210',
      supplierName: 'S',
      rows: [row('Shirt', 45, 2.2)],
      cash: '99',
    });
    expect(bill.payment.balanceDue).toBe(0);
    expect(bill.grandTotal).toBe(99);
  });
  test('additional payments round amountPaid / balanceDue', () => {
    const inv = applyAdditionalPayment(
      { grandTotal: 99.01, amountPaid: 0.1, balanceDue: 98.91, paymentBreakdown: { cash: 0.1, account: 0 } },
      { cash: 0.2, account: 0 },
    );
    expect(inv.amountPaid).toBe(0.3);
    const bill = applyAdditionalPurchasePayment(
      { grandTotal: 0.3, amountPaid: 0.1, balanceDue: 0.2 },
      { cash: 0.2, account: 0 },
    );
    expect(bill.balanceDue).toBe(0);
  });
  test('payment deletion rounds (sales + purchase)', async () => {
    const saved = [];
    jest.spyOn(db, 'getInvoice').mockResolvedValue({ grandTotal: 0.3, amountPaid: 0.3, balanceDue: 0 });
    jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => saved.push(i));
    await db.updateInvoiceAfterPaymentDeletion('1', 0.1, { syncLedger: false });
    expect(saved[0].amountPaid).toBe(0.2);
    expect(saved[0].balanceDue).toBe(0.1);
    const bills = [];
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue({ grandTotal: 0.3, amountPaid: 0.3 });
    jest.spyOn(db, 'savePurchaseBill').mockImplementation(async (b) => bills.push(b));
    await db.updatePurchaseInvoiceAfterPaymentDeletion('1', 0.1, { syncLedger: false });
    expect(bills[0].amountPaid).toBe(0.2);
    expect(bills[0].balanceDue).toBe(0.1);
  });
});

describe('7. legacy invoice without amountPaid', () => {
  test('applyAdditionalPayment derives the paid amount from grandTotal - balanceDue', () => {
    const inv = applyAdditionalPayment({ grandTotal: 1000, balanceDue: 700 }, { cash: 100, account: 0 });
    expect(inv.amountPaid).toBe(400);
    expect(inv.balanceDue).toBe(600);
  });
  test('payment deletion on a legacy invoice is not NaN', async () => {
    const saved = [];
    jest.spyOn(db, 'getInvoice').mockResolvedValue({ grandTotal: 1000, balanceDue: 700 });
    jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => saved.push(i));
    await db.updateInvoiceAfterPaymentDeletion('1', 100, { syncLedger: false });
    expect(saved[0].amountPaid).toBe(200);
    expect(saved[0].balanceDue).toBe(800);
  });
});

describe('8. invoice numbers that cannot be a document id', () => {
  test.each(['1/2', '.', '..'])('sales + purchase reject %s', (no) => {
    const sales = { ...emptySalesForm(), invoiceNo: no, customerName: 'A', rows: [row('Shirt', 1, 1)] };
    expect(validateSalesBill(sales, null)?.title).toBe('Invalid Invoice No');
    const purchase = {
      ...emptyPurchaseForm(),
      invoiceNo: no,
      supplierName: 'S',
      supplierPhone: '9876543210',
      rows: [row('Shirt', 1, 1)],
    };
    expect(validatePurchaseBill(purchase, null)?.title).toBe('Invalid Invoice No');
  });
  test('a normal number is fine', () => {
    const sales = { ...emptySalesForm(), invoiceNo: '001', customerName: 'A', rows: [row('Shirt', 1, 1)] };
    expect(validateSalesBill(sales, null)).toBeNull();
  });
});

describe('10. payments lists are cacheable', () => {
  test('getAllPayments / getAllPurchasePayments do not opt out of the memory cache', async () => {
    const spy = jest.spyOn(db, '_load').mockResolvedValue([]);
    await db.getAllPayments();
    await db.getAllPurchasePayments();
    expect(spy.mock.calls[0][2]).not.toHaveProperty('memory', false);
    expect(spy.mock.calls[1][2]).not.toHaveProperty('memory', false);
  });
});

describe('4/5. statements', () => {
  const base = {
    invoiceNo: '001',
    partyName: 'A',
    invoiceDate: '2026-10-01',
    products: [],
    returns: [],
    payments: [],
    grandTotal: 0,
    amountPaid: 0,
    balanceDue: 0,
  };
  const labels = { party: 'Customer', formatInvoiceNo: (n) => n };
  const html = (invoice) =>
    buildInvoiceStatementHtml({
      invoice,
      payments: [],
      returns: [],
      totalReturns: 0,
      adjustedBalanceDue: 0,
      labels,
      now: new Date('2026-10-02'),
    });
  test('a negative previous balance (credit) is shown with a minus sign', () => {
    expect(html({ ...base, subtotal: 100, previousBalance: -50, grandTotal: 50 })).toContain(
      'Previous Balance: Rs. -50.00',
    );
  });
  test('a zero-subtotal bill does not print grandTotal as the current bill', () => {
    const out = html({ ...base, subtotal: 0, previousBalance: 500, grandTotal: 500 });
    expect(out).toContain('Current Bill Amount: Rs. 0.00');
  });
});

describe('6. return quantities', () => {
  const bills = [
    {
      invoiceNo: '1',
      invoiceDate: '2026-10-01',
      products: [{ description: 'Cloth', qty: 12.344, rate: 10 }],
    },
  ];
  test('3-decimal rounding keeps 12.344', () => {
    expect(aggregatePartyProducts(bills)[0].qty).toBe(12.344);
  });
  test('sold 0.3, returned 0.1: returning 0.2 is allowed', () => {
    const products = [{ description: 'Cloth', qty: 0.3, rate: 10 }];
    const result = validateReturnDraft({
      returnDate: '2026-10-03',
      items: [{ ...newReturnItem('k'), choice: 0, qty: '0.2', rate: '10' }],
      products,
      existingReturns: [{ description: 'Cloth', qty: 0.1 }],
    });
    expect(result.ok).toBe(true);
  });
});
