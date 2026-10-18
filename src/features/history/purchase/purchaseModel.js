/** Adapts Firestore purchase documents to the generic history view-model (`../lib/types`). */
import { purchaseAmountPaid, purchaseBalanceDue } from '@/core/billing';
import { toNum } from '@/core/format';
import { compareNewestFirst } from '../lib/filters';
import { indexByInvoiceNo, latestInvoiceNoPerParty, sumReturnAmounts } from '../lib/lookups';
import { toHistoryPayment, toHistoryReturn } from '../sales/salesModel';
/** Wording of the Purchase History screen: "Supplier", and the "P-" prefix of old bill numbers is never shown. */
export const PURCHASE_LABELS = {
  party: 'Supplier',
  formatInvoiceNo: (invoiceNo) => String(invoiceNo).replace('P-', ''),
  statementBillLabel: 'Purchase Bill',
};
/**
 * One bill with its (already looked-up) payments and returns.
 *
 * Purchase bills keep payment data in a nested `payment` object (new bills) and/or top-level `amountPaid` /
 * `balanceDue` (edited / legacy bills): both are read through the shared hybrid helpers, like the web page did.
 * The adjusted balance is derived from the returns collection, not from the stored `adjustedBalanceDue`.
 *
 * PARITY NOTE: the web card showed `payment.balanceDue || balanceDue` for bills without returns and
 * `payment.balanceDue (if defined) - returns` for bills with returns. The two only differ for a bill whose nested
 * balance is 0 while a stale top-level balance exists, which no write path produces; the second rule is used for both.
 */
export function toHistoryPurchase(bill, payments, returns, canAddPayment) {
  const totalReturns = sumReturnAmounts(returns);
  const balanceDue = purchaseBalanceDue(bill);
  return {
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    partyName: bill.supplierName,
    partyPhone: bill.supplierPhone,
    partyAddress: bill.supplierAddress,
    products: bill.products ?? [],
    // the card prints `subtotal || grandTotal` as "Current Bill Amount"
    subtotal: toNum(bill.subtotal) || toNum(bill.grandTotal),
    previousBalance: toNum(bill.previousBalance) + toNum(bill.manualPreviousBalance),
    // purchase.js stores `discount`; `discountAmount` is the older name — the card read `discountAmount || discount`
    discountAmount: toNum(bill.discountAmount) || toNum(bill.discount),
    grandTotal: bill.grandTotal,
    amountPaid: purchaseAmountPaid(bill),
    balanceDue,
    paymentBreakdown: bill.paymentBreakdown,
    legacyPaymentMethod: bill.paymentMethod || undefined,
    bankAccountId: bill.bankAccountId || bill.payment?.bankAccountId,
    payments: payments.map((p) => toHistoryPayment(p, bill.bankAccountId || bill.payment?.bankAccountId)),
    returns: returns.map((r) => toHistoryReturn(r, bill.bankAccountId || bill.payment?.bankAccountId)),
    totalReturns,
    adjustedBalanceDue: balanceDue - totalReturns,
    manualBillImage: bill.manualBillImage || null,
    hasManualBillImage: Boolean(bill.manualBillImage),
    canAddPayment,
    canAddReturn: canAddPayment,
  };
}
/**
 * Everything the screen needs from one load: payments / returns are indexed once, and "Add Payment" is enabled on the
 * newest bill of each supplier only (computed over ALL bills, not the filtered list).
 */
export function buildPurchaseHistoryData(bills, returns, payments) {
  const returnsByInvoice = indexByInvoiceNo(returns);
  const paymentsByInvoice = indexByInvoiceNo(payments);
  const latest = latestInvoiceNoPerParty(bills, (b) => b.supplierName);
  const list = bills
    .map((bill) =>
      toHistoryPurchase(
        bill,
        paymentsByInvoice.get(bill.invoiceNo) ?? [],
        returnsByInvoice.get(bill.invoiceNo) ?? [],
        latest.get(bill.supplierName) === bill.invoiceNo,
      ),
    )
    .sort(compareNewestFirst);
  return { invoices: list };
}
