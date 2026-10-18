/**
 * Combined (all bills of ONE party) statement data: choosing the party, ordering and the totals the screen, the PDFs
 * and the WhatsApp text are built from (displayCustomerStatementResults / generateCombinedPDFStatement(Easy) /
 * shareCombinedStatementViaWhatsApp).
 *
 * A statement always covers exactly one ledger party (core/ledger groupParties: phone first, then name), so two
 * customers that share a name — or whose names merely contain the typed text — are never added up together. Its
 * outstanding figure is the ledger's (partySummary().balance), i.e. the same number the next bill carries.
 */
import { foldBreakdown } from '@/core/paymentMethods';
import { compareLedgerOrder, groupParties, normalizePhone } from '@/core/ledger';
import { toNum } from '@/core/format';
const cleanName = (n) =>
  String(n ?? '')
    .trim()
    .toLowerCase();
const byName = (a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.key.localeCompare(b.key);
/**
 * The ledger parties the typed text points to (`kind` = SALES_LEDGER / PURCHASE_LEDGER):
 *   a phone number (10+ digits)   -> the party with that phone
 *   otherwise an exact name        -> every party using that name (two customers called "Ravi" are two parties)
 *   otherwise part of a name       -> every party whose name contains the text (case-insensitive, like the web search)
 * More than one result means the user has to pick one.
 */
export function findStatementParties(kind, bills, query) {
  const q = cleanName(query);
  if (!q) return [];
  const parties = groupParties(kind, bills);
  const names = (party) => party.bills.map((b) => cleanName(kind.name(b)));
  const digits = normalizePhone(q);
  if (digits.length === 10 && /^[\d\s+()-]+$/.test(q)) {
    const byPhone = parties.filter((p) => p.bills.some((b) => normalizePhone(kind.phone(b)) === digits));
    if (byPhone.length > 0) return byPhone.sort(byName);
  }
  const exact = parties.filter((p) => names(p).includes(q));
  if (exact.length > 0) return exact.sort(byName);
  return parties.filter((p) => names(p).some((n) => n.includes(q))).sort(byName);
}
/** What the "pick a party" list shows for one ledger party. */
export const partyChoice = (party) => ({
  key: party.key,
  name: party.name,
  phone: party.phone,
  count: party.bills.length,
});
/** The section state for a load result: a statement, a list of parties to pick from, or nothing found. */
export function statementState(result, query) {
  if (!result) return { status: 'empty', query };
  if (result.choices) return { status: 'choose', query, parties: result.choices };
  return { status: 'ready', statement: result };
}
/** Newest first in ledger order (bill date, then bill number, then creation time). */
export const sortNewestFirst = (invoices) => [...invoices].sort(compareLedgerOrder).reverse();
/** Oldest first in ledger order (the "Easy" ledger lines). */
export const sortOldestFirst = (invoices) => [...invoices].sort(compareLedgerOrder);
/** The bill's own amount (no carried balance): the view's `billAmount`, else subtotal − discount. */
export const billAmountOf = (i) => (i.billAmount ?? toNum(i.subtotal) - toNum(i.discountAmount)) || 0;
/** Returns that lowered the balance (older views without the split: all of them). */
export const balanceReturnsOf = (i) => toNum(i.balanceReturns ?? i.totalReturns);
/** Returns refunded in cash / to an account (they do not change what is owed). */
export const refundedReturnsOf = (i) => toNum(i.refundedReturns);
/** What one bill still says is owed after the returns settled on its balance. */
export const invoiceDue = (i) => toNum(i.adjustedBalanceDue ?? i.balanceDue);
/**
 * Aggregation behind the on-screen summary, the PDF and the WhatsApp message. `matched` = the HistoryInvoices of ONE
 * party; `summary` = core/ledger partySummary() of that party's bills (opening, billed, paid, balance), which is the
 * source of truth for the totals. Without it (tests, a party never synced) the totals are summed from the views.
 * Null when nothing matched.
 */
export function buildCombinedStatement(partyName, matched, summary) {
  if (matched.length === 0) return null;
  const invoices = sortNewestFirst(matched);
  const mostRecent = invoices[0];
  const sum = (pick) => invoices.reduce((total, i) => total + toNum(pick(i)), 0);
  const folded = (i) => foldBreakdown(i.paymentBreakdown) ?? { cash: 0, account: 0 };
  return {
    partyName,
    partyPhone: mostRecent.partyPhone,
    partyAddress: mostRecent.partyAddress,
    invoices,
    mostRecent,
    totals: {
      totalInvoices: invoices.length,
      opening: summary ? toNum(summary.opening) : 0,
      totalBilled: summary ? toNum(summary.billed) : sum(billAmountOf),
      totalPaid: summary ? toNum(summary.paid) : sum((i) => i.amountPaid),
      totalDiscount: sum((i) => i.discountAmount || 0),
      totalReturns: sum((i) => i.totalReturns),
      balanceReturns: sum(balanceReturnsOf),
      refundedReturns: sum(refundedReturnsOf),
      totalCash: sum((i) => folded(i).cash),
      totalAccount: sum((i) => folded(i).account),
      outstanding: summary ? toNum(summary.balance) : invoiceDue(sortOldestFirst(matched).at(-1)),
    },
  };
}
/**
 * The simplified ledger: one line per bill (oldest first) with the bill's own amount (after discount, no carried
 * balance), what was received and the returns deducted from the balance. Balance Due = opening + amounts − received −
 * deducted returns, which is the ledger closing — pass the ledger's `outstanding` to print exactly that figure.
 */
export function buildEasyStatement(matched, { opening = 0, outstanding } = {}) {
  if (matched.length === 0) return null;
  const invoices = sortOldestFirst(matched);
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
      discount: toNum(invoice.discountAmount),
      returnsDeducted: balanceReturnsOf(invoice),
      returnsRefunded: refundedReturnsOf(invoice),
      amount: billAmountOf(invoice),
      received: toNum(invoice.amountPaid),
    };
  });
  const totalBill = rows.reduce((s, r) => s + r.amount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.received, 0);
  const totalReturns = rows.reduce((s, r) => s + r.returnsDeducted, 0);
  const open = toNum(opening);
  return {
    partyPhone: newest.partyPhone,
    partyAddress: newest.partyAddress,
    rows,
    opening: open,
    totalBill,
    totalPaid,
    totalReturns,
    balanceDue:
      outstanding !== undefined && outstanding !== null
        ? toNum(outstanding)
        : open + totalBill - totalPaid - totalReturns,
  };
}
