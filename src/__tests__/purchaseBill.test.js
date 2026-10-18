import { COMPANY } from '@/core/branding';
import { db } from '@/core/db';
import {
  buildAcknowledgementMessage,
  buildPurchaseBill,
  emptyPurchaseForm,
  savePurchaseBillWithPayments,
  validatePurchaseBill,
} from '@/core/services/purchaseBill';
const shortcuts = [{ shortcutKey: 'YR', fullDescription: 'Yarn 30s' }];
const form = (over = {}) => ({
  ...emptyPurchaseForm(),
  invoiceNo: '007',
  invoiceDate: '2026-10-03',
  supplierPhone: '9000000001',
  supplierName: 'ABC Mills',
  supplierAddress: 'Coimbatore',
  rows: [{ description: 'Yarn 30s', qty: '5', rate: '200' }],
  previousBalance: 100,
  manualPreviousBalance: '0',
  discountAmount: '50',
  cash: '300',
  account: '100',
  ...over,
});
afterEach(() => jest.restoreAllMocks());
describe('validatePurchaseBill', () => {
  test('required fields in the web app order, with its messages', () => {
    expect(validatePurchaseBill(form({ invoiceNo: '' }), shortcuts)?.message).toBe(
      'Please enter an Invoice Number.',
    );
    expect(validatePurchaseBill(form({ supplierName: '' }), shortcuts)?.message).toBe(
      'Please enter the Supplier Name.',
    );
    expect(validatePurchaseBill(form({ supplierPhone: '' }), shortcuts)?.message).toBe(
      'Please enter the Supplier Phone Number.',
    );
  });
  test('items need a positive quantity and must come from the catalogue', () => {
    expect(
      validatePurchaseBill(form({ rows: [{ description: 'Yarn 30s', qty: '0', rate: '5' }] }), shortcuts)
        ?.title,
    ).toBe('Empty Bill');
    expect(
      validatePurchaseBill(form({ rows: [{ description: 'Other', qty: '1', rate: '5' }] }), shortcuts)?.title,
    ).toBe('Invalid Product');
    expect(validatePurchaseBill(form(), shortcuts)).toBeNull();
  });
});
describe('buildPurchaseBill (schema must match what purchase.js wrote)', () => {
  test('nested payment object, `discount` field, line items without sno', () => {
    const bill = buildPurchaseBill(form());
    // subtotal 1000 + previous 100 - discount 50 = 1050 ; paid 400 ; due 650
    expect(bill).toMatchObject({
      invoiceNo: '007',
      supplierPhone: '9000000001',
      subtotal: 1000,
      previousBalance: 100,
      manualPreviousBalance: 0,
      discount: 50,
      grandTotal: 1050,
      payment: { cash: 300, account: 100, totalPaid: 400, balanceDue: 650 },
    });
    expect(bill.payment).not.toHaveProperty('upi');
    expect(emptyPurchaseForm()).not.toHaveProperty('upi');
    expect(bill.products).toEqual([{ description: 'Yarn 30s', qty: 5, rate: 200, amount: 1000 }]);
    expect(bill).not.toHaveProperty('amountPaid');
    expect(bill).not.toHaveProperty('discountAmount');
  });
});
describe('savePurchaseBillWithPayments', () => {
  test('saves bill, initial payments per non-zero method (dated the invoice date) and the supplier', async () => {
    const bills = [];
    const payments = [];
    const suppliers = [];
    jest.spyOn(db, 'savePurchaseBill').mockImplementation(async (b) => {
      bills.push(b);
      return true;
    });
    jest.spyOn(db, 'savePurchasePayment').mockImplementation(async (p) => {
      payments.push(p);
      return String(p.id);
    });
    jest.spyOn(db, 'saveSupplier').mockImplementation(async (s) => {
      suppliers.push(s);
      return s.phone;
    });
    await savePurchaseBillWithPayments(form());
    expect(bills).toHaveLength(1);
    expect(payments.map((p) => [p.id, p.amount, p.paymentDate, p.paymentType])).toEqual([
      ['purchase_payment_007_initial_cash', 300, '2026-10-03', 'initial'],
      ['purchase_payment_007_initial_account', 100, '2026-10-03', 'initial'],
    ]);
    expect(suppliers[0]).toMatchObject({ phone: '9000000001', name: 'ABC Mills', address: 'Coimbatore' });
  });
});
test('acknowledgement message', async () => {
  const msg = await buildAcknowledgementMessage(form());
  expect(msg).toContain('Supplier: ABC Mills');
  expect(msg).toContain('1. Yarn 30s - Qty: 5 - Amount: ₹1000.00');
  expect(msg).toContain('Total Amount: ₹1050.00');
  expect(msg).toContain(`${COMPANY.displayName} has received the products mentioned above.`);
});

test('acknowledgement: legacy UPI / GPay / bank payment documents are summed into one Account line', async () => {
  jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([
    { amount: 300, paymentMethod: 'cash', paymentType: 'initial', paymentDate: '2026-10-03' },
    {
      amount: 50,
      paymentMethod: 'upi',
      paymentType: 'initial',
      paymentDate: '2026-10-03',
      bankAccountId: 'b1',
    },
    { amount: 30, paymentMethod: 'GPAY', paymentType: 'additional', paymentDate: '2026-10-04' },
    { amount: 20, paymentMethod: 'account', paymentType: 'additional', paymentDate: '2026-10-05' },
  ]);
  jest.spyOn(db, 'getPurchaseReturnsByInvoice').mockResolvedValue([]);
  jest
    .spyOn(db, 'getAllBankAccounts')
    .mockResolvedValue([{ id: 'b1', accountName: 'HDFC', bankName: 'HDFC' }]);
  const msg = await buildAcknowledgementMessage(form({ bankAccountId: 'b1' }));
  expect(msg).toContain('- Cash Paid: ₹300.00');
  expect(msg).toContain('- Account Paid (HDFC): ₹100.00');
  expect(msg).toContain('- Total Amount Paid: ₹400.00');
  expect(msg).not.toMatch(/UPI/);
  expect(msg).toContain('(Account: HDFC)'); // a new-style account (name = bank) is not printed as "HDFC (HDFC)"
  expect(msg).toContain('(Cash in Hand)');
});
