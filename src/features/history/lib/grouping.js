/** Date-wise grouping of the invoice list (groupInvoicesByDate, getDateWiseStatistics, filterByDate). */
import { formatDateIN } from '@/core/format';
import { dayKey } from './dates';
export const NO_DATE_LABEL = 'No date';
/** One group per calendar day, newest day first; invoices keep the order they came in. */
export function groupInvoicesByDate(invoices) {
  const groups = new Map();
  for (const invoice of invoices) {
    const key = dayKey(invoice.invoiceDate);
    let group = groups.get(key);
    if (!group) {
      group = { key, date: key ? formatDateIN(key) : NO_DATE_LABEL, invoices: [], totalInvoices: 0 };
      groups.set(key, group);
    }
    group.invoices.push(invoice);
    group.totalInvoices += 1;
  }
  // ISO keys sort lexicographically; '' (undated) goes last
  return [...groups.values()].sort((a, b) => {
    if (a.key === b.key) return 0;
    if (!a.key) return 1;
    if (!b.key) return -1;
    return a.key < b.key ? 1 : -1;
  });
}
export function getDateWiseStatistics(invoices) {
  const dateGroups = groupInvoicesByDate(invoices);
  return { totalDays: dateGroups.length, dateGroups, overallStats: { totalInvoices: invoices.length } };
}
/** filterByDate(): show only one day (from = to = that day), keeping the other filters. */
export function filterByDate(filters, day) {
  return { ...filters, fromDate: day, toDate: day };
}
