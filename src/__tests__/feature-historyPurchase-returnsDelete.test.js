import { db } from '@/core/db';
import { newReturnItem } from '@/features/history/lib/returns';
import {
  DELETE_BLOCKED_MESSAGE,
  DELETE_BLOCKED_TITLE,
  deletePurchaseBill,
  hasPurchasePaymentOrReturnHistory,
  paddedInvoiceNo,
  purchaseDeleteSuccessMessage,
} from '@/features/history/purchase/purchaseDelete';
import {
  buildPurchaseReturnRecord,
  savePurchaseReturnDraft,
  undoAllPurchaseReturns,
  undoPurchaseReturn,
} from '@/features/history/purchase/purchaseReturns';
const bill = (over = {}) => ({
  invoiceNo: '001',
  invoiceDate: '2026-10-01',
  supplierName: 'Sri Ganesh Yarns',
  supplierPhone: '9876543210',
  supplierAddress: 'Tirupur',
  products: [{ description: 'Cotton Yarn', qty: 10, rate: 100, amount: 1000 }],
  subtotal: 1000,
  grandTotal: 1000,
  payment: { cash: 300, upi: 0, account: 0, totalPaid: 300, balanceDue: 700 },
  ...over,
});
const item = (qty, rate = '100') => ({ ...newReturnItem('k'), choice: 0, qty, rate, reason: 'damaged' });
const stored = (id, returnAmount) => ({
  id,
  invoiceNo: '001',
  returnDate: '2026-10-02',
  description: 'Cotton Yarn',
  qty: 1,
  rate: returnAmount,
  returnAmount,
});
afterEach(() => jest.restoreAllMocks());
/** the supplier's bills and the returns collection as the save reads them */
function mockReturnsOf(found, returns, bills = [found]) {
  jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(found);
  jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(bills);
  jest.spyOn(db, 'getPurchaseReturnsByInvoice').mockImplementation(async () => [...returns]);
  jest.spyOn(db, 'getAllPurchaseReturns').mockImplementation(async () => [...returns]);
  jest.spyOn(db, 'syncPurchaseLedger').mockResolvedValue(null);
}
describe('savePurchaseReturnDraft', () => {
  test("saves one refund document per line (supplierName, not customerName), then refreshes the bill's return totals", async () => {
    const returns = [];
    mockReturnsOf(bill(), returns);
    const saveReturn = jest.spyOn(db, 'savePurchaseReturn').mockImplementation(async (r) => {
      returns.push(r);
      return 'id';
    });
    const saveBill = jest.spyOn(db, 'savePurchaseBill').mockResolvedValue(true);
    const sales = jest.spyOn(db, 'updateSubsequentInvoices');
    const result = await savePurchaseReturnDraft(
      '001',
      { returnDate: '2026-10-05', items: [item('2')] },
      new Date('2026-10-05T10:00:00.000Z'),
    );
    expect(result).toEqual({ ok: true, total: 200 });
    expect(saveReturn).toHaveBeenCalledWith({
      invoiceNo: '001',
      supplierName: 'Sri Ganesh Yarns',
      description: 'Cotton Yarn',
      qty: 2,
      rate: 100,
      returnAmount: 200,
      reason: 'damaged',
      returnDate: '2026-10-05',
      createdAt: '2026-10-05T10:00:00.000Z',
      settlementType: 'refund',
      refundMethod: 'cash',
    });
    // a refund from the supplier does not lower what is owed on the bill
    expect(saveBill).toHaveBeenCalledWith(
      expect.objectContaining({ totalReturns: 200, adjustedBalanceDue: 700 }),
    );
    // PARITY NOTE: the web also ran the SALES ledger recomputation with the supplier name; not ported
    expect(sales).not.toHaveBeenCalled();
  });
  test('no balance cap: a refund larger than the balance is saved; an Account refund stores its bank account', async () => {
    const returns = [stored('r0', 100)];
    mockReturnsOf(bill(), returns);
    const saveReturn = jest.spyOn(db, 'savePurchaseReturn').mockImplementation(async (r) => {
      returns.push(r);
      return 'id';
    });
    jest.spyOn(db, 'savePurchaseBill').mockResolvedValue(true);
    const result = await savePurchaseReturnDraft('001', {
      returnDate: '2026-10-05',
      items: [item('8', '100')],
      settlementType: 'refund',
      refundMethod: 'bank',
      bankAccountId: 'sbi',
    });
    expect(result).toEqual({ ok: true, total: 800 });
    expect(saveReturn).toHaveBeenCalledWith(
      expect.objectContaining({ settlementType: 'refund', refundMethod: 'bank', bankAccountId: 'sbi' }),
    );
  });
  test('an Account refund needs an account; nothing is written', async () => {
    mockReturnsOf(bill(), []);
    const saveReturn = jest.spyOn(db, 'savePurchaseReturn');
    const result = await savePurchaseReturnDraft('001', {
      returnDate: '2026-10-05',
      items: [item('1')],
      refundMethod: 'bank',
    });
    expect(result).toMatchObject({ ok: false, message: 'Please select the account for this refund.' });
    expect(saveReturn).not.toHaveBeenCalled();
  });
  test("quantity left to return comes from the supplier's bills' products and the stored returns", async () => {
    mockReturnsOf(bill({ payment: { cash: 0, account: 0, totalPaid: 0, balanceDue: 5000 } }), [
      { ...stored('r0', 100), qty: 9 },
    ]);
    const result = await savePurchaseReturnDraft('001', { returnDate: '2026-10-05', items: [item('2')] });
    expect(result).toMatchObject({
      ok: false,
      message: 'Cannot return 2 items. Only 1 items available for return for "Cotton Yarn".',
    });
  });
  test('unknown bill -> user-facing error', async () => {
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(null);
    const error = await savePurchaseReturnDraft('999', {
      returnDate: '2026-10-05',
      items: [item('1')],
    }).catch((e) => e);
    expect(error.message).toBe('Invoice not found!');
  });
  test('record shape', () => {
    expect(
      buildPurchaseReturnRecord(
        '001',
        'S',
        { description: 'd', qty: 1, rate: 2, returnAmount: 2, reason: '', returnDate: '2026-10-05' },
        new Date('2026-10-05T00:00:00.000Z'),
      ),
    ).toEqual({
      invoiceNo: '001',
      supplierName: 'S',
      description: 'd',
      qty: 1,
      rate: 2,
      returnAmount: 2,
      reason: '',
      returnDate: '2026-10-05',
      createdAt: '2026-10-05T00:00:00.000Z',
      // without a settlement argument a return is still a cash refund (never a balance adjustment)
      settlementType: 'refund',
      refundMethod: 'cash',
    });
  });
});
describe('undo returns', () => {
  test('undo one deletes the return document and refreshes the bill', async () => {
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(bill());
    jest.spyOn(db, 'getPurchaseReturnsByInvoice').mockResolvedValue([]);
    const del = jest.spyOn(db, 'deletePurchaseReturn').mockResolvedValue();
    const saveBill = jest.spyOn(db, 'savePurchaseBill').mockResolvedValue(true);
    await undoPurchaseReturn('001', 'r1');
    expect(del).toHaveBeenCalledWith('r1');
    expect(saveBill).toHaveBeenCalledWith(
      expect.objectContaining({ totalReturns: 0, adjustedBalanceDue: 700 }),
    );
  });
  test('undo all deletes every return and reports the count; null when there were none', async () => {
    jest.spyOn(db, 'getPurchaseBill').mockResolvedValue(bill());
    const list = jest
      .spyOn(db, 'getPurchaseReturnsByInvoice')
      .mockResolvedValue([stored('a', 1), stored('b', 2)]);
    const del = jest.spyOn(db, 'deletePurchaseReturn').mockResolvedValue();
    jest.spyOn(db, 'savePurchaseBill').mockResolvedValue(true);
    expect(await undoAllPurchaseReturns('001')).toBe(2);
    expect(del.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
    list.mockResolvedValue([]);
    del.mockClear();
    expect(await undoAllPurchaseReturns('001')).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });
});
describe('delete', () => {
  test('padded number: "P-" stripped, 3 digits', () => {
    expect(paddedInvoiceNo('P-5')).toBe('005');
    expect(paddedInvoiceNo('5')).toBe('005');
    expect(paddedInvoiceNo('012')).toBe('012');
    expect(paddedInvoiceNo('1234')).toBe('1234');
    expect(paddedInvoiceNo('abc')).toBe('abc');
  });
  test('payments / returns are looked up under the stored AND the padded number', async () => {
    const payments = jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([]);
    const returns = jest.spyOn(db, 'getPurchaseReturnsByInvoice').mockResolvedValue([]);
    expect(await hasPurchasePaymentOrReturnHistory('P-5')).toBe(false);
    expect(payments.mock.calls.map((c) => c[0])).toEqual(['P-5', '005']);
    expect(returns.mock.calls.map((c) => c[0])).toEqual(['P-5', '005']);
  });
  test('history under only the padded number still blocks the delete', async () => {
    jest
      .spyOn(db, 'getPurchasePaymentsByInvoice')
      .mockImplementation(async (no) => (no === '005' ? [{ id: 'x' }] : []));
    jest.spyOn(db, 'getPurchaseReturnsByInvoice').mockResolvedValue([]);
    expect(await hasPurchasePaymentOrReturnHistory('P-5')).toBe(true);
  });
  test('a returns-only history blocks it too; a failing check does not (the web went on to the confirmation)', async () => {
    jest.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([]);
    const returns = jest.spyOn(db, 'getPurchaseReturnsByInvoice').mockResolvedValue([stored('a', 1)]);
    expect(await hasPurchasePaymentOrReturnHistory('001')).toBe(true);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    returns.mockRejectedValue(new Error('offline'));
    expect(await hasPurchasePaymentOrReturnHistory('001')).toBe(false);
  });
  test("delete goes to the purchase recycle bin and the messages are the web's", async () => {
    const del = jest.spyOn(db, 'deletePurchaseBill').mockResolvedValue();
    await deletePurchaseBill('P-005');
    expect(del).toHaveBeenCalledWith('P-005');
    expect(purchaseDeleteSuccessMessage('P-005')).toBe(
      'Invoice #005 and all related data have been permanently deleted.',
    );
    expect(DELETE_BLOCKED_TITLE).toBe('Action Denied');
    expect(DELETE_BLOCKED_MESSAGE).toBe(
      'Please undo all the payment and return history first before deleting this bill.',
    );
  });
});
