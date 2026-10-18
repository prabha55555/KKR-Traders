import { db } from '@/core/db';
import { isUserError } from '@/features/history/lib/types';
import {
  addPurchasePayment,
  applyAdditionalPurchasePayment,
  applyUndoAllPurchasePayments,
  applyUndoInitialPayment,
  initialPaidAmount,
  loadPurchasePaymentHistory,
  purchasePaymentSuccessMessage,
  statementPayments,
  undoAllPurchasePayments,
  undoPurchasePayment,
  withUntrackedInitialPayment,
} from '@/features/history/purchase/purchasePayments';
/** a bill as purchase.js writes it: only the nested payment object */
const bill = (over = {}) => ({
  invoiceNo: '001',
  invoiceDate: '2026-10-01',
  supplierName: 'Sri Ganesh Yarns',
  supplierPhone: '9876543210',
  supplierAddress: 'Tirupur',
  products: [],
  subtotal: 8000,
  grandTotal: 8000,
  payment: { cash: 5000, upi: 0, account: 0, totalPaid: 5000, balanceDue: 3000 },
  ...over,
});
const stored = (id, amount, paymentType, paymentMethod = 'cash') => ({
  id,
  invoiceNo: '001',
  paymentDate: '2026-10-01',
  amount,
  paymentMethod,
  paymentType,
});
const view = (over) => ({ id: 'p', paymentDate: '2026-10-01', amount: 0, ...over });
afterEach(() => jest.restoreAllMocks());
describe('add payment field updates (what the live addPayment wrote)', () => {
  test('amountPaid and balanceDue appear at the top level, the breakdown grows, payment.totalPaid/balanceDue follow', () => {
    const base = bill();
    const next = applyAdditionalPurchasePayment(base, { cash: 100, upi: 50, account: 0 });
    expect(next).toMatchObject({
      amountPaid: 5150,
      balanceDue: 2850,
      paymentBreakdown: { cash: 100, upi: 50, account: 0 },
      payment: { cash: 5000, upi: 0, account: 0, totalPaid: 5150, balanceDue: 2850 },
    });
    // the nested cash/upi/account stay the INITIAL split; the original object is untouched
    expect(base.payment).toEqual({ cash: 5000, upi: 0, account: 0, totalPaid: 5000, balanceDue: 3000 });
    expect(base.amountPaid).toBeUndefined();
  });
  test('top-level amountPaid is read before payment.totalPaid; an existing breakdown keeps growing', () => {
    const next = applyAdditionalPurchasePayment(
      bill({ amountPaid: 6000, balanceDue: 2000, paymentBreakdown: { cash: 1000, upi: 0, account: 0 } }),
      { cash: 0, upi: 0, account: 400 },
    );
    expect(next).toMatchObject({
      amountPaid: 6400,
      balanceDue: 1600,
      paymentBreakdown: { cash: 1000, upi: 0, account: 400 },
    });
  });
  test('a bill without a nested payment object gets no nested object', () => {
    const next = applyAdditionalPurchasePayment(
      bill({ payment: undefined, amountPaid: 1000, balanceDue: 7000 }),
      {
        cash: 500,
        upi: 0,
        account: 0,
      },
    );
    expect(next).toMatchObject({ amountPaid: 1500, balanceDue: 6500 });
    expect(next.payment).toBeUndefined();
  });
  test('success message is the total only (no breakdown line, unlike sales)', () => {
    expect(purchasePaymentSuccessMessage({ cash: 100, upi: 50, account: 0 })).toBe(
      'Payment of ₹150.00 added successfully!',
    );
  });
});
describe('addPurchasePayment', () => {
  test('saves the bill first, then one payment document per method; no later-bills recalculation', async () => {
    const events = [];
    const saved = [];
    const records = [];
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(bill());
    jest.spyOn(db, 'savePurchaseBill').mockImplementation(async (b) => {
      events.push('saveBill');
      saved.push(b);
      return true;
    });
    jest.spyOn(db, 'savePurchasePayment').mockImplementation(async (p) => {
      events.push(`savePayment:${p.paymentMethod}`);
      records.push(p);
      return 'id';
    });
    await addPurchasePayment(
      '001',
      { cash: 100, upi: 50, account: 0 },
      '2026-10-03',
      new Date(2026, 9, 5, 10, 20, 30),
    );
    expect(events).toEqual(['saveBill', 'savePayment:cash', 'savePayment:upi']);
    expect(saved[0]).toMatchObject({ amountPaid: 5150, balanceDue: 2850 });
    expect(records).toEqual([
      {
        invoiceNo: '001',
        paymentDate: '2026-10-03T10:20:30',
        amount: 100,
        paymentMethod: 'cash',
        paymentType: 'additional',
      },
      {
        invoiceNo: '001',
        paymentDate: '2026-10-03T10:20:30',
        amount: 50,
        paymentMethod: 'upi',
        paymentType: 'additional',
      },
    ]);
  });
  test('unknown bill -> user-facing "Purchase bill not found!" and nothing is written', async () => {
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(null);
    const save = jest.spyOn(db, 'savePurchaseBill');
    const error = await addPurchasePayment('999', { cash: 1, upi: 0, account: 0 }, '2026-10-03').catch(
      (e) => e,
    );
    expect(isUserError(error)).toBe(true);
    expect(error.message).toBe('Purchase bill not found!');
    expect(save).not.toHaveBeenCalled();
  });
});
describe('the initial payment without a payment document', () => {
  test('initial amount: nested split, or (old bills) the stored paid total minus the payment documents', () => {
    expect(
      initialPaidAmount(
        bill({ payment: { cash: 100, upi: 200, account: 300, totalPaid: 600, balanceDue: 0 } }),
      ),
    ).toBe(600);
    expect(initialPaidAmount(bill({ payment: undefined, amountPaid: 6000 }), [{ amount: 1000 }])).toBe(5000);
    expect(initialPaidAmount(bill({ payment: undefined, amountPaid: 500 }), [{ amount: 1000 }])).toBe(0);
    expect(initialPaidAmount(bill({ payment: undefined }))).toBe(0);
  });
  test('a synthetic initial payment (dated the bill date, id fake_initial_<no>) is put first when no initial document exists', () => {
    const list = withUntrackedInitialPayment(
      bill({ payment: { cash: 0, upi: 2000, account: 0, totalPaid: 2000, balanceDue: 0 } }),
      [view({ id: 'a', paymentType: 'additional', amount: 50 })],
    );
    expect(list.map((p) => p.id)).toEqual(['fake_initial_001', 'a']);
    expect(list[0]).toEqual({
      id: 'fake_initial_001',
      paymentDate: '2026-10-01',
      amount: 2000,
      paymentMethod: 'upi',
      paymentType: 'initial',
    });
  });
  test('method precedence is cash < upi < account; nothing is added when an initial document exists or nothing was paid', () => {
    const split = (cash, upi, account) =>
      bill({ payment: { cash, upi, account, totalPaid: cash + upi + account, balanceDue: 0 } });
    expect(withUntrackedInitialPayment(split(10, 20, 30), [])[0].paymentMethod).toBe('account');
    expect(withUntrackedInitialPayment(split(10, 0, 0), [])[0].paymentMethod).toBe('cash');
    expect(withUntrackedInitialPayment(split(10, 0, 0), [view({ paymentType: 'initial' })])).toHaveLength(1);
    expect(withUntrackedInitialPayment(split(0, 0, 0), [])).toEqual([]);
  });
  test('statements only print a payment table when the bill has payment records', () => {
    expect(statementPayments(bill(), [])).toEqual([]);
    expect(
      statementPayments(bill(), [view({ id: 'a', paymentType: 'additional', amount: 50 })]),
    ).toHaveLength(2);
  });
  test('loadPurchasePaymentHistory merges the synthetic initial payment into the documents', async () => {
    jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([stored('x', 50, 'additional')]);
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(bill());
    const history = await loadPurchasePaymentHistory('001');
    expect(history.payments.map((p) => p.id)).toEqual(['fake_initial_001', 'x']);
  });
});
describe('undo field updates', () => {
  test('undoing the initial payment: split cleared, paid total reduced, balances restored — also on a bill with only the nested object', () => {
    // PARITY NOTE (fixed): the web computed `(amountPaid || 0) - initial` on a top-level field that does not exist here
    expect(applyUndoInitialPayment(bill(), 5000)).toEqual({
      amountPaid: 0,
      balanceDue: 8000,
      payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 8000 },
    });
  });
  test('undoing the initial payment keeps later payments: 6000 paid = 5000 initial + 1000 later', () => {
    expect(
      applyUndoInitialPayment(
        bill({
          amountPaid: 6000,
          balanceDue: 2000,
          payment: { cash: 5000, upi: 0, account: 0, totalPaid: 6000, balanceDue: 2000 },
        }),
        5000,
      ),
    ).toMatchObject({
      amountPaid: 1000,
      balanceDue: 7000,
      payment: { cash: 0, totalPaid: 1000, balanceDue: 7000 },
    });
  });
  test('undo all: nothing paid, balance = grand total, split and breakdown zeroed', () => {
    expect(
      applyUndoAllPurchasePayments(
        bill({ amountPaid: 6000, balanceDue: 2000, paymentBreakdown: { cash: 0, upi: 1000, account: 0 } }),
      ),
    ).toEqual({
      amountPaid: 0,
      balanceDue: 8000,
      payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 8000 },
      paymentBreakdown: { cash: 0, upi: 0, account: 0 },
    });
  });
});
describe('undoPurchasePayment', () => {
  test('the synthetic initial payment is reverted on the bill itself (partial update, no payment document touched)', async () => {
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(bill());
    jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([]);
    const update = jest.spyOn(db, 'updatePurchaseBillFields').mockResolvedValue();
    const del = jest.spyOn(db, 'deletePurchasePayment');
    const result = await undoPurchasePayment('001', 'fake_initial_001');
    expect(result).toEqual({ initialWithoutDocument: true });
    expect(del).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith('001', {
      amountPaid: 0,
      balanceDue: 8000,
      payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 8000 },
    });
  });
  test('an additional payment document goes through db.deletePurchasePayment (which recomputes the bill) and nothing else', async () => {
    jest
      .spyOn(db, 'getPurchasePaymentsByInvoice')
      .mockResolvedValue([stored('p1', 100, 'additional'), stored('p2', 50, 'additional')]);
    const del = jest.spyOn(db, 'deletePurchasePayment').mockResolvedValue(true);
    const update = jest.spyOn(db, 'updatePurchaseBillFields').mockResolvedValue();
    await undoPurchasePayment('001', 'p2');
    expect(del).toHaveBeenCalledWith('p2');
    expect(update).not.toHaveBeenCalled();
  });
  test('deleting an INITIAL document also removes it from the nested split, so no synthetic payment reappears (and cannot be undone twice)', async () => {
    jest
      .spyOn(db, 'getPurchasePaymentsByInvoice')
      .mockResolvedValue([stored('purchase_payment_001_initial_cash', 5000, 'initial')]);
    jest.spyOn(db, 'deletePurchasePayment').mockResolvedValue(true);
    // what db.deletePurchasePayment left behind: totals lowered, split untouched
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(
      bill({
        amountPaid: 0,
        balanceDue: 8000,
        payment: { cash: 5000, upi: 0, account: 0, totalPaid: 0, balanceDue: 8000 },
      }),
    );
    const update = jest.spyOn(db, 'updatePurchaseBillFields').mockResolvedValue();
    await undoPurchasePayment('001', 'purchase_payment_001_initial_cash');
    expect(update).toHaveBeenCalledWith('001', {
      payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 8000 },
    });
  });
  test('unknown id -> user-facing error, nothing deleted', async () => {
    jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([stored('a', 1, 'additional')]);
    const del = jest.spyOn(db, 'deletePurchasePayment');
    const error = await undoPurchasePayment('001', 'nope').catch((e) => e);
    expect(isUserError(error)).toBe(true);
    expect(del).not.toHaveBeenCalled();
  });
});
describe('undoAllPurchasePayments', () => {
  test('every document is deleted, then the bill is reset ONCE from a fresh read — the initial amount is not subtracted twice', async () => {
    const events = [];
    jest
      .spyOn(db, 'getPurchasePaymentsByInvoice')
      .mockResolvedValue([
        stored('purchase_payment_001_initial_cash', 5000, 'initial'),
        stored('p2', 1000, 'additional'),
      ]);
    // after the deletions db.deletePurchasePayment has already lowered the totals to 0 / 8000
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(
      bill({
        amountPaid: 6000,
        balanceDue: 2000,
        payment: { cash: 5000, upi: 0, account: 0, totalPaid: 6000, balanceDue: 2000 },
      }),
    );
    jest.spyOn(db, 'deletePurchasePayment').mockImplementation(async (id) => {
      events.push(`delete:${id}`);
      return true;
    });
    const update = jest.spyOn(db, 'updatePurchaseBillFields').mockImplementation(async (_no, data) => {
      events.push('update');
      expect(data).toMatchObject({
        amountPaid: 0,
        balanceDue: 8000,
        payment: { cash: 0, totalPaid: 0, balanceDue: 8000 },
      });
    });
    const result = await undoAllPurchasePayments('001');
    expect(events).toEqual(['delete:purchase_payment_001_initial_cash', 'delete:p2', 'update']);
    expect(update).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ count: 2, total: 6000 });
  });
  test('an old bill with no payment documents counts its synthetic initial payment and is reset without deleting anything', async () => {
    jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([]);
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(bill());
    const del = jest.spyOn(db, 'deletePurchasePayment');
    const update = jest.spyOn(db, 'updatePurchaseBillFields').mockResolvedValue();
    const result = await undoAllPurchasePayments('001');
    expect(result).toEqual({ count: 1, total: 5000 });
    expect(del).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
  test('nothing paid and no documents -> null and nothing is written', async () => {
    jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([]);
    jest
      .spyOn(db, 'getPurchaseBill')
      .mockResolvedValue(bill({ payment: { cash: 0, upi: 0, account: 0, totalPaid: 0, balanceDue: 8000 } }));
    const update = jest.spyOn(db, 'updatePurchaseBillFields');
    expect(await undoAllPurchasePayments('001')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });
});
