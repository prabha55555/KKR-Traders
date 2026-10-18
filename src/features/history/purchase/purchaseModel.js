/** Adapts Firestore purchase documents to the generic history view-model (`../lib/types`). */
import { purchaseAmountPaid, purchaseBalanceDue } from '@/core/billing';
import { formatInvoiceNo, toNum } from '@/core/format';
import { PURCHASE_LEDGER, balanceReturnsTotal, billAmount } from '@/core/ledger';
import { foldBreakdown, foldPurchasePayment, normalizeMethod, sumByMethod } from '@/core/paymentMethods';
import { compareNewestFirst } from '../lib/filters';
import { indexByInvoiceNo, latestInvoiceNoPerParty, sumReturnAmounts } from '../lib/lookups';
import { toHistoryPayment, toHistoryReturn } from '../sales/salesModel';
import { withUntrackedInitialPayment } from './purchasePayments';

/**
 * Cash / Account paid on a purchase bill IN TOTAL. The stored top-level breakdown of a purchase bill only holds the
 * payments added later (the payment made with the bill sits in the nested `payment` split, and an edit drops the
 * top-level one), so it is rebuilt from the payment records (+ the untracked first payment of an older bill); a bill
 * without records keeps its stored breakdown, else its nested split.
 */
function purchasePaidSplit(bill, payments) {
  if (payments.length > 0) return sumByMethod(withUntrackedInitialPayment(bill, payments));
  const stored = foldBreakdown(bill.paymentBreakdown);
  if (stored) return stored;
  if (bill.payment && typeof bill.payment === 'object') {
    const { cash, account } = foldPurchasePayment(bill.payment);
    if (cash || account) return { cash, account };
  }
  return undefined;
}
/** Wording of the Purchase History screen: "Supplier", and the "P-" prefix of old bill numbers is never shown. */
export const PURCHASE_LABELS = {
  party: 'Supplier',
  formatInvoiceNo,
  statementBillLabel: 'Purchase Bill',
};
/**
 * One bill with its (already looked-up) payments and returns.
 *
 * Purchase bills keep payment data in a nested `payment` object (new bills) and/or top-level `amountPaid` /
 * `balanceDue` (edited / legacy bills): both are read through the shared hybrid helpers, like the web page did.
 * Returns as in the sales view (toHistoryInvoice): `adjustedBalanceDue = balanceDue - balanceReturns` (returns settled
 * against the balance only; refunds are listed but leave the balance alone). The payment split is folded to
 * { cash, account }.
 *
 * PARITY NOTE: the web card showed `payment.balanceDue || balanceDue` for bills without returns and
 * `payment.balanceDue (if defined) - returns` for bills with returns. The two only differ for a bill whose nested
 * balance is 0 while a stale top-level balance exists, which no write path produces; the second rule is used for both.
 */
export function toHistoryPurchase(bill, payments, returns, canAddPayment) {
  const totalReturns = sumReturnAmounts(returns);
  const balanceReturns = balanceReturnsTotal(returns);
  const balanceDue = purchaseBalanceDue(bill);
  const ownAmount = billAmount(bill, PURCHASE_LEDGER);
  return {
    invoiceNo: bill.invoiceNo,
    invoiceDate: bill.invoiceDate,
    partyName: bill.supplierName,
    partyPhone: bill.supplierPhone,
    partyAddress: bill.supplierAddress,
    products: bill.products ?? [],
    // "Current Bill Amount": the stored subtotal, else rebuilt like the ledger does (products, or the total minus the
    // carried balance) — never the grand total, which already contains the previous balance
    subtotal: ownAmount - toNum(bill.manualPreviousBalance) + PURCHASE_LEDGER.discount(bill),
    previousBalance: toNum(bill.previousBalance) + toNum(bill.manualPreviousBalance),
    // purchase.js stores `discount`; `discountAmount` is the older name — the card read `discountAmount || discount`
    discountAmount: toNum(bill.discountAmount) || toNum(bill.discount),
    grandTotal: bill.grandTotal,
    billAmount: ownAmount,
    amountPaid: purchaseAmountPaid(bill),
    balanceDue,
    paymentBreakdown: purchasePaidSplit(bill, payments),
    legacyPaymentMethod: bill.paymentMethod ? normalizeMethod(bill.paymentMethod) : undefined,
    bankAccountId: bill.bankAccountId || bill.payment?.bankAccountId,
    payments: payments.map((p) => toHistoryPayment(p, bill.bankAccountId || bill.payment?.bankAccountId)),
    returns: returns.map((r) => toHistoryReturn(r)),
    totalReturns,
    balanceReturns,
    refundedReturns: totalReturns - balanceReturns,
    adjustedBalanceDue: balanceDue - balanceReturns,
    manualBillImage: bill.manualBillImage || null,
    hasManualBillImage: Boolean(bill.manualBillImage),
    canAddPayment,
    canAddReturn: canAddPayment,
  };
}
/**
 * Everything the screen needs from one load: payments / returns are indexed once, and "Add Payment" is enabled on the
 * newest bill (ledger order) of each supplier only — suppliers grouped like the ledger (phone first), over ALL bills,
 * not the filtered list.
 */
export function buildPurchaseHistoryData(bills, returns, payments) {
  const returnsByInvoice = indexByInvoiceNo(returns);
  const paymentsByInvoice = indexByInvoiceNo(payments);
  const latest = latestInvoiceNoPerParty(PURCHASE_LEDGER, bills);
  const list = bills
    .map((bill) =>
      toHistoryPurchase(
        bill,
        paymentsByInvoice.get(bill.invoiceNo) ?? [],
        returnsByInvoice.get(bill.invoiceNo) ?? [],
        latest.has(bill.invoiceNo),
      ),
    )
    .sort(compareNewestFirst);
  return { invoices: list };
}
