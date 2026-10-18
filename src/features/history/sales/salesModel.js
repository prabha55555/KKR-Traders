/** Adapts Firestore sales documents to the generic history view-model (`../lib/types`). */
import { toNum } from '@/core/format';
import { compareNewestFirst } from '../lib/filters';
import { indexByInvoiceNo, latestInvoiceNoPerParty, sumReturnAmounts } from '../lib/lookups';
export function toHistoryPayment(p, defaultBankAccountId) {
  return {
    id: p.id,
    // older documents stored the day under `date`
    paymentDate: p.paymentDate || p.date || '',
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    paymentType: p.paymentType,
    bankAccountId:
      p.bankAccountId || p.account || p.sourceAccount || p.destinationAccount || defaultBankAccountId,
    note: p.note,
  };
}
export function toHistoryReturn(r, defaultBankAccountId) {
  return {
    id: r.id,
    returnDate: r.returnDate || r.date || '',
    description: r.description,
    qty: r.qty,
    rate: r.rate,
    returnAmount: r.returnAmount,
    reason: r.reason,
    settlementType: r.settlementType,
    refundMethod: r.refundMethod,
    bankAccountId: r.bankAccountId || defaultBankAccountId,
  };
}
/**
 * One invoice with its (already looked-up) payments and returns.
 * Figures match the web page: previous balance = previousBalance + manualPreviousBalance, adjusted balance =
 * balanceDue - returns (derived from the returns collection, not the stored `adjustedBalanceDue`).
 */
export function toHistoryInvoice(invoice, payments, returns, canAddPayment) {
  const totalReturns = sumReturnAmounts(returns);
  return {
    invoiceNo: invoice.invoiceNo,
    invoiceDate: invoice.invoiceDate,
    partyName: invoice.customerName,
    partyPhone: invoice.customerPhone,
    partyAddress: invoice.customerAddress,
    products: invoice.products ?? [],
    subtotal: invoice.subtotal,
    previousBalance: (invoice.previousBalance || 0) + (invoice.manualPreviousBalance || 0),
    // `discount` is the legacy field name; the statements already honoured it
    discountAmount: toNum(invoice.discountAmount) || toNum(invoice.discount),
    grandTotal: invoice.grandTotal,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
    paymentBreakdown: invoice.paymentBreakdown,
    legacyPaymentMethod: invoice.paymentMethod || undefined,
    bankAccountId: invoice.bankAccountId,
    payments: payments.map((p) => toHistoryPayment(p, invoice.bankAccountId)),
    returns: returns.map((r) => toHistoryReturn(r, invoice.bankAccountId)),
    totalReturns,
    adjustedBalanceDue: invoice.balanceDue - totalReturns,
    manualBillImage: invoice.manualBillImage || null,
    hasManualBillImage: Boolean(invoice.manualBillImage),
    canAddPayment,
    canAddReturn: canAddPayment,
  };
}
/**
 * Everything the screen needs from one load: payments / returns are indexed once, and "Add Payment" is enabled on the
 * newest invoice of each customer only (computed over ALL invoices, not the filtered list).
 */
export function buildSalesHistoryData(invoices, returns, payments) {
  const returnsByInvoice = indexByInvoiceNo(returns);
  const paymentsByInvoice = indexByInvoiceNo(payments);
  const latest = latestInvoiceNoPerParty(invoices, (i) => i.customerName);
  const list = invoices
    .map((invoice) =>
      toHistoryInvoice(
        invoice,
        paymentsByInvoice.get(invoice.invoiceNo) ?? [],
        returnsByInvoice.get(invoice.invoiceNo) ?? [],
        latest.get(invoice.customerName) === invoice.invoiceNo,
      ),
    )
    .sort(compareNewestFirst);
  return { invoices: list };
}
