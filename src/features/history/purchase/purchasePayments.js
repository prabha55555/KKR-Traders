/**
 * Purchase payments from the history screen: add (cash / account split), view, undo one, undo all.
 * Field updates follow the LIVE versions in purchase-history.js (the later declarations of addPayment,
 * viewPaymentHistory, undoPayment and undoAllPayments), keeping the nested `payment` object and the top-level
 * `amountPaid` / `balanceDue` / `paymentBreakdown` of the bill in sync. A legacy `upi` amount in either split is folded
 * into Account whenever that split is rewritten (never counted twice, never left behind).
 */
import { purchaseAmountPaid } from '@/core/billing';
import { db } from '@/core/db';
import { formatCurrency, todayISO, toNum } from '@/core/format';
import { roundMoney } from '@/core/ledger';
import { foldBreakdown, foldPurchasePayment, normalizeMethod } from '@/core/paymentMethods';
import { paymentTimestamp, totalOf } from '../lib/payments';
import { userError } from '../lib/types';
import { toHistoryPayment } from '../sales/salesModel';
import { buildAdditionalPaymentRecords, findPayment } from '../sales/salesPayments';
export const FAKE_INITIAL_PREFIX = 'fake_initial_';
export const PURCHASE_BILL_NOT_FOUND = 'Purchase bill not found!';
const ZERO = { cash: 0, account: 0 };
export const purchasePaymentSuccessMessage = (amounts) =>
  `Payment of ₹${formatCurrency(totalOf(amounts))} added successfully!`;
// ------------------------------------------------------------------ initial payment that has no payment document
/**
 * What was paid when the bill was written: the nested cash / account split (plus a legacy upi amount), or — for old
 * bills without a nested `payment` object — the stored paid total.
 *
 * Deviation: for such old bills the web took the whole top-level `amountPaid`, which already contains payments added
 * later, so those were counted twice. Their documents are subtracted here.
 */
export function initialPaidAmount(bill, payments = []) {
  if (bill.payment) return toNum(bill.payment.cash) + toNum(bill.payment.upi) + toNum(bill.payment.account);
  const documents = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  return Math.max(0, (bill.amountPaid || 0) - documents);
}
export const fakeInitialPaymentId = (invoiceNo) => `${FAKE_INITIAL_PREFIX}${invoiceNo}`;
/**
 * viewPaymentHistory() / generatePurchasePaymentTableData(): a bill that was paid when it was written but has no
 * 'initial' payment document (old bills) still shows that payment, as a synthetic record dated the bill date. Its
 * method is Account when the nested split has an account (or legacy UPI) amount, else cash. Returns the list
 * unchanged otherwise.
 */
export function withUntrackedInitialPayment(bill, payments) {
  const amount = initialPaidAmount(bill, payments);
  if (amount <= 0 || payments.some((p) => p.paymentType === 'initial')) return [...payments];
  const nested = foldBreakdown(bill.payment);
  // no split stored: an older bill paid by one method (legacy 'upi' / 'account' = Account)
  const paymentMethod = nested
    ? nested.account > 0
      ? 'account'
      : 'cash'
    : normalizeMethod(bill.paymentMethod);
  const synthetic = {
    id: fakeInitialPaymentId(bill.invoiceNo),
    paymentDate: bill.invoiceDate || todayISO(),
    amount,
    paymentMethod,
    bankAccountId: bill.bankAccountId || bill.payment?.bankAccountId || undefined,
    paymentType: 'initial',
  };
  return [synthetic, ...payments];
}
/** The payments the statements print: the synthetic initial one is only added when the bill has payment records. */
export function statementPayments(bill, payments) {
  return payments.length > 0 ? withUntrackedInitialPayment(bill, payments) : [];
}
// ------------------------------------------------------------------ add
/**
 * The bill after an additional payment (addPayment): `amountPaid` grows (top-level first, then `payment.totalPaid`),
 * `balanceDue = grandTotal - amountPaid`, the cash / account breakdown grows per method, and the nested
 * `payment.totalPaid/balanceDue` follow. The nested cash / account split stays the INITIAL split (folded).
 *
 * PARITY NOTE: the stored `adjustedBalanceDue` is NOT refreshed (the web did not either); the screens derive it
 * from the returns collection.
 */
export function applyAdditionalPurchasePayment(bill, amounts) {
  const current = foldBreakdown(bill.paymentBreakdown) ?? ZERO;
  const added = foldBreakdown(amounts);
  const newAmountPaid = roundMoney(toNum(bill.amountPaid || bill.payment?.totalPaid || 0) + totalOf(amounts));
  const balanceDue = roundMoney(toNum(bill.grandTotal) - newAmountPaid);
  // the bill keeps the bank of the money paid WITH it; the new payment's bank goes on its own payment record (taking it
  // here made the next edit move the first payment to the later bank)
  const bankAccountId =
    bill.bankAccountId || bill.payment?.bankAccountId || amounts.bankAccountId || undefined;
  const updated = {
    ...bill,
    amountPaid: newAmountPaid,
    balanceDue,
    paymentBreakdown: {
      cash: current.cash + added.cash,
      account: current.account + added.account,
    },
    ...(bill.payment
      ? {
          payment: {
            ...foldPurchasePayment(bill.payment),
            totalPaid: newAmountPaid,
            balanceDue,
            ...(bankAccountId ? { bankAccountId } : {}),
          },
        }
      : {}),
  };
  if (bankAccountId) {
    updated.bankAccountId = bankAccountId;
  }
  return updated;
}
/**
 * Saves the bill first, then one payment document per method with an amount, then re-syncs the supplier's ledger so
 * the later bills' previous balance follows. `dateInput` is the picked day (YYYY-MM-DD); the current time is appended.
 */
export async function addPurchasePayment(invoiceNo, amounts, dateInput, now = new Date()) {
  const bill = await db.getPurchaseBill(invoiceNo);
  if (!bill) throw userError(PURCHASE_BILL_NOT_FOUND);
  await db.savePurchaseBill(applyAdditionalPurchasePayment(bill, amounts));
  for (const record of buildAdditionalPaymentRecords(invoiceNo, amounts, paymentTimestamp(dateInput, now))) {
    await db.savePurchasePayment(record);
  }
  await db.syncPurchaseLedger(bill);
}
/** viewPaymentHistory(): the bill's payment documents plus the synthetic initial payment of old bills. */
export async function loadPurchasePaymentHistory(invoiceNo) {
  const [documents, bill] = await Promise.all([
    db.getPurchasePaymentsByInvoice(invoiceNo),
    db.getPurchaseBill(invoiceNo),
  ]);
  if (!bill) throw userError(PURCHASE_BILL_NOT_FOUND);
  const bankAccountId = bill.bankAccountId || bill.payment?.bankAccountId;
  return {
    bill,
    payments: withUntrackedInitialPayment(
      bill,
      documents.map((p) => toHistoryPayment(p, bankAccountId)),
    ),
  };
}
// ------------------------------------------------------------------ undo
/**
 * The bill after undoing the payment that was written with the bill but has no document ("fake initial"): the nested
 * split is cleared and its amount leaves `amountPaid` / `payment.totalPaid` and returns to the balances.
 *
 * Deviation: the web did `(amountPaid || 0) - amount` on the TOP-LEVEL fields, which do not exist on bills that only
 * carry the nested object — the bill ended up with a negative `amountPaid`. The hybrid paid total is used instead
 * (identical results for bills where both representations exist) and never goes below 0.
 */
export function applyUndoInitialPayment(bill, initialAmount) {
  const newAmountPaid = Math.max(0, purchaseAmountPaid(bill) - initialAmount);
  const balanceDue = bill.grandTotal - newAmountPaid;
  return {
    amountPaid: newAmountPaid,
    balanceDue,
    ...(bill.payment
      ? {
          payment: {
            ...foldPurchasePayment(bill.payment),
            cash: 0,
            account: 0,
            totalPaid: newAmountPaid,
            balanceDue,
          },
        }
      : {}),
  };
}
/**
 * The bill after "undo all payments": nothing paid, balance = grand total, split and breakdown zeroed.
 *
 * Deviation: after deleting the payment documents (which already lower `payment.totalPaid`) the web subtracted the
 * nested initial split a SECOND time, leaving e.g. amountPaid -5000 / balanceDue 13000 on an 8000 bill whenever an
 * 'initial' document existed. The end state the web intended ("everything undone") is written directly.
 */
export function applyUndoAllPurchasePayments(bill) {
  return {
    amountPaid: 0,
    balanceDue: bill.grandTotal,
    ...(bill.payment
      ? {
          payment: {
            ...foldPurchasePayment(bill.payment),
            cash: 0,
            account: 0,
            totalPaid: 0,
            balanceDue: bill.grandTotal,
          },
        }
      : {}),
    ...(bill.paymentBreakdown ? { paymentBreakdown: { ...ZERO } } : {}),
  };
}
/**
 * After an 'initial' payment DOCUMENT is deleted the nested split must forget it too, otherwise the bill looks like it
 * still has an untracked initial payment and a second "undo" would take the amount off a second time.
 * (Not in the web, which hit exactly that.) The split is folded first, so undoing a legacy initial UPI document takes
 * it off Account and no `upi` amount is left to conjure a phantom initial payment.
 */
async function forgetInitialInSplit(invoiceNo, deleted) {
  const bill = await db.getPurchaseBill(invoiceNo);
  if (!bill?.payment) return;
  const key = normalizeMethod(deleted.paymentMethod);
  const folded = foldPurchasePayment(bill.payment);
  const payment = { ...folded, [key]: Math.max(0, folded[key] - deleted.amount) };
  await db.updatePurchaseBillFields(invoiceNo, { payment });
}
/**
 * Undo one payment. A payment document goes through `db.deletePurchasePayment`, which removes it and lowers
 * `amountPaid` / `balanceDue` / `payment.totalPaid` and the deleted payment's own method in the (folded) breakdown;
 * the synthetic initial payment is reverted on the bill itself.
 */
export async function undoPurchasePayment(invoiceNo, paymentId) {
  if (paymentId.startsWith(FAKE_INITIAL_PREFIX)) {
    const [bill, documents] = await Promise.all([
      db.getPurchaseBill(invoiceNo),
      db.getPurchasePaymentsByInvoice(invoiceNo),
    ]);
    if (!bill) throw userError(PURCHASE_BILL_NOT_FOUND);
    await db.updatePurchaseBillFields(
      invoiceNo,
      applyUndoInitialPayment(bill, initialPaidAmount(bill, documents)),
    );
    await db.syncPurchaseLedger(bill);
    return { initialWithoutDocument: true };
  }
  const documents = await db.getPurchasePaymentsByInvoice(invoiceNo);
  const payment = findPayment(documents, paymentId);
  if (!payment) throw userError('Payment not found!');
  // db.deletePurchasePayment re-syncs the supplier's ledger itself
  await db.deletePurchasePayment(payment.id);
  if (payment.paymentType === 'initial') await forgetInitialInSplit(invoiceNo, payment);
  return { initialWithoutDocument: false };
}
/**
 * Undo every payment: each document goes through `db.deletePurchasePayment`, then the bill is reset to "nothing paid"
 * (see applyUndoAllPurchasePayments). Returns null when the bill has no payments at all.
 */
export async function undoAllPurchasePayments(invoiceNo) {
  const [documents, bill] = await Promise.all([
    db.getPurchasePaymentsByInvoice(invoiceNo),
    db.getPurchaseBill(invoiceNo),
  ]);
  if (!bill) throw userError(PURCHASE_BILL_NOT_FOUND);
  const untracked = withUntrackedInitialPayment(bill, documents.map(toHistoryPayment));
  if (untracked.length === 0) return null;
  // one ledger sync at the end instead of one per payment
  for (const payment of documents) await db.deletePurchasePayment(payment.id, { syncLedger: false });
  // re-read: the deletions above saved the bill (and dropped the cache) — never write back the snapshot from before
  const fresh = await db.getPurchaseBill(invoiceNo);
  if (!fresh) throw userError(PURCHASE_BILL_NOT_FOUND);
  await db.updatePurchaseBillFields(invoiceNo, applyUndoAllPurchasePayments(fresh));
  await db.syncPurchaseLedger(fresh);
  return { count: untracked.length, total: untracked.reduce((sum, p) => sum + p.amount, 0) };
}
