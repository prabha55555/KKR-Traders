/**
 * Sales payments from the history screen: add (cash / account split), undo one, undo all.
 * Field updates are ported from invoice-history.js addPayment / undoPayment / undoAllPayments. A stored split may still
 * carry a legacy `upi` amount: it is folded into Account whenever the split is rewritten (never counted twice).
 */
import { db } from '@/core/db';
import { updateSubsequentInvoices } from '@/core/billing';
import { toNum } from '@/core/format';
import { roundMoney } from '@/core/ledger';
import { foldBreakdown } from '@/core/paymentMethods';
import { sumPaymentAmounts } from '../lib/lookups';
import { paymentTimestamp, totalOf } from '../lib/payments';
import { userError } from '../lib/types';
/**
 * The invoice after an additional payment: amountPaid grows, balanceDue = grandTotal - amountPaid and the
 * cash / account breakdown grows per method (a legacy `upi` amount is folded into account and its key dropped).
 *
 * PARITY NOTE: the stored `adjustedBalanceDue` is NOT refreshed here (the web did not either). The screens derive
 * the adjusted balance from the returns, so they stay correct; only readers of the stored field see an older value.
 */
export function applyAdditionalPayment(invoice, amounts) {
  const current = foldBreakdown(invoice.paymentBreakdown) ?? { cash: 0, account: 0 };
  const added = foldBreakdown(amounts);
  // a legacy bill without `amountPaid`: derive it like the ledger does (grandTotal - balanceDue)
  const hasPaid =
    invoice.amountPaid !== undefined && invoice.amountPaid !== null && invoice.amountPaid !== '';
  const paidBefore = hasPaid
    ? toNum(invoice.amountPaid)
    : toNum(invoice.grandTotal) - toNum(invoice.balanceDue);
  const newAmountPaid = roundMoney(paidBefore + totalOf(amounts));
  const updated = {
    ...invoice,
    amountPaid: newAmountPaid,
    balanceDue: roundMoney(toNum(invoice.grandTotal) - newAmountPaid),
    paymentBreakdown: {
      cash: current.cash + added.cash,
      account: current.account + added.account,
    },
  };
  // the bill keeps the bank of the money taken at the sale; a later payment's bank is on its own payment record
  if (amounts.bankAccountId && !invoice.bankAccountId) {
    updated.bankAccountId = amounts.bankAccountId;
  }
  return updated;
}
/**
 * One payment document per method with an amount (order cash, account), paymentType 'additional'. The bank account
 * goes on the Account document only (a cash payment never touches a bank).
 */
export function buildAdditionalPaymentRecords(invoiceNo, amounts, paymentDate) {
  const split = foldBreakdown(amounts);
  return ['cash', 'account']
    .filter((method) => split[method] > 0)
    .map((method) => {
      const rec = {
        invoiceNo,
        paymentDate,
        amount: split[method],
        paymentMethod: method,
        paymentType: 'additional',
      };
      if (method === 'account' && amounts.bankAccountId) {
        rec.bankAccountId = amounts.bankAccountId;
      }
      return rec;
    });
}
/**
 * The invoice after "undo all payments": nothing paid, balance = grandTotal, breakdown zeroed.
 * PARITY NOTE: like the web, `adjustedBalanceDue` is left as it was (see applyAdditionalPayment).
 */
export function applyUndoAllPayments(invoice) {
  return {
    ...invoice,
    amountPaid: 0,
    balanceDue: invoice.grandTotal,
    paymentBreakdown: { cash: 0, account: 0 },
  };
}
/**
 * Saves the invoice update first, then one payment record per method, then re-computes the customer's later invoices.
 * `dateInput` is the picked day (YYYY-MM-DD); the current time is appended to it.
 */
export async function addSalesPayment(invoiceNo, amounts, dateInput, now = new Date()) {
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) throw userError('Invoice not found!');
  await db.saveInvoice(applyAdditionalPayment(invoice, amounts));
  for (const record of buildAdditionalPaymentRecords(invoiceNo, amounts, paymentTimestamp(dateInput, now))) {
    await db.savePayment(record);
  }
  await updateSubsequentInvoices(invoice.customerName, invoiceNo);
}
/** Finds a payment by id the way the web did (exact, then without a "payment_" prefix). */
export function findPayment(payments, paymentId) {
  return (
    payments.find((p) => p.id === paymentId) ??
    payments.find((p) => p.id === paymentId.replace('payment_', ''))
  );
}
/**
 * Undo one payment. `db.deletePayment` removes the payment document and then lowers amountPaid, recomputes balanceDue,
 * takes the amount off the deleted payment's own method in the (folded) cash / account split and re-computes later
 * invoices (db.updateInvoiceAfterPaymentDeletion).
 */
export async function undoSalesPayment(invoiceNo, paymentId) {
  const payments = await db.getPaymentsByInvoice(invoiceNo);
  const payment = findPayment(payments, paymentId);
  if (!payment) {
    throw userError(
      `Payment not found! Looking for ID: ${paymentId}. Available IDs: ${payments.map((p) => p.id).join(', ')}`,
    );
  }
  await db.deletePayment(payment.id);
  return payment;
}
/**
 * Undo every payment: the invoice snapshot is read BEFORE the deletions, each payment goes through
 * `db.deletePayment`, then the snapshot is saved with nothing paid and the later invoices are re-computed.
 * Returns null when the invoice has no payments.
 */
export async function undoAllSalesPayments(invoiceNo) {
  const payments = await db.getPaymentsByInvoice(invoiceNo);
  if (payments.length === 0) return null;
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) throw userError('Invoice not found!');
  const total = sumPaymentAmounts(payments);
  // one ledger sync at the end instead of one per payment
  for (const payment of payments) await db.deletePayment(payment.id, { syncLedger: false });
  await db.saveInvoice(applyUndoAllPayments(invoice));
  await updateSubsequentInvoices(invoice.customerName, invoiceNo);
  return { count: payments.length, total };
}
