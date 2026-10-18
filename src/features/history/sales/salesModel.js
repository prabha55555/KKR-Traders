/** Adapts Firestore sales documents to the generic history view-model (`../lib/types`). */
import { toNum } from '@/core/format';
import { SALES_LEDGER, balanceReturnsTotal, billAmount } from '@/core/ledger';
import { foldBreakdown, normalizeMethod } from '@/core/paymentMethods';
import { compareNewestFirst } from '../lib/filters';
import { indexByInvoiceNo, latestInvoiceNoPerParty, sumReturnAmounts } from '../lib/lookups';
/** A payment document for the history screens; its method is 'cash' or 'account' (legacy UPI / bank = account). */
export function toHistoryPayment(p, defaultBankAccountId) {
  return {
    id: p.id,
    // older documents stored the day under `date`
    paymentDate: p.paymentDate || p.date || '',
    amount: p.amount,
    paymentMethod: normalizeMethod(p.paymentMethod),
    paymentType: p.paymentType,
    bankAccountId:
      p.bankAccountId || p.account || p.sourceAccount || p.destinationAccount || defaultBankAccountId,
    note: p.note,
  };
}
/**
 * A return document for the history screens. A refund without a stored bank account is booked by Finance against the
 * first bank account, so no default is invented here (the status sheet shows that same first account).
 */
export function toHistoryReturn(r) {
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
    bankAccountId: r.bankAccountId || undefined,
  };
}
/**
 * One invoice with its (already looked-up) payments and returns.
 * previous balance = previousBalance + manualPreviousBalance; `totalReturns` = every return of the bill (listed),
 * `balanceReturns` = the ones settled against the balance (legacy / 'adjustment' returns, see core/ledger
 * isBalanceReturn), `refundedReturns` = the ones refunded in cash / to an account, and
 * `adjustedBalanceDue = balanceDue - balanceReturns` — the bill's closing balance in the ledger (what the next bill
 * carries). `billAmount` = what the bill itself charged (no carried balance). The payment split is folded to
 * { cash, account }.
 */
export function toHistoryInvoice(invoice, payments, returns, canAddPayment) {
  const totalReturns = sumReturnAmounts(returns);
  const balanceReturns = balanceReturnsTotal(returns);
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
    billAmount: billAmount(invoice, SALES_LEDGER),
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
    paymentBreakdown: foldBreakdown(invoice.paymentBreakdown) ?? undefined,
    legacyPaymentMethod: invoice.paymentMethod ? normalizeMethod(invoice.paymentMethod) : undefined,
    bankAccountId: invoice.bankAccountId,
    payments: payments.map((p) => toHistoryPayment(p, invoice.bankAccountId)),
    returns: returns.map((r) => toHistoryReturn(r)),
    totalReturns,
    balanceReturns,
    refundedReturns: totalReturns - balanceReturns,
    adjustedBalanceDue: invoice.balanceDue - balanceReturns,
    manualBillImage: invoice.manualBillImage || null,
    hasManualBillImage: Boolean(invoice.manualBillImage),
    canAddPayment,
    canAddReturn: canAddPayment,
  };
}
/**
 * Everything the screen needs from one load: payments / returns are indexed once, and "Add Payment" is enabled on the
 * newest invoice (ledger order) of each customer only — customers grouped like the ledger (phone first), over ALL
 * invoices, not the filtered list.
 */
export function buildSalesHistoryData(invoices, returns, payments) {
  const returnsByInvoice = indexByInvoiceNo(returns);
  const paymentsByInvoice = indexByInvoiceNo(payments);
  const latest = latestInvoiceNoPerParty(SALES_LEDGER, invoices);
  const list = invoices
    .map((invoice) =>
      toHistoryInvoice(
        invoice,
        paymentsByInvoice.get(invoice.invoiceNo) ?? [],
        returnsByInvoice.get(invoice.invoiceNo) ?? [],
        latest.has(invoice.invoiceNo),
      ),
    )
    .sort(compareNewestFirst);
  return { invoices: list };
}
