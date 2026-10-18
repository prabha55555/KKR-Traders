/**
 * Pure logic of the sales / purchase recycle bins (ports of js/recycle-bin.js and js/purchase-recycle-bin.js, which are
 * near-duplicates — one parameterised implementation serves both).
 */
import { purchaseAmountPaid, purchaseBalanceDue } from '@/core/billing';
import { formatCurrency, formatDateIN, toISODate } from '@/core/format';
const DAY_MS = 1000 * 60 * 60 * 24;
export const BIN_CONFIG = {
  sales: {
    kind: 'sales',
    itemType: 'invoice',
    headerText: 'Restore accidentally deleted invoices or permanently delete them',
    emptyButton: 'Empty Recycle Bin',
    emptyConfirmMessage:
      'This will permanently delete all items in the recycle bin. This action cannot be undone.',
    partyLabel: 'Customer',
    countLabel: 'Invoices',
    typeFilterLabel: 'Invoices Only',
    emptyTitle: 'Recycle Bin is Empty',
    emptyMessage: 'Deleted invoices will appear here for recovery',
    detailNoun: 'Invoice',
  },
  purchase: {
    kind: 'purchase',
    itemType: 'purchase_invoice',
    headerText: 'Restore accidentally deleted Purchase Bills or permanently delete them',
    emptyButton: 'Empty Purchase Recycle Bin',
    emptyConfirmMessage:
      'This will permanently delete all items in the Purchase Recycle Bin. This action cannot be undone.',
    partyLabel: 'Supplier',
    countLabel: 'Purchase Bills',
    typeFilterLabel: 'Purchase Bills Only',
    emptyTitle: 'Purchase Recycle Bin is Empty',
    emptyMessage: 'Deleted Purchase Bills will appear here for recovery',
    detailNoun: 'Purchase Bill',
  },
};
// ------------------------------------------------------------------ dates
/**
 * Firestore `Timestamp` (live, or revived from the offline cache), `{seconds, nanoseconds}`, Date, ISO string or
 * millis -> Date. null when missing/unparseable.
 * PARITY NOTE: the web page did `new Date(item.deletedAt)` on a missing value, which silently became 1 Jan 1970
 * ("20,000 days ago"); such items now show "-" instead.
 */
export function toDate(value) {
  if (value === null || value === undefined || value === '') return null;
  let d;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'object') {
    const v = value;
    if (typeof v.toDate === 'function') d = v.toDate();
    else if (typeof v.seconds === 'number')
      d = new Date(v.seconds * 1000 + Math.floor((v.nanoseconds ?? 0) / 1e6));
    else return null;
  } else if (typeof value === 'string' || typeof value === 'number') {
    d = new Date(value);
  } else {
    return null;
  }
  return Number.isNaN(d.getTime()) ? null : d;
}
/** Whole days since `date`. Clamped at 0 so a device clock that runs behind the server never prints "-1 days ago". */
export function daysAgo(date, now) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}
export function daysAgoText(days) {
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}
/** `toLocaleDateString('en-IN')` -> 3/10/2026 */
export function formatBinDate(date) {
  return formatDateIN(toISODate(date));
}
/** `toLocaleString('en-IN')` -> 3/10/2026, 2:30:45 pm */
export function formatBinDateTime(date) {
  const h = date.getHours();
  const pad = (n) => String(n).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${formatBinDate(date)}, ${h12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${h < 12 ? 'am' : 'pm'}`;
}
// ------------------------------------------------------------------ list helpers
/** Newest deletion first (db already orders by deletedAt desc; the offline copy and ties need not). Stable. */
export function sortNewestFirst(items) {
  return items
    .map((item, index) => ({ item, index, time: toDate(item.deletedAt)?.getTime() ?? -Infinity }))
    .sort((a, b) => (b.time === a.time ? a.index - b.index : b.time > a.time ? 1 : -1))
    .map((x) => x.item);
}
export function partyName(item) {
  return item.type === 'invoice' ? item.customerName : item.supplierName;
}
/** The number shown to the user: purchase bills lose their "P-" prefix (purchase-recycle-bin.js). */
export function displayBillNo(item) {
  const no = String(item.originalId);
  return item.type === 'purchase_invoice' ? no.replace('P-', '') : no;
}
/** What the web card's `<h4>` said and what the restore / delete dialogs quoted: "Invoice 001". */
export function binItemName(item) {
  return `Invoice ${displayBillNo(item)}`;
}
/**
 * Text the web search matched against (`item.textContent` of the card), plus the invoice date, which the website-width
 * table / card show next to it. PARITY NOTE: the web text also contained the button captions "View / Restore / Delete
 * Permanently", so searching "view" or "restore" matched every item; the captions are not part of the searchable text.
 */
export function binSearchText(item, now) {
  const deleted = toDate(item.deletedAt);
  const when = deleted ? `${formatBinDate(deleted)} (${daysAgoText(daysAgo(deleted, now))})` : '';
  const invoiceDate = item.invoiceDate ? formatDateIN(item.invoiceDate) : '';
  return [binItemName(item), invoiceDate, when, partyName(item) ?? '', `₹${formatCurrency(item.grandTotal)}`]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
/**
 * Type filter + search. PARITY NOTE: the purchase page's "Purchase Bills Only" option carried the value
 * "Purchase Bill" while items are typed `purchase_invoice`, so that filter hid everything; here it selects the type.
 */
export function filterBinItems(items, typeFilter, term, now) {
  const q = term.trim().toLowerCase();
  return items.filter((item) => {
    const typeMatch = typeFilter === 'all' || item.type === typeFilter;
    return typeMatch && (!q || binSearchText(item, now).includes(q));
  });
}
export function computeBinStats(items, itemType, now) {
  const times = items.map((i) => toDate(i.deletedAt)?.getTime()).filter((t) => t !== undefined);
  return {
    totalItems: items.length,
    invoiceItems: items.filter((i) => i.type === itemType).length,
    oldestDays: times.length ? daysAgo(new Date(Math.min(...times)), now) : null,
  };
}
const METHOD_LABELS = { cash: 'Cash', upi: 'UPI', account: 'Account', bank: 'Account' };
export function paymentMethodLabel(method) {
  const m = String(method || 'cash').toLowerCase();
  return METHOD_LABELS[m] ?? String(method);
}
/**
 * Content of the "View Details" dialog, with the web fallbacks ('N/A', `|| 0`).
 * Returns null for an item type the bin has no preview for ("Preview not available for this item type.").
 * Improvement: the web dialog showed only the products and totals; payments and returns that travel with the deleted
 * invoice are listed too so the user can see what a restore brings back.
 * PARITY NOTE: purchase "Paid" / "Balance Due" read the top-level fields in the web page, which new purchase bills
 * (nested `payment` object) do not have, so they printed 0; the shared `purchaseAmountPaid/BalanceDue` helpers are used.
 */
export function buildBinDetail(item, config) {
  if (item.type !== config.itemType) return null;
  const deleted = toDate(item.deletedAt);
  const data = item.data ?? {};
  const created = toDate(data.createdAt);
  const invoiceDate = item.invoiceDate
    ? formatDateIN(item.invoiceDate)
    : created
      ? formatBinDate(created)
      : 'N/A';
  const lines = (data.products ?? []).map((p) => ({
    description: p.description || '',
    qty: p.qty || 0,
    rate: p.rate || 0,
    amount: p.amount || 0,
  }));
  const sales = item.type === 'invoice';
  const paid = sales ? data.amountPaid || 0 : purchaseAmountPaid(data);
  const balanceDue = sales ? data.balanceDue || 0 : purchaseBalanceDue(data);
  const payments = (item.payments ?? []).map((p, i) => ({
    id: p.id || String(i),
    date: p.paymentDate || '',
    amount: p.amount || 0,
    method: paymentMethodLabel(p.paymentMethod),
    type: p.paymentType === 'initial' ? 'Initial' : 'Added later',
  }));
  const returns =
    item.type === 'invoice'
      ? (item.returns ?? []).map((r, i) => ({
          id: r.id || String(i),
          date: r.returnDate || '',
          description: r.description || '',
          qty: r.qty || 0,
          amount: r.returnAmount || 0,
        }))
      : [];
  return {
    heading: `${config.detailNoun} #${displayBillNo(item) || data.invoiceNo}`,
    dateText: invoiceDate,
    partyLabel: config.partyLabel,
    partyName: partyName(item) || 'N/A',
    phone: (item.type === 'invoice' ? item.customerPhone : item.supplierPhone) || 'N/A',
    address: (sales ? data.customerAddress : data.supplierAddress) || 'N/A',
    deletedText: deleted ? formatBinDateTime(deleted) : 'N/A',
    lines,
    summary: {
      subtotal: data.subtotal || 0,
      oldBalance: data.previousBalance || 0,
      grandTotal: item.grandTotal || data.grandTotal || 0,
      paid,
      balanceDue,
    },
    payments,
    returns,
  };
}
