/**
 * Edit Purchase Bill — port of js/edit-purchase.js (loadPurchaseBill + the Update button handler).
 * UI-free so the screen and the tests share it.
 */
import { buildProductLines, calculateSupplierPreviousBalanceAtTime, rowAmount } from '@/core/billing';
import { db } from '@/core/db';
import { toNum } from '@/core/format';
import { PURCHASE_LEDGER, sameParty } from '@/core/ledger';
import { foldPurchasePayment, PAYMENT_METHODS, sumByMethod } from '@/core/paymentMethods';
import { round2 } from './money';
/** `{ cash, account }` of payment documents: legacy UPI / GPAY / BANK count as Account, anything else (or nothing) as Cash. */
export function initialPaymentBreakdown(payments) {
  return sumByMethod(payments);
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
/**
 * What was paid when the bill was written, for a bill without 'initial' payment documents (older bills): the nested
 * split, or the top-level paid total minus the payment documents. History shows this payment, so the edit form must
 * too — otherwise Update erased it (raising this and every later balance).
 */
function untrackedInitialSplit(bill, payments) {
  if (bill.payment && typeof bill.payment === 'object') {
    // a legacy `upi` amount is Account money
    const { cash, account } = foldPurchasePayment(bill.payment);
    return { cash, account };
  }
  const documents = payments.reduce((sum, p) => sum + toNum(p.amount), 0);
  return { cash: Math.max(0, toNum(bill.amountPaid) - documents), account: 0 };
}
/** Turns a stored bill + its payments into the editable form (the web filled the same inputs; zeros show blank). */
export function purchaseEditFormFromBill(bill, payments) {
  const split = splitPurchasePayments(payments);
  const { additionalTotal } = split;
  const hasInitialDocs = payments.some((p) => p.paymentType === 'initial');
  const initial = hasInitialDocs ? split.initial : untrackedInitialSplit(bill, payments);
  const products = bill.products ?? [];
  return {
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    supplierPhone: bill.supplierPhone || '',
    supplierName: bill.supplierName || '',
    supplierAddress: bill.supplierAddress || '',
    rows: products.length
      ? products.map((p) => ({
          description: p.description,
          // older lines have no roll count: the box stays blank
          rolls: toNum(p.rolls) ? String(p.rolls) : '',
          qty: String(p.qty),
          rate: String(p.rate),
        }))
      : [{ description: '', rolls: '', qty: '0', rate: '0' }],
    previousBalance: bill.previousBalance || 0,
    manualPreviousBalance: bill.manualPreviousBalance !== undefined ? String(bill.manualPreviousBalance) : '',
    // history/PDF read `discountAmount || discount`, so older bills may only carry the former
    discountAmount: amountText(toNum(bill.discount) || toNum(bill.discountAmount)),
    cash: amountText(initial.cash),
    account: amountText(initial.account),
    // the bank the Account money went through (kept on re-save so per-bank balances do not move)
    bankAccountId: bill.bankAccountId || bill.payment?.bankAccountId || '',
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
    calculateSupplierPreviousBalanceAtTime(
      bill.supplierName,
      bill.supplierPhone,
      bill.invoiceNo,
      bill.invoiceDate,
    ),
  ]);
  const form = purchaseEditFormFromBill(bill, payments);
  if (carried.failed) return { bill, form };
  return { bill, form: { ...form, previousBalance: round2(carried.balanceCarriedForward) } };
}
/**
 * Totals exactly as the edit page's updateCalculations() shows (and later saves) them: every row amount, the subtotal
 * and each total pass through `toFixed(2)`, previous balance is the 2-decimal displayed value and payments added later
 * count as paid. (The web floored the grand total at zero, losing a supplier credit; it is kept now, like sales.)
 */
export function purchaseEditTotals(form) {
  const subtotal = round2(form.rows.reduce((sum, r) => sum + round2(rowAmount(r.qty, r.rate)), 0));
  const grandTotal =
    subtotal + round2(form.previousBalance) + toNum(form.manualPreviousBalance) - toNum(form.discountAmount);
  const totalPaid = toNum(form.cash) + toNum(form.account) + form.additionalPaymentsTotal;
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
 *  - `payment.totalPaid` includes payments added later, while `payment.cash/account` only hold the 'initial' split
 *    (a legacy `upi` amount was folded into `account` when the form was loaded, so it is not written back)
 *  - `bankAccountId` (top-level, only when set, and nested) is written like the create screen does
 *  - previousBalance is the form's (read from the supplier's ledger when the bill was opened); the ledger sync after
 *    the save corrects it if the bill moved in the chain
 */
export function buildPurchaseEditBill(form) {
  const t = purchaseEditTotals(form);
  // purchase.js stores line items without `sno`
  const products = buildProductLines(form.rows, { requirePositiveQty: true }).map(
    ({ description, qty, rolls, rate, amount }) => ({
      description,
      qty,
      rolls,
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
    ...(form.bankAccountId ? { bankAccountId: form.bankAccountId } : {}),
    payment: {
      cash: toNum(form.cash),
      account: toNum(form.account),
      bankAccountId: form.bankAccountId || null,
      totalPaid: t.totalPaid,
      balanceDue: t.balanceDue,
    },
    amountPaid: t.totalPaid,
    balanceDue: t.balanceDue,
  };
}
/**
 * Update button: overwrite the bill, replace its 'initial' payment documents (direct delete — legacy `_initial_upi`
 * ones too — + one record per non-zero method, dated the invoice date and carrying the bill's bank like the create
 * screen) and refresh the supplier record. Clearing old payments / saving the supplier are non-fatal, as on the web. Finally the supplier's ledger is re-synced so every later bill carries the new balance
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
      PAYMENT_METHODS.filter((method) => pay[method] > 0).map((method) =>
        db.savePurchasePayment({
          id: `purchase_payment_${bill.invoiceNo}_initial_${method}`,
          invoiceNo: bill.invoiceNo,
          paymentDate: bill.invoiceDate,
          amount: pay[method],
          paymentMethod: method,
          paymentType: 'initial',
          ...(pay.bankAccountId ? { bankAccountId: pay.bankAccountId } : {}),
        }),
      ),
    );
  }
  if (bill.supplierPhone) {
    try {
      await db.saveSupplier(
        {
          phone: bill.supplierPhone,
          name: bill.supplierName,
          address: bill.supplierAddress,
          lastUpdated: new Date().toISOString(),
        },
        { merge: true },
      );
    } catch (error) {
      console.error('Error saving supplier details:', error);
    }
  }
  await db.syncPurchaseLedger(bill, { changedNo: bill.invoiceNo, before });
  if (before && !sameParty(PURCHASE_LEDGER, before, bill)) {
    await db.syncPurchaseLedger(before, { before });
  }
  return bill;
}
