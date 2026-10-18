/**
 * Per-invoice lookups built ONCE per load (the web page did the same with returnsByInvoice / paymentsByInvoice /
 * latestInvoicePerCustomer) so rendering thousands of invoices never queries per invoice.
 */
import { toNum } from '@/core/format';
import { groupParties } from '@/core/ledger';
export function indexByInvoiceNo(items) {
  const map = new Map();
  for (const item of items) {
    const list = map.get(item.invoiceNo);
    if (list) list.push(item);
    else map.set(item.invoiceNo, [item]);
  }
  return map;
}
/** Sum of `returnAmount` with the web's parseFloat(x) || 0 coercion (ALL returns, refunded or not). */
export function sumReturnAmounts(returns) {
  return returns.reduce((sum, r) => sum + toNum(r.returnAmount), 0);
}
export function sumPaymentAmounts(payments) {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}
/**
 * Invoice numbers of each party's newest bill over ALL bills (`kind` = SALES_LEDGER / PURCHASE_LEDGER): parties are
 * grouped exactly like the ledger chains them (phone first, see core/ledger groupParties) and "newest" is the last
 * bill in ledger order — the bill whose closing balance is what the party owes now.
 */
export function latestInvoiceNoPerParty(kind, bills) {
  const latest = new Set();
  for (const party of groupParties(kind, bills)) {
    const last = party.bills[party.bills.length - 1];
    if (last) latest.add(last.invoiceNo);
  }
  return latest;
}
