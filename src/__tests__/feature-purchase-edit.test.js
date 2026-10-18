import { db } from '@/core/db';
import {
  buildPurchaseEditBill,
  initialPaymentBreakdown,
  loadPurchaseForEdit,
  purchaseEditFormFromBill,
  purchaseEditTotals,
  savePurchaseEdit,
  splitPurchasePayments,
} from '@/features/purchase/purchaseEdit';
import { buildPurchaseBill, emptyPurchaseForm, validatePurchaseBill } from '@/core/services/purchaseBill';
afterEach(() => jest.restoreAllMocks());
const pay = (over) => ({
  id: 'p1',
  invoiceNo: '007',
  paymentDate: '2026-10-03',
  amount: 100,
  paymentMethod: 'cash',
  paymentType: 'initial',
  ...over,
});
const storedBill = {
  invoiceNo: '007',
  invoiceDate: '2026-10-03',
  supplierName: 'ABC Mills',
  supplierPhone: '9000000001',
  supplierAddress: 'Coimbatore',
  products: [
    { description: 'Yarn 30s', qty: 5, rate: 200, amount: 1000 },
    { description: 'Yarn 40s', qty: 2, rate: 33.333, amount: 66.666 },
  ],
  subtotal: 1066.67,
  previousBalance: 100.004,
  manualPreviousBalance: 20,
  discount: 50,
  grandTotal: 1136.67,
  payment: { cash: 300, upi: 100, account: 50, totalPaid: 450, balanceDue: 686.67 },
};
const payments = [
  pay({ id: 'i-cash', amount: 300, paymentMethod: 'cash' }),
  pay({ id: 'i-upi', amount: 100, paymentMethod: 'GPay' }),
  pay({ id: 'i-acc', amount: 50, paymentMethod: 'bank' }),
  pay({ id: 'later', amount: 200, paymentMethod: 'cash', paymentType: 'additional' }),
];
describe('payment split (edit-purchase.js loadPurchaseBill)', () => {
  test('GPAY counts as UPI, BANK as ACCOUNT, unknown/blank as CASH — case-insensitive', () => {
    expect(
      initialPaymentBreakdown([
        { amount: 10, paymentMethod: 'upi' },
        { amount: 20, paymentMethod: 'GPAY' },
        { amount: 30, paymentMethod: 'Account' },
        { amount: 40, paymentMethod: 'BANK' },
        { amount: 50, paymentMethod: 'cheque' },
        { amount: 60, paymentMethod: '' },
      ]),
    ).toEqual({ cash: 110, upi: 30, account: 70 });
  });
  test("'initial' payments feed the editable split, everything else is 'paid later'", () => {
    expect(splitPurchasePayments(payments)).toEqual({
      initial: { cash: 300, upi: 100, account: 50 },
      additionalTotal: 200,
    });
  });
});
describe('purchaseEditFormFromBill', () => {
  test('fills the same inputs the web page did (zeros blank, products as strings)', () => {
    const form = purchaseEditFormFromBill(storedBill, payments);
    expect(form).toMatchObject({
      invoiceNo: '007',
      invoiceDate: '2026-10-03',
      supplierPhone: '9000000001',
      supplierName: 'ABC Mills',
      previousBalance: 100.004,
      manualPreviousBalance: '20',
      discountAmount: '50',
      cash: '300',
      upi: '100',
      account: '50',
      additionalPaymentsTotal: 200,
    });
    expect(form.rows).toEqual([
      { description: 'Yarn 30s', qty: '5', rate: '200' },
      { description: 'Yarn 40s', qty: '2', rate: '33.333' },
    ]);
  });
  test('missing optional fields: blank opening balance / discount / payments, one empty row', () => {
    const form = purchaseEditFormFromBill(
      {
        ...storedBill,
        products: [],
        manualPreviousBalance: undefined,
        discount: undefined,
        previousBalance: undefined,
      },
      [],
    );
    expect(form).toMatchObject({
      manualPreviousBalance: '',
      discountAmount: '',
      cash: '',
      upi: '',
      account: '',
      previousBalance: 0,
      additionalPaymentsTotal: 0,
    });
    expect(form.rows).toEqual([{ description: '', qty: '0', rate: '0' }]);
  });
  test('older bills that only carry discountAmount keep their discount', () => {
    expect(
      purchaseEditFormFromBill({ ...storedBill, discount: undefined, discountAmount: 75 }, []).discountAmount,
    ).toBe('75');
  });
});
describe('loadPurchaseForEdit', () => {
  test('uses the STORED bill number for the payment lookup (the web padded/stripped it and hit the wrong documents)', async () => {
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue({ ...storedBill, invoiceNo: 'P-5' });
    const lookup = jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue(payments);
    const loaded = await loadPurchaseForEdit('P-5');
    expect(lookup).toHaveBeenCalledWith('P-5');
    expect(loaded?.form.invoiceNo).toBe('P-5');
  });
  test('unknown bill -> null', async () => {
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(null);
    const lookup = jest.spyOn(db, 'getPurchasePaymentsByInvoice');
    expect(await loadPurchaseForEdit('999')).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
describe('purchaseEditTotals (updateCalculations)', () => {
  const form = purchaseEditFormFromBill(storedBill, payments);
  test('row amounts, subtotal and previous balance are rounded to 2 decimals; paid-later payments count as paid', () => {
    // 1000 + 66.67 (66.666 rounded) = 1066.67 ; +100 (100.004 rounded) +20 -50 = 1136.67 ; paid 300+100+50+200 = 650
    expect(purchaseEditTotals(form)).toEqual({
      subtotal: 1066.67,
      grandTotal: 1136.67,
      totalPaid: 650,
      balanceDue: 486.67,
    });
  });
  test('grand total is clamped at 0 and the balance goes negative when paid', () => {
    const t = purchaseEditTotals({
      ...form,
      discountAmount: '5000',
      cash: '100',
      upi: '',
      account: '',
      additionalPaymentsTotal: 0,
    });
    expect(t).toMatchObject({ grandTotal: 0, totalPaid: 100, balanceDue: -100 });
  });
});
describe('buildPurchaseEditBill (exact field set written by the Update button)', () => {
  const form = purchaseEditFormFromBill(storedBill, payments);
  test('nested payment + top-level amountPaid/balanceDue, line items without sno', () => {
    expect(buildPurchaseEditBill(form)).toEqual({
      invoiceNo: '007',
      invoiceDate: '2026-10-03',
      supplierPhone: '9000000001',
      supplierName: 'ABC Mills',
      supplierAddress: 'Coimbatore',
      products: [
        { description: 'Yarn 30s', qty: 5, rate: 200, amount: 1000 },
        { description: 'Yarn 40s', qty: 2, rate: 33.333, amount: 66.666 },
      ],
      subtotal: 1066.67,
      previousBalance: 100,
      manualPreviousBalance: 20,
      discount: 50,
      grandTotal: 1136.67,
      // initial split only in cash/upi/account, totalPaid includes the 200 paid later
      payment: { cash: 300, upi: 100, account: 50, totalPaid: 650, balanceDue: 486.67 },
      amountPaid: 650,
      balanceDue: 486.67,
    });
  });
  test('differs from a freshly created bill by the top-level amountPaid / balanceDue fields', () => {
    const created = buildPurchaseBill({
      ...emptyPurchaseForm(),
      invoiceNo: '1',
      supplierName: 'A',
      supplierPhone: '9000000001',
      rows: [{ description: 'Yarn 30s', qty: '1', rate: '1' }],
    });
    const edited = buildPurchaseEditBill({
      ...purchaseEditFormFromBill(storedBill, []),
      rows: [{ description: 'Yarn 30s', qty: '1', rate: '1' }],
    });
    expect(created).not.toHaveProperty('amountPaid');
    expect(created).not.toHaveProperty('balanceDue');
    expect(edited.amountPaid).toBeDefined();
    expect(edited.balanceDue).toBeDefined();
    expect(Object.keys(created).sort()).toEqual(
      Object.keys(edited)
        .filter((k) => k !== 'amountPaid' && k !== 'balanceDue')
        .sort(),
    );
  });
  test('rows without a description or quantity are not stored but a quantity-only row still counts toward the subtotal', () => {
    const bill = buildPurchaseEditBill({
      ...form,
      rows: [
        { description: 'Yarn 30s', qty: '1', rate: '10' },
        { description: 'Yarn 40s', qty: '0', rate: '10' },
        { description: '', qty: '3', rate: '10' },
      ],
    });
    expect(bill.products).toEqual([{ description: 'Yarn 30s', qty: 1, rate: 10, amount: 10 }]);
    expect(bill.subtotal).toBe(40);
  });
  test('validation is the create rules without the shortcut-list rule', () => {
    expect(validatePurchaseBill(form, null)).toBeNull();
    expect(validatePurchaseBill({ ...form, supplierName: ' ' }, null)?.message).toBe(
      'Please enter the Supplier Name.',
    );
    expect(
      validatePurchaseBill({ ...form, rows: [{ description: 'Yarn 30s', qty: '0', rate: '1' }] }, null)
        ?.message,
    ).toBe('Please add at least one product with a valid quantity.');
  });
});
describe('savePurchaseEdit', () => {
  function stub(existing) {
    const calls = [];
    jest.spyOn(db, 'savePurchaseBill').mockImplementation(async (b) => {
      calls.push(`bill:${b.invoiceNo}`);
      return true;
    });
    jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockImplementation(async (no) => {
      calls.push(`payments:${no}`);
      return existing;
    });
    jest.spyOn(db, 'deletePurchasePaymentDoc').mockImplementation(async (id) => {
      calls.push(`delete:${id}`);
    });
    const saved = [];
    jest.spyOn(db, 'savePurchasePayment').mockImplementation(async (p) => {
      calls.push(`pay:${p.id}`);
      saved.push(p);
      return String(p.id);
    });
    jest.spyOn(db, 'saveSupplier').mockImplementation(async (s) => {
      calls.push(`supplier:${s.phone}`);
      return s.phone;
    });
    return { calls, saved };
  }
  const form = purchaseEditFormFromBill(storedBill, payments);
  test('bill first, then initial payments are deleted (not the later ones) and rewritten per non-zero method, then the supplier', async () => {
    const { calls, saved } = stub(payments);
    await savePurchaseEdit({ ...form, upi: '', account: '25' });
    expect(calls).toEqual([
      'bill:007',
      'payments:007',
      'delete:i-cash',
      'delete:i-upi',
      'delete:i-acc',
      'pay:purchase_payment_007_initial_cash',
      'pay:purchase_payment_007_initial_account',
      'supplier:9000000001',
    ]);
    expect(saved).toEqual([
      {
        id: 'purchase_payment_007_initial_cash',
        invoiceNo: '007',
        paymentDate: '2026-10-03',
        amount: 300,
        paymentMethod: 'cash',
        paymentType: 'initial',
      },
      {
        id: 'purchase_payment_007_initial_account',
        invoiceNo: '007',
        paymentDate: '2026-10-03',
        amount: 25,
        paymentMethod: 'account',
        paymentType: 'initial',
      },
    ]);
  });
  test('no initial payments are written when every method is zero (even if paid-later payments exist)', async () => {
    const { calls } = stub([]);
    await savePurchaseEdit({ ...form, cash: '', upi: '', account: '' });
    expect(calls.filter((c) => c.startsWith('pay:'))).toEqual([]);
  });
  test('failing to clear old payments or to save the supplier does not fail the update', async () => {
    stub(payments);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(db, 'deletePurchasePaymentDoc').mockRejectedValue(new Error('x'));
    jest.spyOn(db, 'saveSupplier').mockRejectedValue(new Error('y'));
    await expect(savePurchaseEdit(form)).resolves.toMatchObject({ invoiceNo: '007' });
  });
  test('a failing bill write is reported', async () => {
    stub([]);
    jest.spyOn(db, 'savePurchaseBill').mockRejectedValue(new Error('denied'));
    await expect(savePurchaseEdit(form)).rejects.toThrow('denied');
  });
});
