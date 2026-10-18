import { PURCHASE_LEDGER, computeLedger, returnsTotalsByInvoice } from '@/core/ledger';
import { buildPurchaseEditBill, purchaseEditFormFromBill } from '@/features/purchase/purchaseEdit';

const b = (no, date, subtotal, prev, paid, over = {}) => ({
  invoiceNo: no,
  invoiceDate: date,
  supplierName: 'A',
  supplierPhone: '9000000001',
  supplierAddress: '',
  products: [{ description: 'Yarn', qty: 1, rate: subtotal, amount: subtotal }],
  subtotal,
  previousBalance: prev,
  grandTotal: subtotal + prev,
  payment: { cash: paid, upi: 0, account: 0, totalPaid: paid, balanceDue: subtotal + prev - paid },
  ...over,
});

test('edit: back-dating a later bill before the first one doubles its old carried balance', () => {
  const b1 = b('001', '2026-01-01', 1000, 0, 0);
  const b2 = b('002', '2026-01-10', 500, 1000, 0);
  // edit screen loads #2 with ledger prev 1000, user changes the date only
  const form = { ...purchaseEditFormFromBill(b2, []), previousBalance: 1000, invoiceDate: '2025-12-25' };
  const saved = buildPurchaseEditBill(form);
  expect(saved.previousBalance).toBe(1000); // not recomputed for the new position
  const rows = computeLedger([b1, saved], PURCHASE_LEDGER);
  const last = rows[rows.length - 1];
  // true owed = 1500 (1000 + 500); ledger says:
  console.log('closing after back-date', last.closingBalance);
  expect(last.closingBalance).toBe(2500);
});

test('edit: moving a bill to a brand-new supplier carries the old supplier balance as the anchor', () => {
  const b2 = b('002', '2026-01-10', 500, 1000, 0);
  const form = {
    ...purchaseEditFormFromBill(b2, []),
    previousBalance: 1000,
    supplierPhone: '9000000002',
    supplierName: 'B',
  };
  const saved = buildPurchaseEditBill(form);
  const rows = computeLedger([saved], PURCHASE_LEDGER);
  console.log('B closing', rows[0].closingBalance);
  expect(rows[0].closingBalance).toBe(1500); // B really owes 500
});

test('refund-settled return still reduces the carried balance', () => {
  const b1 = b('001', '2026-01-01', 1000, 0, 1000); // fully paid
  const returns = [{ invoiceNo: '001', returnAmount: 200, settlementType: 'refund', refundMethod: 'cash' }];
  const rows = computeLedger([b1], PURCHASE_LEDGER, { returnsByInvoice: returnsTotalsByInvoice(returns) });
  console.log('closing with refund', rows[0].closingBalance);
  expect(rows[0].closingBalance).toBe(-200); // supplier already refunded the 200 in cash -> should be 0
});
