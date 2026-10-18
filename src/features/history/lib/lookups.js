/**
 * Per-invoice lookups built ONCE per load (the web page did the same with returnsByInvoice / paymentsByInvoice /
 * latestInvoicePerCustomer) so rendering thousands of invoices never queries per invoice.
 */
import { toNum } from '@/core/format';
import { compareNewestFirst } from './filters';
export function indexByInvoiceNo(items) {
  const map = new Map();
  for (const item of items) {
    const list = map.get(item.invoiceNo);
    if (list) list.push(item);
    else map.set(item.invoiceNo, [item]);
  }
  return map;
}
/** Sum of `returnAmount` with the web's parseFloat(x) || 0 coercion. */
export function sumReturnAmounts(returns) {
  return returns.reduce((sum, r) => sum + toNum(r.returnAmount), 0);
}
export function sumPaymentAmounts(payments) {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}
/** party name -> invoiceNo of that party's newest invoice (date, then invoice number, descending) over ALL invoices. */
export function latestInvoiceNoPerParty(invoices, partyName) {
  const latest = new Map();
  [...invoices].sort(compareNewestFirst).forEach((invoice) => {
    const party = partyName(invoice);
    if (!latest.has(party)) latest.set(party, invoice.invoiceNo);
  });
  return latest;
}
