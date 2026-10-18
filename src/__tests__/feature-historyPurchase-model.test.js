import {
  buildPurchaseHistoryData,
  PURCHASE_LABELS,
  toHistoryPurchase,
} from '@/features/history/purchase/purchaseModel';
import { filterInvoices, recentInvoices } from '@/features/history/lib/filters';
import { EMPTY_FILTERS, displayInvoiceNo } from '@/features/history/lib/types';
const bill = (over = {}) => ({
  invoiceNo: '001',
  invoiceDate: '2026-10-01',
  supplierName: 'Sri Ganesh Yarns',
  supplierPhone: '9876543210',
  supplierAddress: 'Tirupur',
  products: [{ description: 'Cotton Yarn', qty: 10, rate: 750, amount: 7500 }],
  subtotal: 7500,
  previousBalance: 500,
  manualPreviousBalance: 100,
  discount: 100,
  grandTotal: 8000,
  payment: { cash: 5000, upi: 0, account: 0, totalPaid: 5000, balanceDue: 3000 },
  ...over,
});
const doc = (over = {}) => ({
  id: 'purchase_payment_001_initial_cash',
  invoiceNo: '001',
  paymentDate: '2026-10-01',
  amount: 5000,
  paymentMethod: 'cash',
  paymentType: 'initial',
  ...over,
});
const ret = (over = {}) => ({
  id: 'r1',
  invoiceNo: '001',
  returnDate: '2026-10-02',
  description: 'Cotton Yarn',
  qty: 1,
  rate: 200,
  returnAmount: 200,
  ...over,
});
describe('toHistoryPurchase (hybrid payment schema)', () => {
  test('a new bill: paid / balance come from the nested payment object, returns from the collection', () => {
    const view = toHistoryPurchase(bill(), [doc()], [ret()], true);
    expect(view).toMatchObject({
      invoiceNo: '001',
      partyName: 'Sri Ganesh Yarns',
      partyPhone: '9876543210',
      partyAddress: 'Tirupur',
      subtotal: 7500,
      previousBalance: 600,
      discountAmount: 100,
      grandTotal: 8000,
      amountPaid: 5000,
      balanceDue: 3000,
      totalReturns: 200,
      adjustedBalanceDue: 2800,
      canAddPayment: true,
    });
    expect(view.payments).toHaveLength(1);
    expect(view.returns[0].returnAmount).toBe(200);
  });
  test('an edited / legacy bill: top-level amountPaid and balanceDue are used when there is no nested object', () => {
    const view = toHistoryPurchase(
      bill({ payment: undefined, amountPaid: 2000, balanceDue: 6000 }),
      [],
      [],
      false,
    );
    expect(view).toMatchObject({
      amountPaid: 2000,
      balanceDue: 6000,
      adjustedBalanceDue: 6000,
      totalReturns: 0,
    });
  });
  test('nested balance wins even when it is 0 (fully paid), the stored adjustedBalanceDue is ignored', () => {
    const view = toHistoryPurchase(
      bill({
        payment: { cash: 8000, upi: 0, account: 0, totalPaid: 8000, balanceDue: 0 },
        balanceDue: 99,
        adjustedBalanceDue: 99,
      }),
      [],
      [ret({ returnAmount: 0 })],
      false,
    );
    expect(view.balanceDue).toBe(0);
    expect(view.adjustedBalanceDue).toBe(0);
  });
  test('Current Bill Amount falls back to the grand total; discount reads `discountAmount` before `discount`', () => {
    expect(toHistoryPurchase(bill({ subtotal: 0 }), [], [], false).subtotal).toBe(8000);
    expect(toHistoryPurchase(bill({ discount: 5, discountAmount: 7 }), [], [], false).discountAmount).toBe(7);
    expect(toHistoryPurchase(bill({ discount: undefined }), [], [], false).discountAmount).toBe(0);
  });
  test('the legacy paymentMethod badge and the top-level breakdown are passed through', () => {
    const view = toHistoryPurchase(
      bill({ paymentMethod: 'upi', paymentBreakdown: { cash: 0, upi: 50, account: 0 } }),
      [],
      [],
      false,
    );
    expect(view.legacyPaymentMethod).toBe('upi');
    expect(view.paymentBreakdown).toEqual({ cash: 0, upi: 50, account: 0 });
  });
});
describe('buildPurchaseHistoryData', () => {
  const bills = [
    bill({ invoiceNo: '001', invoiceDate: '2026-10-01' }),
    bill({ invoiceNo: '002', invoiceDate: '2026-10-03' }),
    bill({ invoiceNo: '003', invoiceDate: '2026-10-02', supplierName: 'Lakshmi Dyers' }),
    bill({ invoiceNo: '004', invoiceDate: '2026-10-03', supplierName: 'Lakshmi Dyers' }),
  ];
  test("newest first, payments / returns attached per bill, Add Payment only on each supplier's latest bill", () => {
    const { invoices } = buildPurchaseHistoryData(
      bills,
      [ret({ invoiceNo: '002' })],
      [doc({ invoiceNo: '002' }), doc({ id: 'x', invoiceNo: '004' })],
    );
    expect(invoices.map((i) => i.invoiceNo)).toEqual(['004', '002', '003', '001']);
    expect(invoices.map((i) => i.canAddPayment)).toEqual([true, true, false, false]);
    expect(invoices.find((i) => i.invoiceNo === '002')).toMatchObject({
      totalReturns: 200,
      payments: [expect.objectContaining({ amount: 5000 })],
    });
    expect(invoices.find((i) => i.invoiceNo === '001')?.payments).toEqual([]);
  });
  test('"latest" is computed over all bills, so a filter never moves the Add Payment button', () => {
    const { invoices } = buildPurchaseHistoryData(bills, [], []);
    const filtered = filterInvoices(invoices, { ...EMPTY_FILTERS, search: '001' }, (i) => i.partyName);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].canAddPayment).toBe(false);
  });
  test('search matches supplier name or the stored number (including a P- prefix); recent strip = highest numbers', () => {
    const { invoices } = buildPurchaseHistoryData(
      [...bills, bill({ invoiceNo: 'P-007', invoiceDate: '2026-09-01' })],
      [],
      [],
    );
    expect(
      filterInvoices(invoices, { ...EMPTY_FILTERS, search: 'lakshmi' }, (i) => i.partyName).map(
        (i) => i.invoiceNo,
      ),
    ).toEqual(['004', '003']);
    expect(
      filterInvoices(invoices, { ...EMPTY_FILTERS, search: 'p-007' }, (i) => i.partyName).map(
        (i) => i.invoiceNo,
      ),
    ).toEqual(['P-007']);
    expect(recentInvoices(invoices, 2).map((i) => i.invoiceNo)).toEqual(['004', '003']);
  });
});
describe('labels', () => {
  test('the "P-" prefix of old bill numbers is never displayed', () => {
    expect(displayInvoiceNo(PURCHASE_LABELS, 'P-005')).toBe('005');
    expect(displayInvoiceNo(PURCHASE_LABELS, '005')).toBe('005');
    expect(PURCHASE_LABELS.party).toBe('Supplier');
    expect(PURCHASE_LABELS.statementBillLabel).toBe('Purchase Bill');
  });
});
