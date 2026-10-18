/**
 * Search / range filters, sort order and the "recent invoices" strip of the history screen
 * (invoice-history.js loadInvoices, loadRecentInvoices).
 */
import { dateMillis } from './dates';
/** parseInt(invoiceNo) || 0 — the numeric part used by every sort and range filter */
export const invoiceNumber = (invoiceNo) => parseInt(invoiceNo, 10) || 0;
/**
 * Newest first: invoice date descending, then invoice number descending.
 * (An unparseable date counts as the epoch, so such invoices sink to the end instead of making the order undefined.)
 */
export function compareNewestFirst(a, b) {
  const dateCompare = dateMillis(b.invoiceDate) - dateMillis(a.invoiceDate);
  if (dateCompare !== 0) return dateCompare;
  return invoiceNumber(b.invoiceNo) - invoiceNumber(a.invoiceNo);
}
/**
 * loadInvoices(): free-text search on party name / invoice number, date range (string compare on YYYY-MM-DD),
 * invoice-number range, sorted newest first. Returns a new array; the input is not touched.
 *
 * Deviation: the search text is trimmed (phone keyboards append a space after autocomplete, which would otherwise
 * match nothing).
 */
export function filterInvoices(invoices, filters, partyName) {
  const term = filters.search.trim().toLowerCase();
  const { fromDate, toDate, fromInvoiceNo, toInvoiceNo } = filters;
  const fromNo = fromInvoiceNo ? parseInt(fromInvoiceNo, 10) : null;
  const toNo = toInvoiceNo ? parseInt(toInvoiceNo, 10) : null;
  const result = invoices.filter((invoice) => {
    if (
      term &&
      !(partyName(invoice) || '').toLowerCase().includes(term) &&
      !(invoice.invoiceNo || '').toLowerCase().includes(term)
    ) {
      return false;
    }
    if (fromDate || toDate) {
      const date = invoice.invoiceDate;
      if (!date) return false;
      if (fromDate && !(date >= fromDate)) return false;
      if (toDate && !(date <= toDate)) return false;
    }
    if (fromNo !== null || toNo !== null) {
      const n = invoiceNumber(invoice.invoiceNo);
      if (fromNo !== null && !(n >= fromNo)) return false;
      if (toNo !== null && !(n <= toNo)) return false;
    }
    return true;
  });
  return result.sort(compareNewestFirst);
}
/** loadRecentInvoices(): the highest invoice numbers first (parseInt, descending), default top 5. */
export function recentInvoices(invoices, count = 5) {
  return [...invoices]
    .sort((a, b) => invoiceNumber(b.invoiceNo) - invoiceNumber(a.invoiceNo))
    .slice(0, count);
}
