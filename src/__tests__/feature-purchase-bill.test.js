import * as platform from '@/platform';
import { db } from '@/core/db';
import { shareAcknowledgement, validateAcknowledgement } from '@/features/purchase/acknowledgement';
import {
  checkPurchaseBeforeSave,
  lookupSupplier,
  previousBalanceFor,
} from '@/features/purchase/purchaseCreate';
import { emptyPurchaseForm } from '@/core/services/purchaseBill';
const shortcuts = [{ shortcutKey: 'YR', fullDescription: 'Yarn 30s' }];
const form = (over = {}) => ({
  ...emptyPurchaseForm(),
  invoiceNo: '008',
  supplierPhone: '9000000001',
  supplierName: 'ABC Mills',
  supplierAddress: 'Coimbatore',
  rows: [{ description: 'Yarn 30s', qty: '5', rate: '200' }],
  ...over,
});
const bill = (over) => ({
  invoiceNo: '001',
  invoiceDate: '2026-10-01',
  supplierName: 'ABC Mills',
  supplierPhone: '9000000001',
  supplierAddress: '',
  products: [],
  subtotal: 0,
  grandTotal: 1000,
  ...over,
});
afterEach(() => {
  jest.restoreAllMocks();
});
describe('lookupSupplier', () => {
  test('numbers shorter than 10 characters are never looked up', async () => {
    const get = jest.spyOn(db, 'getSupplier');
    expect(await lookupSupplier('98765 ')).toEqual({ kind: 'incomplete' });
    expect(get).not.toHaveBeenCalled();
  });
  test('known number -> supplier, unknown number -> notFound', async () => {
    const supplier = { phone: '9000000001', name: 'ABC Mills', address: 'Coimbatore' };
    const get = jest.spyOn(db, 'getSupplier').mockResolvedValueOnce(supplier).mockResolvedValueOnce(null);
    expect(await lookupSupplier(' 9000000001 ')).toEqual({ kind: 'found', supplier });
    expect(get).toHaveBeenCalledWith('9000000001');
    expect(await lookupSupplier('9000000002')).toEqual({ kind: 'notFound' });
  });
});
describe('previousBalanceFor', () => {
  test('is 0 without a supplier and does not touch the database', async () => {
    const all = jest.spyOn(db, 'getAllPurchaseBills');
    expect(await previousBalanceFor({ supplierName: ' ', supplierPhone: '', invoiceNo: '9' })).toBe(0);
    expect(all).not.toHaveBeenCalled();
  });
  /** self-consistent bill: what is still owed after `paid`, carried from `previousBalance` */
  const owed = (no, subtotal, paid = 0, previousBalance = 0, over = {}) =>
    bill({
      invoiceNo: no,
      subtotal,
      previousBalance,
      grandTotal: subtotal + previousBalance,
      payment: { cash: paid, upi: 0, account: 0, totalPaid: paid, balanceDue: subtotal + previousBalance - paid },
      ...over,
    });
  const stubBills = (bills, returns = []) => {
    jest.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(bills);
    jest.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue(returns);
  };
  test("new bill: closing balance of the supplier's latest bill, rounded to 2 decimals", async () => {
    stubBills([
      owed('002', 640.456, 0, 10),
      owed('001', 10),
      owed('003', 999, 0, 0, { supplierName: 'Other', supplierPhone: '9222222222' }),
    ]);
    expect(
      await previousBalanceFor({ supplierName: 'ABC Mills', supplierPhone: '9000000001', invoiceNo: '003' }),
    ).toBe(650.46);
  });
  test('an invoice number that already exists resolves to the bill before it', async () => {
    stubBills([owed('002', 640, 0, 10), owed('001', 10)]);
    expect(
      await previousBalanceFor({ supplierName: 'ABC Mills', supplierPhone: '9000000001', invoiceNo: '002' }),
    ).toBe(10);
  });
  test('bills that only have the nested payment object are carried (the web showed 0 until the bill was edited)', async () => {
    stubBills([owed('001', 1000)]);
    expect(
      await previousBalanceFor({ supplierName: 'ABC Mills', supplierPhone: '9000000001', invoiceNo: '002' }),
    ).toBe(1000);
  });
  test('payments and returns added to earlier bills are followed without re-saving them', async () => {
    stubBills([owed('001', 1000, 400), owed('002', 500, 0, 1000)], [{ invoiceNo: '002', returnAmount: 100 }]);
    // 001 now owes 600 -> 002: 500 + 600 = 1100, less 100 returned
    expect(
      await previousBalanceFor({ supplierName: 'ABC Mills', supplierPhone: '9000000001', invoiceNo: '003' }),
    ).toBe(1000);
  });
});
describe('checkPurchaseBeforeSave', () => {
  test('validates against a fresh shortcut list and reports the web messages', async () => {
    jest.spyOn(db, 'getAllShortcuts').mockResolvedValue(shortcuts);
    const exists = jest.spyOn(db, 'getPurchaseBill');
    expect(await checkPurchaseBeforeSave(form({ supplierName: '' }))).toEqual({
      error: { title: 'Missing Information', message: 'Please enter the Supplier Name.' },
    });
    expect(
      await checkPurchaseBeforeSave(form({ rows: [{ description: 'Mystery', qty: '1', rate: '1' }] })),
    ).toEqual({
      error: { title: 'Invalid Product', message: 'Please select products only from the suggestions list.' },
    });
    expect(exists).not.toHaveBeenCalled();
  });
  test('flags a bill number that already exists so the screen can ask before overwriting', async () => {
    jest.spyOn(db, 'getAllShortcuts').mockResolvedValue(shortcuts);
    const get = jest
      .spyOn(db, 'getPurchaseBill')
      .mockResolvedValueOnce(bill({ invoiceNo: '008' }))
      .mockResolvedValueOnce(null);
    expect(await checkPurchaseBeforeSave(form({ invoiceNo: ' 008 ' }))).toEqual({
      error: null,
      overwrites: true,
    });
    expect(get).toHaveBeenCalledWith('008');
    expect(await checkPurchaseBeforeSave(form())).toEqual({ error: null, overwrites: false });
  });
});
describe('validateAcknowledgement', () => {
  test('needs a product with a quantity', () => {
    expect(
      validateAcknowledgement(form({ rows: [{ description: 'Yarn 30s', qty: '0', rate: '5' }] }), shortcuts)
        ?.message,
    ).toBe('Please add at least one product before sharing.');
  });
  test('create page: products must come from the shortcut list; edit page (null) does not care', () => {
    const unknown = form({ rows: [{ description: 'Mystery', qty: '1', rate: '1' }] });
    expect(validateAcknowledgement(unknown, shortcuts)?.message).toBe(
      'Please select products only from the suggestions list.',
    );
    expect(validateAcknowledgement(unknown, null)).toBeNull();
    expect(validateAcknowledgement(form(), shortcuts)).toBeNull();
  });
});
describe('shareAcknowledgement', () => {
  afterEach(() => jest.restoreAllMocks());
  test('uses the native share sheet when the browser has one', async () => {
    const share = jest.spyOn(platform, 'shareText').mockResolvedValue('shared');
    const copy = jest.spyOn(platform, 'copyText');
    expect(await shareAcknowledgement('hello')).toBe('shared');
    expect(share).toHaveBeenCalledWith('hello', 'Acknowledgement');
    expect(copy).not.toHaveBeenCalled();
  });
  test('a dismissed share sheet is not an error and does not copy', async () => {
    jest.spyOn(platform, 'shareText').mockResolvedValue('dismissed');
    const copy = jest.spyOn(platform, 'copyText');
    expect(await shareAcknowledgement('hello')).toBe('dismissed');
    expect(copy).not.toHaveBeenCalled();
  });
  test('falls back to the clipboard when sharing is unavailable', async () => {
    jest.spyOn(platform, 'shareText').mockResolvedValue('unavailable');
    const copy = jest.spyOn(platform, 'copyText').mockResolvedValueOnce(true);
    expect(await shareAcknowledgement('hello')).toBe('copied');
    expect(copy).toHaveBeenCalledWith('hello');
    copy.mockResolvedValueOnce(false);
    expect(await shareAcknowledgement('hello')).toBe('failed');
  });
});
