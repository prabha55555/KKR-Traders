/**
 * Combined (all invoices of one party) statement data: matching, ordering and the totals the screen, the PDFs and the
 * WhatsApp text are built from (displayCustomerStatementResults / generateCombinedPDFStatement(Easy) /
 * shareCombinedStatementViaWhatsApp).
 */
import { dateMillis } from './dates';
import { invoiceNumber } from './filters';
/** invoices of the parties whose name contains the typed text (case-insensitive substring, like the web search). */
export function matchPartyInvoices(invoices, query) {
  const q = query.trim().toLowerCase();
  return invoices.filter((invoice) => (invoice.partyName || '').toLowerCase().includes(q));
}
/** Highest invoice number first (stable for equal / non-numeric numbers). */
export function sortByInvoiceNumberDesc(invoices) {
  return [...invoices].sort((a, b) => invoiceNumber(b.invoiceNo) - invoiceNumber(a.invoiceNo));
}
/**
 * Oldest invoice date first (the "Easy" ledger order). Invoices of the same day go by invoice number ascending —
 * the order the web got by sorting Firestore's id-ordered documents with a stable sort.
 */
export function sortByDateAsc(invoices) {
  return invoices
    .map((invoice, index) => ({ invoice, index }))
    .sort(
      (a, b) =>
        dateMillis(a.invoice.invoiceDate) - dateMillis(b.invoice.invoiceDate) ||
        invoiceNumber(a.invoice.invoiceNo) - invoiceNumber(b.invoice.invoiceNo) ||
        a.index - b.index,
    )
    .map((entry) => entry.invoice);
}
/** Aggregation behind the on-screen summary, the PDF and the WhatsApp message. Null when nothing matched. */
export function buildCombinedStatement(partyName, matched) {
  if (matched.length === 0) return null;
  const invoices = sortByInvoiceNumberDesc(matched);
  const mostRecent = invoices[0];
  const sum = (pick) => invoices.reduce((total, i) => total + pick(i), 0);
  return {
    partyName,
    partyPhone: mostRecent.partyPhone,
    partyAddress: mostRecent.partyAddress,
    invoices,
    mostRecent,
    totals: {
      totalInvoices: invoices.length,
      totalCurrentBill: sum((i) => i.subtotal),
      totalPaid: sum((i) => i.amountPaid),
      totalDiscount: sum((i) => i.discountAmount || 0),
      totalReturns: sum((i) => i.totalReturns),
      totalCash: sum((i) => i.paymentBreakdown?.cash || 0),
      totalUpi: sum((i) => i.paymentBreakdown?.upi || 0),
      totalAccount: sum((i) => i.paymentBreakdown?.account || 0),
      adjustedBalanceDue: mostRecent.adjustedBalanceDue,
    },
  };
}
/** Label of the balance figure: "Adjusted Balance Due" when any return exists, else "Balance Due". */
export const statementBalanceLabel = (totals) =>
  totals.totalReturns > 0 ? 'Adjusted Balance Due' : 'Balance Due';
export function buildEasyStatement(matched) {
  if (matched.length === 0) return null;
  const invoices = sortByDateAsc(matched);
  const newest = invoices[invoices.length - 1];
  const rows = invoices.map((invoice) => {
    const summary =
      invoice.products.length > 0
        ? invoice.products.map((p) => p.description).join(', ')
        : 'Products Purchased';
    return {
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      particulars: summary.length > 50 ? `${summary.substring(0, 47)}...` : summary,
      returnsDeducted: invoice.totalReturns,
      amount: invoice.subtotal,
      received: invoice.amountPaid,
    };
  });
  const totalBill = rows.reduce((s, r) => s + r.amount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.received, 0);
  const totalReturns = rows.reduce((s, r) => s + r.returnsDeducted, 0);
  return {
    partyPhone: newest.partyPhone,
    partyAddress: newest.partyAddress,
    rows,
    totalBill,
    totalPaid,
    totalReturns,
    balanceDue: totalBill - totalPaid - totalReturns,
  };
}
