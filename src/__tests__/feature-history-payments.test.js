import { db } from '@/core/db';
import {
  additionalPaymentsLabel,
  generatePaymentTableData,
  parsePaymentAmounts,
  paymentMethodLabel,
  paymentSuccessMessage,
  paymentTimestamp,
  splitPayments,
  validatePaymentInput,
} from '@/features/history/lib/payments';
import { isUserError } from '@/features/history/lib/types';
import {
  addSalesPayment,
  applyAdditionalPayment,
  applyUndoAllPayments,
  buildAdditionalPaymentRecords,
  findPayment,
  undoAllSalesPayments,
  undoSalesPayment,
} from '@/features/history/sales/salesPayments';
const invoice = (over = {}) => ({
  invoiceNo: '003',
  invoiceDate: '2026-10-01',
  customerName: 'SLN TEX',
  customerAddress: 'Tirupur',
  customerPhone: '9876543210',
  products: [{ description: 'Shirt', qty: 10, rate: 100, amount: 1000 }],
  subtotal: 1000,
  previousBalance: 0,
  grandTotal: 1000,
  paymentBreakdown: { cash: 300, upi: 0, account: 0 },
  amountPaid: 300,
  balanceDue: 700,
  totalReturns: 0,
  adjustedBalanceDue: 700,
  ...over,
});
const pay = (over) => ({ id: 'p', paymentDate: '2026-10-01', amount: 0, ...over });
afterEach(() => jest.restoreAllMocks());
describe('add-payment input', () => {
  test('amounts are parsed with the web coercion (blank / junk = 0)', () => {
    expect(parsePaymentAmounts({ cash: '100.5', upi: '', account: 'x' })).toEqual({
      cash: 100.5,
      upi: 0,
      account: 0,
    });
  });
  test('validation order: amount first, then date; same wording as the web', () => {
    const none = { cash: 0, upi: 0, account: 0 };
    expect(validatePaymentInput(none, '')).toEqual({
      title: 'Warning',
      message: 'Please enter a valid payment amount in at least one payment method.',
    });
    expect(validatePaymentInput({ ...none, upi: 10 }, '')).toEqual({
      title: 'Warning',
      message: 'Please select a payment date.',
    });
    expect(validatePaymentInput({ ...none, upi: 10 }, '2026-10-03')).toBeNull();
  });
  test('payment timestamp = picked day + current local time', () => {
    expect(paymentTimestamp('2026-10-03', new Date(2026, 9, 5, 10, 20, 30))).toBe('2026-10-03T10:20:30');
    expect(paymentTimestamp('', new Date())).toBe('');
  });
  test('success message lists only the methods used', () => {
    expect(paymentSuccessMessage({ cash: 500, upi: 250.5, account: 0 })).toBe(
      'Payment of ₹750.50 added successfully!\nBreakdown: Cash: ₹500.00, UPI: ₹250.50',
    );
    expect(paymentSuccessMessage({ cash: 0, upi: 0, account: 1234 })).toBe(
      'Payment of ₹1,234.00 added successfully!\nBreakdown: Account: ₹1,234.00',
    );
  });
});
describe('payment summaries', () => {
  const payments = [
    pay({ id: 'a', paymentType: 'initial', amount: 300, paymentMethod: 'cash' }),
    pay({ id: 'b', paymentType: 'additional', amount: 100, paymentMethod: 'upi' }),
    pay({ id: 'c', amount: 50.5, paymentMethod: 'account' }),
  ];
  test('initial vs additional (anything that is not "initial" is additional)', () => {
    const split = splitPayments(payments);
    expect(split.initial.map((p) => p.id)).toEqual(['a']);
    expect(split.additional.map((p) => p.id)).toEqual(['b', 'c']);
    expect([split.initialTotal, split.additionalTotal]).toEqual([300, 150.5]);
  });
  test('additional-payments label: none, one, several', () => {
    expect(additionalPaymentsLabel([])).toBe('');
    expect(additionalPaymentsLabel([payments[1]])).toBe('₹100.00');
    expect(additionalPaymentsLabel([payments[1], payments[2]])).toBe('100.00 + 50.50 = ₹150.50');
  });
  test('method label', () => {
    expect(paymentMethodLabel({ paymentMethod: 'upi' })).toBe('UPI');
    expect(paymentMethodLabel({}, 'CASH')).toBe('CASH');
    expect(paymentMethodLabel({})).toBe('N/A');
  });
});
describe('generatePaymentTableData (statement payment table)', () => {
  test('invoice row, payments oldest first with running balance, then returns', () => {
    const rows = generatePaymentTableData(
      [
        pay({
          paymentType: 'additional',
          paymentDate: '2026-10-03T10:00:00',
          amount: 200,
          paymentMethod: 'upi',
        }),
        pay({ paymentType: 'initial', paymentDate: '2026-10-01', amount: 300, paymentMethod: 'cash' }),
      ],
      1000,
      100,
      '2026-10-04',
    );
    expect(rows).toEqual([
      ['4/10/2026', 'Invoice - Goods/Services', '1,000.00', '1,000.00'],
      ['1/10/2026', 'Payment - Initial (CASH)', '-Rs. 300.00', '700.00'],
      ['3/10/2026', 'Payment - Additional (UPI)', '-Rs. 200.00', '500.00'],
      ['Multiple Dates', 'Product Returns', '-Rs. 100.00', '400.00'],
    ]);
  });
  test('no payments and no returns: only the invoice row; method defaults to CASH', () => {
    expect(generatePaymentTableData([], 250, 0, '2026-10-04')).toEqual([
      ['4/10/2026', 'Invoice - Goods/Services', '250.00', '250.00'],
    ]);
    const rows = generatePaymentTableData(
      [pay({ paymentDate: '2026-10-02', amount: 50 })],
      250,
      0,
      '2026-10-04',
    );
    expect(rows[1]).toEqual(['2/10/2026', 'Payment - Additional (CASH)', '-Rs. 50.00', '200.00']);
  });
  test("does not reorder the caller's array", () => {
    const list = [pay({ id: '2', paymentDate: '2026-10-03' }), pay({ id: '1', paymentDate: '2026-10-01' })];
    generatePaymentTableData(list, 100, 0, '2026-10-04');
    expect(list.map((p) => p.id)).toEqual(['2', '1']);
  });
});
describe('sales payment field updates (exactly what the web wrote)', () => {
  test('add: amountPaid grows, balanceDue = grandTotal - amountPaid, breakdown grows per method', () => {
    const base = invoice();
    const next = applyAdditionalPayment(base, { cash: 100, upi: 50, account: 0 });
    expect(next).toMatchObject({
      amountPaid: 450,
      balanceDue: 550,
      paymentBreakdown: { cash: 400, upi: 50, account: 0 },
      adjustedBalanceDue: 700, // PARITY: not refreshed
    });
    expect(base.amountPaid).toBe(300);
    expect(base.paymentBreakdown).toEqual({ cash: 300, upi: 0, account: 0 });
  });
  test('add on an invoice without a breakdown starts from zeros', () => {
    const next = applyAdditionalPayment(
      invoice({ paymentBreakdown: undefined, amountPaid: 0, balanceDue: 1000 }),
      {
        cash: 0,
        upi: 0,
        account: 200,
      },
    );
    expect(next.paymentBreakdown).toEqual({ cash: 0, upi: 0, account: 200 });
    expect(next.balanceDue).toBe(800);
  });
  test('records: one per method with an amount, cash/upi/account order, paymentType additional', () => {
    expect(
      buildAdditionalPaymentRecords('003', { cash: 100, upi: 0, account: 40 }, '2026-10-03T10:20:30'),
    ).toEqual([
      {
        invoiceNo: '003',
        paymentDate: '2026-10-03T10:20:30',
        amount: 100,
        paymentMethod: 'cash',
        paymentType: 'additional',
      },
      {
        invoiceNo: '003',
        paymentDate: '2026-10-03T10:20:30',
        amount: 40,
        paymentMethod: 'account',
        paymentType: 'additional',
      },
    ]);
  });
  test('undo all: nothing paid, balance back to the grand total, breakdown zeroed', () => {
    expect(
      applyUndoAllPayments(
        invoice({ amountPaid: 450, balanceDue: 550, paymentBreakdown: { cash: 400, upi: 50, account: 0 } }),
      ),
    ).toMatchObject({
      amountPaid: 0,
      balanceDue: 1000,
      paymentBreakdown: { cash: 0, upi: 0, account: 0 },
    });
  });
});
describe('addSalesPayment', () => {
  test('saves the invoice, then each payment record, then re-computes later invoices', async () => {
    const events = [];
    const saved = [];
    const records = [];
    jest.spyOn(db, 'getInvoice').mockResolvedValue(invoice());
    jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => {
      events.push('saveInvoice');
      saved.push(i);
      return i.invoiceNo;
    });
    jest.spyOn(db, 'savePayment').mockImplementation(async (p) => {
      events.push(`savePayment:${p.paymentMethod}`);
      records.push(p);
      return 'id';
    });
    jest.spyOn(db, 'updateSubsequentInvoices').mockImplementation(async (name, no) => {
      events.push(`subsequent:${name}:${no}`);
    });
    await addSalesPayment(
      '003',
      { cash: 100, upi: 50, account: 0 },
      '2026-10-03',
      new Date(2026, 9, 5, 10, 20, 30),
    );
    expect(events).toEqual(['saveInvoice', 'savePayment:cash', 'savePayment:upi', 'subsequent:SLN TEX:003']);
    expect(saved[0]).toMatchObject({
      amountPaid: 450,
      balanceDue: 550,
      paymentBreakdown: { cash: 400, upi: 50, account: 0 },
    });
    expect(records).toEqual([
      {
        invoiceNo: '003',
        paymentDate: '2026-10-03T10:20:30',
        amount: 100,
        paymentMethod: 'cash',
        paymentType: 'additional',
      },
      {
        invoiceNo: '003',
        paymentDate: '2026-10-03T10:20:30',
        amount: 50,
        paymentMethod: 'upi',
        paymentType: 'additional',
      },
    ]);
  });
  test('unknown invoice -> user-facing "Invoice not found!" and nothing is written', async () => {
    jest.spyOn(db, 'getInvoice').mockResolvedValue(null);
    const save = jest.spyOn(db, 'saveInvoice');
    const error = await addSalesPayment('999', { cash: 1, upi: 0, account: 0 }, '2026-10-03').catch((e) => e);
    expect(isUserError(error)).toBe(true);
    expect(error.message).toBe('Invoice not found!');
    expect(save).not.toHaveBeenCalled();
  });
});
describe('undo payments', () => {
  const stored = (id, amount) => ({
    id,
    invoiceNo: '003',
    paymentDate: '2026-10-01',
    amount,
    paymentMethod: 'cash',
  });
  test('findPayment: exact id, then the id without a "payment_" prefix', () => {
    const list = [{ id: 'abc' }, { id: 'payment_003_initial_cash' }];
    expect(findPayment(list, 'payment_003_initial_cash')).toBe(list[1]);
    expect(findPayment(list, 'payment_abc')).toBe(list[0]);
    expect(findPayment(list, 'zzz')).toBeUndefined();
  });
  test('undo one goes through db.deletePayment (which recomputes the invoice) with the stored id', async () => {
    jest
      .spyOn(db, 'getPaymentsByInvoice')
      .mockResolvedValue([stored('payment_1', 100), stored('payment_2', 50)]);
    const del = jest.spyOn(db, 'deletePayment').mockResolvedValue();
    const payment = await undoSalesPayment('003', 'payment_2');
    expect(del).toHaveBeenCalledWith('payment_2');
    expect(payment.amount).toBe(50);
  });
  test('undo one: unknown id lists the available ids, deletes nothing', async () => {
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([stored('a', 1), stored('b', 2)]);
    const del = jest.spyOn(db, 'deletePayment').mockResolvedValue();
    const error = await undoSalesPayment('003', 'nope').catch((e) => e);
    expect(error.message).toBe('Payment not found! Looking for ID: nope. Available IDs: a, b');
    expect(isUserError(error)).toBe(true);
    expect(del).not.toHaveBeenCalled();
  });
  test('undo all: snapshot read BEFORE the deletions, each payment deleted, then the reset invoice saved', async () => {
    const events = [];
    const snapshot = invoice({
      amountPaid: 450,
      balanceDue: 550,
      paymentBreakdown: { cash: 400, upi: 50, account: 0 },
      totalReturns: 20,
      adjustedBalanceDue: 530,
    });
    jest.spyOn(db, 'getPaymentsByInvoice').mockImplementation(async () => {
      events.push('getPayments');
      return [stored('p1', 300), stored('p2', 150)];
    });
    jest.spyOn(db, 'getInvoice').mockImplementation(async () => {
      events.push('getInvoice');
      return snapshot;
    });
    jest.spyOn(db, 'deletePayment').mockImplementation(async (id) => {
      events.push(`delete:${id}`);
    });
    const saved = [];
    jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => {
      events.push('saveInvoice');
      saved.push(i);
      return i.invoiceNo;
    });
    jest.spyOn(db, 'updateSubsequentInvoices').mockImplementation(async (n, no) => {
      events.push(`subsequent:${n}:${no}`);
    });
    const result = await undoAllSalesPayments('003');
    expect(events).toEqual([
      'getPayments',
      'getInvoice',
      'delete:p1',
      'delete:p2',
      'saveInvoice',
      'subsequent:SLN TEX:003',
    ]);
    expect(result).toEqual({ count: 2, total: 450 });
    expect(saved[0]).toMatchObject({
      amountPaid: 0,
      balanceDue: 1000,
      paymentBreakdown: { cash: 0, upi: 0, account: 0 },
      totalReturns: 20,
      adjustedBalanceDue: 530, // PARITY: left as it was
    });
  });
  test('undo all with no payments does nothing', async () => {
    jest.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([]);
    const del = jest.spyOn(db, 'deletePayment');
    expect(await undoAllSalesPayments('003')).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });
});
describe('db.updateInvoiceAfterPaymentDeletion (what "undo one" relies on)', () => {
  test('PARITY: the amount comes off the breakdown entry named by the invoice legacy paymentMethod (default cash), not the undone payment method', async () => {
    const saved = [];
    jest
      .spyOn(db, 'getInvoice')
      .mockResolvedValue(
        invoice({ amountPaid: 400, balanceDue: 600, paymentBreakdown: { cash: 300, upi: 100, account: 0 } }),
      );
    jest.spyOn(db, 'saveInvoice').mockImplementation(async (i) => {
      saved.push(i);
      return i.invoiceNo;
    });
    const subsequent = jest.spyOn(db, 'updateSubsequentInvoices').mockResolvedValue();
    await db.updateInvoiceAfterPaymentDeletion('003', 100); // e.g. the UPI payment of 100 was undone
    expect(saved[0]).toMatchObject({
      amountPaid: 300,
      balanceDue: 700,
      paymentBreakdown: { cash: 200, upi: 100, account: 0 },
    });
    expect(subsequent).toHaveBeenCalledWith('SLN TEX', '003');
  });
});
