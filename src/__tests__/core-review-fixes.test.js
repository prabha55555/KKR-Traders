/**
 * Regression tests for defects found in the end-to-end review (Oct 2026): sales bill edits, customer edits with
 * namesakes, the in-memory cache and product names containing "/".
 */
import { deleteDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { db } from '@/core/db';
import { emptySalesForm, loadSalesBillForEditing, saveSalesBill } from '@/core/services/salesBill';

beforeEach(() => {
  db.initialized = true;
  db.invalidateAll();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

const form = (over = {}) => ({
  ...emptySalesForm(),
  invoiceNo: '012',
  invoiceDate: '2026-07-03',
  customerName: 'SLN TEX',
  customerAddress: 'Tirupur',
  customerPhone: '9876543210',
  rows: [{ description: 'Cotton Shirt', qty: '10', rate: '100' }],
  cash: '500',
  account: '0',
  ...over,
});

function stubSales({ before = null, payments = [] } = {}) {
  const saved = { invoices: [], payments: [] };
  vi.spyOn(db, 'getInvoice').mockResolvedValue(before);
  vi.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue(payments);
  vi.spyOn(db, 'saveInvoice').mockImplementation(async (i) => saved.invoices.push(i));
  vi.spyOn(db, 'savePayment').mockImplementation(async (p) => saved.payments.push(p));
  vi.spyOn(db, 'deletePaymentDoc').mockResolvedValue();
  vi.spyOn(db, 'saveCustomer').mockResolvedValue('ok');
  vi.spyOn(db, 'syncSalesLedger').mockResolvedValue(null);
  return saved;
}

describe('sales bill edit', () => {
  test('a payment added from History while the edit was open still counts in the amount paid', async () => {
    const saved = stubSales({
      before: { invoiceNo: '012', customerName: 'SLN TEX', customerPhone: '9876543210' },
      payments: [
        { id: 'i', paymentType: 'initial', paymentMethod: 'cash', amount: 500, paymentDate: '2026-07-03' },
        { id: 'x', paymentType: 'additional', paymentMethod: 'account', amount: 300, bankAccountId: 'sbi' },
      ],
    });
    // the form was opened before the ₹300 payment: it knows of no later payments
    await saveSalesBill(form({ additionalPaymentsTotal: 0 }));
    expect(saved.invoices[0]).toMatchObject({
      amountPaid: 800,
      paymentBreakdown: { cash: 500, account: 300 },
    });
  });

  test('the money taken at the sale keeps its date when the bill is edited later', async () => {
    const saved = stubSales({
      before: { invoiceNo: '012', customerName: 'SLN TEX', customerPhone: '9876543210' },
      payments: [
        { id: 'i', paymentType: 'initial', paymentMethod: 'cash', amount: 500, paymentDate: '2026-07-03' },
      ],
    });
    await saveSalesBill(form());
    expect(saved.payments[0]).toMatchObject({ paymentType: 'initial', paymentDate: '2026-07-03' });
  });

  test('a phone-less bill keeps its ledger chain stamp when edited without changing the party', async () => {
    const saved = stubSales({
      before: { invoiceNo: '012', customerName: 'Ravi', customerPhone: '', ledgerParty: '' },
    });
    await saveSalesBill(form({ customerName: 'Ravi', customerPhone: '' }));
    expect(saved.invoices[0].ledgerParty).toBe('');
  });

  test('loading keeps the bank of the money taken at the sale, not the bank of a later payment', async () => {
    vi.spyOn(db, 'getInvoice').mockResolvedValue({
      invoiceNo: '012',
      customerName: 'SLN TEX',
      products: [],
      amountPaid: 7000,
      bankAccountId: 'sbi',
    });
    vi.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([
      { paymentType: 'initial', paymentMethod: 'account', amount: 5000, bankAccountId: 'hdfc' },
      { paymentType: 'additional', paymentMethod: 'account', amount: 2000, bankAccountId: 'sbi' },
    ]);
    const { form: loaded } = await loadSalesBillForEditing('012');
    expect(loaded.bankAccountId).toBe('hdfc');
  });

  test('an older bill keeps its legacy discount and its single UPI payment loads as Account', async () => {
    vi.spyOn(db, 'getInvoice').mockResolvedValue({
      invoiceNo: '012',
      customerName: 'SLN TEX',
      products: [],
      discount: 500,
      amountPaid: 1000,
      paymentMethod: 'upi',
    });
    vi.spyOn(db, 'getPaymentsByInvoice').mockResolvedValue([]);
    const { form: loaded } = await loadSalesBillForEditing('012');
    expect(loaded).toMatchObject({ discountAmount: '500', cash: '0', account: '1000' });
  });
});

describe('customer edit with a namesake', () => {
  const doc = (id, data) => ({ ref: id, data: () => data });
  test("only this customer's invoices are rewritten, not those of another customer with the same name", async () => {
    getDocs.mockResolvedValue({
      docs: [
        doc('mine', { customerName: 'Murugan', customerPhone: '9000000001' }),
        doc('other', { customerName: 'Murugan', customerPhone: '9000000002' }),
        doc('loose', { customerName: 'Murugan', customerPhone: '' }),
      ],
    });
    vi.spyOn(db, 'getAllCustomers').mockResolvedValue([]);
    vi.spyOn(db, 'saveCustomer').mockResolvedValue('ok');
    vi.spyOn(db, 'syncSalesLedger').mockResolvedValue(null);
    await db.updateCustomerDetails('Murugan', 'Murugan', '9000000001', 'New street', undefined, {
      oldPhone: '9000000001',
    });
    // the phone-less bill is ambiguous (two phones use the name), so it is left alone too
    expect(updateDoc.mock.calls.map((c) => c[0])).toEqual(['mine']);
  });
  test('without a namesake, phone-less bills of the name are still the customer’s', async () => {
    getDocs.mockResolvedValue({
      docs: [
        doc('mine', { customerName: 'Murugan', customerPhone: '9000000001' }),
        doc('loose', { customerName: 'Murugan', customerPhone: '' }),
      ],
    });
    vi.spyOn(db, 'getAllCustomers').mockResolvedValue([{ name: 'Murugan', phone: '9000000001' }]);
    vi.spyOn(db, 'saveCustomer').mockResolvedValue('ok');
    vi.spyOn(db, 'syncSalesLedger').mockResolvedValue(null);
    await db.updateCustomerDetails('Murugan', 'Murugan', '9000000001', '', undefined, {
      oldPhone: '9000000001',
    });
    expect(updateDoc.mock.calls.map((c) => c[0])).toEqual(['mine', 'loose']);
  });
});

describe('in-memory cache', () => {
  test('a read that was in flight during a save does not put the old data back', async () => {
    let release;
    const slow = vi.fn(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const reading = db._load('k', slow);
    await Promise.resolve();
    db.invalidate('k'); // a save happened meanwhile
    release(['old']);
    expect(await reading).toEqual(['old']);
    const fresh = vi.fn().mockResolvedValue(['new']);
    expect(await db._load('k', fresh)).toEqual(['new']);
    expect(fresh).toHaveBeenCalledTimes(1);
  });
  test('saving a bill-related record tells the stock cache (invalidate listeners hear it)', async () => {
    const heard = vi.fn();
    db.onInvalidate(heard);
    await db.deletePaymentDoc('p1');
    expect(heard).toHaveBeenCalledWith(['payments']);
  });
});

describe('product names with "/"', () => {
  test('opening stock of "40s/1 Grey" is stored under an id without a path separator', async () => {
    const { doc: docRef } = await import('firebase/firestore');
    await db.saveOpeningStock('40s/1 Grey', 10);
    await db.deleteOpeningStock('40s/1 Grey');
    const ids = docRef.mock.calls.filter((c) => c[1] === 'openingStocks').map((c) => c[2]);
    expect(ids).toEqual(['40s%2F1 Grey', '40s%2F1 Grey']);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ description: '40s/1 Grey', qty: 10 });
    expect(deleteDoc).toHaveBeenCalled();
  });
  test('names without "/" keep the id they always had', async () => {
    const { doc: docRef } = await import('firebase/firestore');
    await db.saveOpeningStock('Cotton Grey', 5);
    expect(docRef.mock.calls.find((c) => c[1] === 'openingStocks')[2]).toBe('Cotton Grey');
  });
});

describe('purchase payment undo', () => {
  test('undoing the payment made with the bill does not wipe later payments from the breakdown', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ invoiceNo: 'P1', amount: 1000, paymentMethod: 'cash', paymentType: 'initial' }),
    });
    vi.spyOn(db, 'getPurchaseBill').mockResolvedValue({
      invoiceNo: 'P1',
      grandTotal: 5000,
      amountPaid: 1500,
      payment: { cash: 1000, account: 0, totalPaid: 1500 },
      paymentBreakdown: { cash: 500, account: 0 }, // the ₹500 added later
    });
    const saved = vi.spyOn(db, 'savePurchaseBill').mockResolvedValue(true);
    vi.spyOn(db, 'syncPurchaseLedger').mockResolvedValue(null);
    await db.deletePurchasePayment('purchase_payment_P1_initial_cash');
    expect(saved.mock.calls[0][0]).toMatchObject({
      amountPaid: 500,
      paymentBreakdown: { cash: 500, account: 0 },
    });
  });
});

describe('processing: payments / returns always change the latest lot', () => {
  test('deleting a payment works on the stored lot, so a payment deleted just before stays deleted', async () => {
    const { deleteLotPayment } = await import('@/features/processing/processingService');
    const stale = {
      id: 'lot_1',
      dyeingPayments: [
        { id: 'p1', amount: 100 },
        { id: 'p2', amount: 200 },
      ],
    };
    // p1 was already deleted by the time p2 is
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue({
      id: 'lot_1',
      dyeingPayments: [{ id: 'p2', amount: 200 }],
    });
    const saved = vi.spyOn(db, 'saveProcessingLot').mockResolvedValue('lot_1');
    vi.spyOn(db, 'deleteAccountTransaction').mockResolvedValue();
    await deleteLotPayment(stale, 'dyeing', 'p2');
    expect(saved.mock.calls[0][0].dyeingPayments).toEqual([]);
  });
  test('a new dyeing unit cannot take the phone of an existing one', async () => {
    const { saveDyerRecord } = await import('@/features/dyeing/dyeingService');
    vi.spyOn(db, 'getAllDyers').mockResolvedValue([
      { id: 'dyer_9000000001', dyeingName: 'Sri Dyes', phone: '9000000001' },
    ]);
    const save = vi.spyOn(db, 'saveDyer').mockResolvedValue('x');
    await expect(
      saveDyerRecord({ dyeingName: 'New Dyes', ownerName: 'A', phone: '9000000001', address: '' }),
    ).rejects.toThrow(/already uses this phone/);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('purchase side', () => {
  test('a supplier edit leaves a namesake supplier’s bills alone', async () => {
    const { planSupplierEdit } = await import('@/features/purchase/supplierAdmin');
    const bills = [
      { invoiceNo: '1', supplierName: 'Ganesh', supplierPhone: '9000000001' },
      { invoiceNo: '2', supplierName: 'Ganesh', supplierPhone: '9000000002' },
      { invoiceNo: '3', supplierName: 'Ganesh', supplierPhone: '' },
    ];
    const plan = planSupplierEdit(
      { name: 'Ganesh', phone: '9000000001', address: '' },
      { name: 'Ganesh Yarns', phone: '9000000001', address: '' },
      bills,
    );
    expect(plan.billUpdates.map((u) => u.invoiceNo)).toEqual(['1']);
  });
  test('editing a purchase bill keeps the bank of the payment made with it, and a single UPI payment loads as Account', async () => {
    const { purchaseEditFormFromBill } = await import('@/features/purchase/purchaseEdit');
    const withBanks = purchaseEditFormFromBill(
      { invoiceNo: '7', products: [], bankAccountId: 'sbi', payment: { bankAccountId: 'sbi' } },
      [
        { paymentType: 'initial', paymentMethod: 'account', amount: 5000, bankAccountId: 'hdfc' },
        { paymentType: 'additional', paymentMethod: 'account', amount: 2000, bankAccountId: 'sbi' },
      ],
    );
    expect(withBanks.bankAccountId).toBe('hdfc');
    const legacy = purchaseEditFormFromBill(
      { invoiceNo: '8', products: [], amountPaid: 900, paymentMethod: 'upi' },
      [],
    );
    expect(legacy).toMatchObject({ cash: '', account: '900' });
  });
  test('History: the untracked first payment of an older UPI bill is shown as Account', async () => {
    const { withUntrackedInitialPayment } = await import('@/features/history/purchase/purchasePayments');
    const list = withUntrackedInitialPayment(
      { invoiceNo: '8', amountPaid: 900, paymentMethod: 'upi', grandTotal: 900 },
      [{ paymentType: 'additional', paymentMethod: 'cash', amount: 100 }],
    );
    expect(list[0]).toMatchObject({ paymentType: 'initial', paymentMethod: 'account' });
  });
  test('History: a later payment does not take over the bill’s bank', async () => {
    const { applyAdditionalPurchasePayment } = await import('@/features/history/purchase/purchasePayments');
    const { applyAdditionalPayment } = await import('@/features/history/sales/salesPayments');
    const p = applyAdditionalPurchasePayment(
      {
        grandTotal: 9000,
        amountPaid: 5000,
        bankAccountId: 'hdfc',
        payment: { cash: 0, account: 5000, bankAccountId: 'hdfc' },
      },
      { cash: 0, account: 2000, bankAccountId: 'sbi' },
    );
    expect(p.bankAccountId).toBe('hdfc');
    const s = applyAdditionalPayment(
      {
        grandTotal: 9000,
        amountPaid: 5000,
        bankAccountId: 'hdfc',
        paymentBreakdown: { cash: 0, account: 5000 },
      },
      { cash: 0, account: 2000, bankAccountId: 'sbi' },
    );
    expect(s.bankAccountId).toBe('hdfc');
  });
  test('History: a purchase bill’s Cash / Account split includes the payment made with the bill', async () => {
    const { toHistoryPurchase } = await import('@/features/history/purchase/purchaseModel');
    const view = toHistoryPurchase(
      {
        invoiceNo: '9',
        grandTotal: 9000,
        payment: { cash: 5000, account: 0, totalPaid: 7000 },
        paymentBreakdown: { cash: 0, account: 2000 },
      },
      [
        { paymentType: 'initial', paymentMethod: 'cash', amount: 5000 },
        { paymentType: 'additional', paymentMethod: 'account', amount: 2000 },
      ],
      [],
      false,
    );
    expect(view.paymentBreakdown).toEqual({ cash: 5000, account: 2000 });
  });
});
