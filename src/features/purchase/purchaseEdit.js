/**
 * Edit Purchase Bill — port of js/edit-purchase.js (loadPurchaseBill + the Update button handler).
 * UI-free so the screen and the tests share it.
 */
import { buildProductLines, calculateSupplierPreviousBalanceAtTime, rowAmount } from '@/core/billing';
import { db } from '@/core/db';
import { toNum } from '@/core/format';
import { PURCHASE_LEDGER, partyMatcher } from '@/core/ledger';
import { round2 } from './money';
/** edit-purchase.js: GPAY counts as UPI, BANK as ACCOUNT, anything else (or nothing) as CASH. */
export function initialPaymentBreakdown(payments) {
  return payments.reduce(
    (acc, p) => {
      const method = String(p.paymentMethod || 'CASH').toUpperCase();
      if (method === 'UPI' || method === 'GPAY') acc.upi += toNum(p.amount);
      else if (method === 'ACCOUNT' || method === 'BANK') acc.account += toNum(p.amount);
      else acc.cash += toNum(p.amount);
      return acc;
    },
    { cash: 0, upi: 0, account: 0 },
  );
}
/** Splits stored payments into the editable 'initial' split and the total of everything added later. */
export function splitPurchasePayments(payments) {
  const isInitial = (p) => p.paymentType === 'initial';
  return {
    initial: initialPaymentBreakdown(payments.filter(isInitial)),
    additionalTotal: payments.filter((p) => !isInitial(p)).reduce((sum, p) => sum + toNum(p.amount), 0),
  };
}
const amountText = (n) => (n ? String(n) : '');
/** Turns a stored bill + its payments into the editable form (the web filled the same inputs; zeros show blank). */
export function purchaseEditFormFromBill(bill, payments) {
  const { initial, additionalTotal } = splitPurchasePayments(payments);
  const products = bill.products ?? [];
  return {
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    supplierPhone: bill.supplierPhone || '',
    supplierName: bill.supplierName || '',
    supplierAddress: bill.supplierAddress || '',
    rows: products.length
      ? products.map((p) => ({ description: p.description, qty: String(p.qty), rate: String(p.rate) }))
      : [{ description: '', qty: '0', rate: '0' }],
    previousBalance: bill.previousBalance || 0,
    manualPreviousBalance: bill.manualPreviousBalance !== undefined ? String(bill.manualPreviousBalance) : '',
    // history/PDF read `discountAmount || discount`, so older bills may only carry the former
    discountAmount: amountText(toNum(bill.discount) || toNum(bill.discountAmount)),
    cash: amountText(initial.cash),
    upi: amountText(initial.upi),
    account: amountText(initial.account),
    additionalPaymentsTotal: additionalTotal,
  };
}
/** PARITY NOTE: the web displayed (and re-saved under) a "cleaned" number — 'P-' stripped, zero-padded to 3 digits — which
 *  wrote a NEW document for e.g. 'P-5' or '5' and left the original behind. The stored number is used as-is here.
 *  The previous balance is re-read from the supplier's ledger (the stored one may predate changes to earlier bills). */
export async function loadPurchaseForEdit(invoiceNo) {
  const bill = await db.getPurchaseBill(invoiceNo);
  if (!bill) return null;
  const [payments, carried] = await Promise.all([
    db.getPurchasePaymentsByInvoice(bill.invoiceNo),
    calculateSupplierPreviousBalanceAtTime(bill.supplierName, bill.supplierPhone, bill.invoiceNo, bill.invoiceDate),
  ]);
  const form = purchaseEditFormFromBill(bill, payments);
  if (carried.failed) return { bill, form };
  return { bill, form: { ...form, previousBalance: round2(carried.balanceCarriedForward) } };
}
/**
 * Totals exactly as the edit page's updateCalculations() shows (and later saves) them: every row amount, the subtotal
 * and each total pass through `toFixed(2)`, previous balance is the 2-decimal displayed value, grand total never goes
 * below zero and payments added later count as paid.
 */
export function purchaseEditTotals(form) {
  const subtotal = round2(form.rows.reduce((sum, r) => sum + round2(rowAmount(r.qty, r.rate)), 0));
  const rawGrand =
    subtotal + round2(form.previousBalance) + toNum(form.manualPreviousBalance) - toNum(form.discountAmount);
  const grandTotal = rawGrand < 0 ? 0 : rawGrand;
  const totalPaid = toNum(form.cash) + toNum(form.upi) + toNum(form.account) + form.additionalPaymentsTotal;
  return {
    subtotal,
    grandTotal: round2(grandTotal),
    totalPaid: round2(totalPaid),
    balanceDue: round2(grandTotal - totalPaid),
  };
}
/**
 * The document the Update button wrote. Compared with purchase.js (create):
 *  - adds TOP-LEVEL `amountPaid` and `balanceDue` (create only has the nested `payment` object)
 *  - `payment.totalPaid` includes payments added later, while `payment.cash/upi/account` only hold the 'initial' split
 *  - previousBalance is NOT recalculated, the stored value is kept
 */
export function buildPurchaseEditBill(form) {
  const t = purchaseEditTotals(form);
  // purchase.js stores line items without `sno`
  const products = buildProductLines(form.rows, { requirePositiveQty: true }).map(
    ({ description, qty, rate, amount }) => ({
      description,
      qty,
      rate,
      amount,
    }),
  );
  return {
    invoiceNo: form.invoiceNo.trim(),
    invoiceDate: form.invoiceDate,
    supplierPhone: form.supplierPhone.trim(),
    supplierName: form.supplierName.trim(),
    supplierAddress: form.supplierAddress.trim(),
    products,
    subtotal: t.subtotal,
    previousBalance: round2(form.previousBalance),
    manualPreviousBalance: toNum(form.manualPreviousBalance),
    discount: toNum(form.discountAmount),
    grandTotal: t.grandTotal,
    payment: {
      cash: toNum(form.cash),
      upi: toNum(form.upi),
      account: toNum(form.account),
      totalPaid: t.totalPaid,
      balanceDue: t.balanceDue,
    },
    amountPaid: t.totalPaid,
    balanceDue: t.balanceDue,
  };
}
/**
 * Update button: overwrite the bill, replace its 'initial' payment documents (direct delete + one record per non-zero
 * method, dated the invoice date) and refresh the supplier record. Clearing old payments / saving the supplier are
 * non-fatal, as on the web. Finally the supplier's ledger is re-synced so every later bill carries the new balance
 * (and the old supplier's, if the bill was moved to another supplier).
 */
export async function savePurchaseEdit(form) {
  const bill = buildPurchaseEditBill(form);
  const before = await db.getPurchaseBill(bill.invoiceNo).catch(() => null);
  await db.savePurchaseBill(bill);
  try {
    const existing = await db.getPurchasePaymentsByInvoice(bill.invoiceNo);
    const initial = existing.filter((p) => p.paymentType === 'initial');
    await Promise.all(initial.map((p) => db.deletePurchasePaymentDoc(p.id)));
  } catch (error) {
    console.error('Error clearing old initial payments:', error);
  }
  const pay = bill.payment;
  if (pay.totalPaid > 0) {
    await Promise.all(
      ['cash', 'upi', 'account']
        .filter((method) => pay[method] > 0)
        .map((method) =>
          db.savePurchasePayment({
            id: `purchase_payment_${bill.invoiceNo}_initial_${method}`,
            invoiceNo: bill.invoiceNo,
            paymentDate: bill.invoiceDate,
            amount: pay[method],
            paymentMethod: method,
            paymentType: 'initial',
          }),
        ),
    );
  }
  if (bill.supplierPhone) {
    try {
      await db.saveSupplier({
        phone: bill.supplierPhone,
        name: bill.supplierName,
        address: bill.supplierAddress,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error saving supplier details:', error);
    }
  }
  await db.syncPurchaseLedger(bill);
  if (before && !partyMatcher(PURCHASE_LEDGER, bill.supplierName, bill.supplierPhone)(before)) {
    await db.syncPurchaseLedger(before, { removed: before });
  }
  return bill;
}
