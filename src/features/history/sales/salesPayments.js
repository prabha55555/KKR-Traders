/**
 * Sales payments from the history screen: add (cash/UPI/account split), undo one, undo all.
 * Field updates are ported exactly from invoice-history.js addPayment / undoPayment / undoAllPayments.
 */
import { db } from '@/core/db';
import { updateSubsequentInvoices } from '@/core/billing';
import { sumPaymentAmounts } from '../lib/lookups';
import { paymentTimestamp, totalOf } from '../lib/payments';
import { userError } from '../lib/types';
/**
 * The invoice after an additional payment: amountPaid grows, balanceDue = grandTotal - amountPaid and the
 * cash/upi/account breakdown grows per method.
 *
 * PARITY NOTE: the stored `adjustedBalanceDue` is NOT refreshed here (the web did not either). The screens derive
 * the adjusted balance from the returns, so they stay correct; only readers of the stored field see an older value.
 */
export function applyAdditionalPayment(invoice, amounts) {
  const current = invoice.paymentBreakdown ?? { cash: 0, upi: 0, account: 0 };
  const newAmountPaid = invoice.amountPaid + totalOf(amounts);
  const updated = {
    ...invoice,
    amountPaid: newAmountPaid,
    balanceDue: invoice.grandTotal - newAmountPaid,
    paymentBreakdown: {
      cash: (current.cash || 0) + amounts.cash,
      upi: (current.upi || 0) + amounts.upi,
      account: (current.account || 0) + amounts.account,
    },
  };
  if (amounts.bankAccountId) {
    updated.bankAccountId = amounts.bankAccountId;
  }
  return updated;
}
/** One payment document per method with an amount (order cash, upi, account), paymentType 'additional'. */
export function buildAdditionalPaymentRecords(invoiceNo, amounts, paymentDate) {
  return ['cash', 'upi', 'account']
    .filter((method) => amounts[method] > 0)
    .map((method) => {
      const rec = {
        invoiceNo,
        paymentDate,
        amount: amounts[method],
        paymentMethod: method,
        paymentType: 'additional',
      };
      if (amounts.bankAccountId) {
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
    paymentBreakdown: { cash: 0, upi: 0, account: 0 },
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
 * Undo one payment. `db.deletePayment` removes the payment document and then lowers amountPaid, recomputes balanceDue
 * and re-computes later invoices (db.updateInvoiceAfterPaymentDeletion) — the web page relied on exactly that.
 *
 * PARITY NOTE: db.updateInvoiceAfterPaymentDeletion takes the amount off the breakdown entry named by the invoice's
 * legacy `paymentMethod` (default 'cash'), not the undone payment's own method. Undoing a UPI/account payment
 * therefore leaves paymentBreakdown.upi/account too high and cash too low (floored at 0); amountPaid/balanceDue are right.
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
  for (const payment of payments) await db.deletePayment(payment.id);
  await db.saveInvoice(applyUndoAllPayments(invoice));
  await updateSubsequentInvoices(invoice.customerName, invoiceNo);
  return { count: payments.length, total };
}
