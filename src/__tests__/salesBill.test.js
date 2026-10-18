import { db } from '@/core/db';
import {
  buildSalesInvoice,
  emptySalesForm,
  loadSalesBillForEditing,
  saveSalesBill,
  salesFormTotals,
  validateSalesBill,
} from '@/core/services/salesBill';
const shortcuts = [
  { shortcutKey: 'SH', fullDescription: 'Cotton Shirt' },
  { shortcutKey: 'TS', fullDescription: 'T Shirt' },
];
const form = (over = {}) => ({
  ...emptySalesForm(),
  invoiceNo: '012',
  invoiceDate: '2026-10-03',
  customerName: 'SLN TEX',
  customerAddress: 'Tirupur',
  customerPhone: '9876543210',
  rows: [
    { description: 'Cotton Shirt', qty: '10', rate: '120.50' },
    { description: 'T Shirt', qty: '2', rate: '99' },
  ],
  previousBalance: 300,
  manualPreviousBalance: '50',
  discountAmount: '25',
  cash: '500',
  account: '200',
  ...over,
});
afterEach(() => jest.restoreAllMocks());
describe('validateSalesBill (messages and order follow Utils.validateForm)', () => {
  test('requires invoice number, date, customer name', () => {
    expect(validateSalesBill(form({ invoiceNo: ' ' }), shortcuts)?.message).toBe(
      'Please enter the Invoice No',
    );
    expect(validateSalesBill(form({ invoiceDate: '' }), shortcuts)?.message).toBe(
      'Please select an invoice date',
    );
    expect(validateSalesBill(form({ customerName: '' }), shortcuts)?.message).toBe(
      'Please enter customer name',
    );
  });
  test('phone is optional but must be 10+ digits when given', () => {
    expect(validateSalesBill(form({ customerPhone: '' }), shortcuts)).toBeNull();
    expect(validateSalesBill(form({ customerPhone: '12345' }), shortcuts)?.title).toBe('Invalid Information');
  });
  test('needs at least one described item', () => {
    expect(
      validateSalesBill(form({ rows: [{ description: '  ', qty: '1', rate: '1' }] }), shortcuts)?.title,
    ).toBe('Empty Bill');
  });
  test('every product must come from the shortcut list (case-insensitive)', () => {
    expect(
      validateSalesBill(form({ rows: [{ description: 'cotton shirt', qty: '1', rate: '1' }] }), shortcuts),
    ).toBeNull();
    expect(
      validateSalesBill(form({ rows: [{ description: 'Mystery', qty: '1', rate: '1' }] }), shortcuts)?.title,
    ).toBe('Invalid Product');
    // an empty catalogue rejects everything, like the web app
    expect(validateSalesBill(form(), [])?.title).toBe('Invalid Product');
    // null = catalogue not loaded: skip the rule
    expect(validateSalesBill(form(), null)).toBeNull();
  });
});
describe('buildSalesInvoice', () => {
  test('computes the same totals the web form did', () => {
    const inv = buildSalesInvoice(form());
    // subtotal 1205 + 198 = 1403 ; total = 1403 + 300 + 50 - 25 = 1728 ; paid 700 ; due 1028
    expect(inv.subtotal).toBe(1403);
    expect(inv.grandTotal).toBe(1728);
    expect(inv.amountPaid).toBe(700);
    expect(inv.balanceDue).toBe(1028);
    expect(inv.paymentBreakdown).toEqual({ cash: 500, account: 200 });
    expect(inv.discountAmount).toBe(25);
    expect(inv.manualPreviousBalance).toBe(50);
    expect(inv.products.map((p) => [p.sno, p.amount])).toEqual([
      [1, 1205],
      [2, 198],
    ]);
  });
  test('payments added later from history count as paid', () => {
    const t = salesFormTotals(form({ additionalPaymentsTotal: 100 }));
    expect(t.totalPaid).toBe(800);
    expect(t.balanceDue).toBe(928);
  });
  test('the form has no UPI amount; a legacy UPI amount in later payments is stored as Account', () => {
    expect(emptySalesForm()).not.toHaveProperty('upi');
    expect(emptySalesForm().additionalPaymentsBreakdown).toEqual({ cash: 0, account: 0 });
    const inv = buildSalesInvoice(
      form({ additionalPaymentsTotal: 80, additionalPaymentsBreakdown: { cash: 30, upi: 50, account: 0 } }),
    );
    expect(inv.paymentBreakdown).toEqual({ cash: 530, account: 250 });
    expect(inv.amountPaid).toBe(780);
  });
});
describe('saveSalesBill', () => {
  function stubDb(existingPayments = []) {
    const calls = {
      invoices: [],
      payments: [],
      customers: [],
      deleted: [],
    };
    jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => {
      calls.invoices.push(i);
      return i.invoiceNo;
    });
    jest.spyOn(db, 'savePayment').mockImplementation(async (p) => {
      calls.payments.push(p);
      return String(p.id);
    });
    jest.spyOn(db, 'saveCustomer').mockImplementation(async (c) => {
      calls.customers.push(c);
      return c.phone;
    });
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue(existingPayments);
    jest.spyOn(db, 'deletePaymentDoc').mockImplementation(async (id) => {
      calls.deleted.push(id);
    });
    jest.spyOn(db, 'getInvoice').mockResolvedValue(null);
    const subsequent = jest.spyOn(db, 'syncSalesLedger').mockResolvedValue(null);
    return { calls, subsequent };
  }
  test('writes invoice, customer and one initial payment per non-zero method with deterministic ids', async () => {
    const { calls, subsequent } = stubDb();
    await saveSalesBill(form());
    expect(calls.invoices).toHaveLength(1);
    expect(calls.payments.map((p) => [p.id, p.amount, p.paymentMethod, p.paymentType])).toEqual([
      ['payment_012_initial_cash', 500, 'cash', 'initial'],
      ['payment_012_initial_account', 200, 'account', 'initial'],
    ]);
    expect(calls.customers[0]).toMatchObject({ phone: '9876543210', name: 'SLN TEX', address: 'Tirupur' });
    expect(subsequent).toHaveBeenCalledTimes(1);
    expect(subsequent.mock.calls[0][0]).toMatchObject({ customerName: 'SLN TEX', invoiceNo: '012' });
  });
  test('returns the bill as the ledger sync stored it; an edit that changes the customer also re-syncs the old one', async () => {
    const { subsequent } = stubDb();
    const before = { invoiceNo: '012', customerName: 'OLD', customerPhone: '9000000009' };
    db.getInvoice.mockResolvedValue(before);
    subsequent.mockImplementation(async (party) =>
      party.customerName === 'SLN TEX'
        ? [{ bill: { invoiceNo: '012' }, previousBalance: 450, grandTotal: 1749, balanceDue: 1049 }]
        : [],
    );
    const saved = await saveSalesBill(form());
    expect(saved).toMatchObject({ previousBalance: 450, grandTotal: 1749, balanceDue: 1049 });
    // the new customer's sync knows which bill changed (and how it was stored before) for the opening balance
    expect(subsequent.mock.calls[0][1]).toEqual({ changedNo: '012', before });
    expect(subsequent).toHaveBeenCalledWith(before, { before });
  });
  test('a confirmed overwrite of a different bill sends that bill to the recycle bin first', async () => {
    const { calls } = stubDb();
    const old = { invoiceNo: '012', customerName: 'OLD', customerPhone: '9000000009' };
    db.getInvoice.mockResolvedValue(old);
    const bin = jest.spyOn(db, 'moveInvoiceToRecycleBin').mockResolvedValue();
    await saveSalesBill(form(), { replaceExisting: true });
    expect(bin).toHaveBeenCalledWith('012');
    expect(calls.invoices).toHaveLength(1);
  });
  test('editing a legacy invoice without initial payment documents keeps what was paid', async () => {
    jest.spyOn(db, 'getInvoice').mockResolvedValue({
      invoiceNo: '012',
      customerName: 'SLN TEX',
      customerPhone: '9876543210',
      products: [],
      amountPaid: 700,
      paymentBreakdown: { cash: 600, upi: 100, account: 0 },
    });
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([]);
    const loaded = await loadSalesBillForEditing('012');
    // the legacy UPI amount is loaded as Account (no hidden amount the user cannot see or edit)
    expect(loaded?.form).toMatchObject({ cash: '600', account: '100' });
    expect(loaded?.form).not.toHaveProperty('upi');
  });
  test('replaces previously stored initial payments but leaves later payments alone', async () => {
    const { calls } = stubDb([
      { id: 'payment_012_initial_cash', paymentType: 'initial' },
      { id: 'payment_999', paymentType: 'additional' },
    ]);
    await saveSalesBill(form());
    expect(calls.deleted).toEqual(['payment_012_initial_cash']);
  });
  test('re-saving a legacy bill removes its initial UPI document and writes the amount as one Account document', async () => {
    const { calls } = stubDb([
      { id: 'payment_012_initial_cash', paymentType: 'initial', paymentMethod: 'cash', amount: 500 },
      { id: 'payment_012_initial_upi', paymentType: 'initial', paymentMethod: 'upi', amount: 200 },
    ]);
    await saveSalesBill(form({ bankAccountId: 'bank-1' }));
    expect(calls.deleted).toEqual(['payment_012_initial_cash', 'payment_012_initial_upi']);
    expect(calls.payments.map((p) => [p.id, p.paymentMethod, p.bankAccountId])).toEqual([
      ['payment_012_initial_cash', 'cash', 'bank-1'],
      ['payment_012_initial_account', 'account', 'bank-1'],
    ]);
    expect(calls.invoices[0].paymentBreakdown).toEqual({ cash: 500, account: 200 });
  });
  test('no customer record without a 10-digit phone; no payment docs when nothing paid', async () => {
    const { calls } = stubDb();
    await saveSalesBill(form({ customerPhone: '', cash: '0', account: '0' }));
    expect(calls.customers).toHaveLength(0);
    expect(calls.payments).toHaveLength(0);
  });
});
describe('loadSalesBillForEditing', () => {
  const stored = {
    invoiceNo: '012',
    invoiceDate: '2026-10-03',
    customerName: 'SLN TEX',
    customerAddress: 'Tirupur',
    customerPhone: '9876543210',
    products: [{ sno: 1, description: 'Cotton Shirt', qty: 10, rolls: 4, rate: 120.5, amount: 1205 }],
    subtotal: 1205,
    previousBalance: 300,
    manualPreviousBalance: 50,
    discountAmount: 25,
    grandTotal: 1530,
    paymentBreakdown: { cash: 999, upi: 0, account: 0 },
    amountPaid: 700,
    balanceDue: 830,
  };
  test('rebuilds the cash/account split from stored payments (legacy UPI = Account) and totals later payments', async () => {
    jest.spyOn(db, 'getInvoice').mockResolvedValue(stored);
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([
      {
        id: 'a',
        invoiceNo: '012',
        amount: 500,
        paymentMethod: 'cash',
        paymentType: 'initial',
        paymentDate: '',
      },
      {
        id: 'b',
        invoiceNo: '012',
        amount: 100,
        paymentMethod: 'upi',
        paymentType: 'initial',
        paymentDate: '',
      },
      {
        id: 'c',
        invoiceNo: '012',
        amount: 100,
        paymentMethod: 'cash',
        paymentType: 'additional',
        paymentDate: '',
      },
    ]);
    const loaded = await loadSalesBillForEditing('012');
    expect(loaded?.form).toMatchObject({
      cash: '500',
      account: '100',
      additionalPaymentsTotal: 100,
      additionalPaymentsBreakdown: { cash: 100, account: 0 },
      discountAmount: '25',
    });
    expect(loaded?.form.rows).toEqual([
      { description: 'Cotton Shirt', rolls: '4', qty: '10', rate: '120.5' },
    ]);
    expect(loaded?.form.previousBalance).toBe(300);
  });
  test('missing invoice -> null', async () => {
    jest.spyOn(db, 'getInvoice').mockResolvedValue(null);
    expect(await loadSalesBillForEditing('nope')).toBeNull();
  });
  test('legacy invoice without a breakdown: whole amountPaid is treated as cash', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest
      .spyOn(db, 'getInvoice')
      .mockResolvedValue({ ...stored, paymentBreakdown: undefined, amountPaid: 250 });
    jest.spyOn(db, 'getPaymentsByInvoice').mockRejectedValue(new Error('offline'));
    const loaded = await loadSalesBillForEditing('012');
    expect(loaded?.form).toMatchObject({ cash: '250', account: '0', additionalPaymentsTotal: 0 });
    expect(loaded?.form).not.toHaveProperty('upi');
  });
});
