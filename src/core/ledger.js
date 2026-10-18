/**
 * Party ledger — the single source of truth for the "Previous Balance Due" of sales invoices (per customer) and
 * purchase bills (per supplier). Pure functions: no Firestore, no React (db.js and billing.js feed them data).
 *
 * All bills of one party form a running-balance chain in chronological order (bill date, then bill number, then
 * creation time — the same order the history screens use):
 *
 *   previousBalance(n) = closingBalance(n - 1)      the first bill keeps its stored previousBalance (the opening anchor)
 *   grandTotal(n)      = subtotal + previousBalance + manualPreviousBalance - discount     (purchase: never below 0)
 *   balanceDue(n)      = grandTotal - amountPaid
 *   closingBalance(n)  = balanceDue - returns       (= adjustedBalanceDue, what the next bill carries forward)
 *
 * previousBalance / grandTotal / balanceDue / totalReturns / adjustedBalanceDue stored on a bill are therefore
 * DERIVED values: whenever a bill, its payments or its returns change, the whole chain is rebuilt from fresh data
 * (db.syncSalesLedger / db.syncPurchaseLedger) and only the fields that differ are written back.
 */
import { toNum } from './format';

/** 2-decimal money rounding (paise), -0 -> 0. */
export const roundMoney = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100 || 0;

const EPSILON = 0.005;
const differs = (stored, computed) => stored === undefined || stored === null || Math.abs(toNum(stored) - computed) > EPSILON;

// ------------------------------------------------------------------ the two kinds of ledger
/** Sales invoices: discount is `discountAmount` (legacy `discount`), paid is the top-level `amountPaid`. */
export const SALES_LEDGER = {
  name: (b) => b.customerName,
  phone: (b) => b.customerPhone,
  discount: (b) => (b.discountAmount !== undefined ? toNum(b.discountAmount) : toNum(b.discount)),
  paid: (b) => (b.amountPaid !== undefined ? toNum(b.amountPaid) : undefined),
  floorGrandTotal: false,
};
/**
 * Purchase bills: discount is `discount` (older `discountAmount`); paid lives in the nested `payment.totalPaid` (new
 * bills) and/or the top-level `amountPaid` (edited / legacy bills) — read like core/billing `purchaseAmountPaid`.
 */
export const PURCHASE_LEDGER = {
  name: (b) => b.supplierName,
  phone: (b) => b.supplierPhone,
  discount: (b) => toNum(b.discount) || toNum(b.discountAmount),
  paid: (b) =>
    b.payment?.totalPaid === undefined && b.amountPaid === undefined
      ? undefined
      : toNum(b.payment?.totalPaid) || toNum(b.amountPaid),
  floorGrandTotal: true,
};

// ------------------------------------------------------------------ who belongs to a party
const cleanPhone = (p) => String(p ?? '').trim();
const cleanName = (n) => String(n ?? '').trim().toLowerCase();
/**
 * A bill belongs to the party when both have a phone and the phones are equal; otherwise when the (trimmed,
 * case-insensitive) names are equal. Same rule the bill screens always used to find a party's earlier bills.
 */
export function partyMatcher(kind, name, phone) {
  const p = cleanPhone(phone);
  const n = cleanName(name);
  return (bill) => {
    const bp = cleanPhone(kind.phone(bill));
    if (p && bp) return bp === p;
    return n !== '' && cleanName(kind.name(bill)) === n;
  };
}

// ------------------------------------------------------------------ chronological order
const dayMillis = (value) => {
  if (!value) return null;
  const t = Date.parse(String(value).slice(0, 10));
  return Number.isNaN(t) ? null : t;
};
const billNumber = (invoiceNo) => {
  const m = String(invoiceNo ?? '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
};
/** [date, number, createdAt] — missing values sort first for stored bills (they are the oldest data). */
function storedKey(bill) {
  return [dayMillis(bill.invoiceDate) ?? -Infinity, billNumber(bill.invoiceNo) ?? -Infinity, String(bill.createdAt ?? '')];
}
/** A bill being composed: a missing date / number means "after everything already stored". */
function pendingKey(target) {
  return [dayMillis(target.invoiceDate) ?? Infinity, billNumber(target.invoiceNo) ?? Infinity, '￿'];
}
function compareKeys(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
  return 0;
}
/** Oldest first: bill date, then bill number (numbers restart every financial year), then creation time. */
export const compareLedgerOrder = (a, b) => compareKeys(storedKey(a), storedKey(b));

// ------------------------------------------------------------------ the chain
function subtotalOf(bill) {
  if (bill.subtotal !== undefined && bill.subtotal !== null && Number.isFinite(Number(bill.subtotal)))
    return toNum(bill.subtotal);
  if (Array.isArray(bill.products) && bill.products.length > 0)
    return bill.products.reduce((sum, p) => sum + toNum(p.amount ?? toNum(p.qty) * toNum(p.rate)), 0);
  // nothing to rebuild it from: keep what the bill says it was
  return toNum(bill.grandTotal) - toNum(bill.previousBalance) - toNum(bill.manualPreviousBalance);
}
/** Sum of `returnAmount` per bill number. */
export function returnsTotalsByInvoice(returns) {
  const totals = new Map();
  (returns || []).forEach((r) => {
    const key = String(r.invoiceNo);
    totals.set(key, (totals.get(key) || 0) + toNum(r.returnAmount));
  });
  return totals;
}
/**
 * Rebuilds a party's chain. `bills` = that party's bills in any order; `returnsByInvoice` from returnsTotalsByInvoice;
 * `opening` overrides the first bill's previous balance (used when the old first bill was deleted).
 * Returns one row per bill, oldest first, with every derived value.
 */
export function computeLedger(bills, kind, { returnsByInvoice = new Map(), opening } = {}) {
  const ordered = [...bills].sort(compareLedgerOrder);
  let carried = 0;
  return ordered.map((bill, index) => {
    const previousBalance = roundMoney(
      index === 0 ? (opening !== undefined ? opening : toNum(bill.previousBalance)) : carried,
    );
    const raw = subtotalOf(bill) + previousBalance + toNum(bill.manualPreviousBalance) - kind.discount(bill);
    const grandTotal = roundMoney(kind.floorGrandTotal && raw < 0 ? 0 : raw);
    // a legacy bill without any "paid" field: what it says it still owes is the truth
    const storedPaid = kind.paid(bill);
    const amountPaid = roundMoney(
      storedPaid !== undefined ? storedPaid : toNum(bill.grandTotal) - toNum(bill.balanceDue ?? bill.payment?.balanceDue),
    );
    const balanceDue = roundMoney(grandTotal - amountPaid);
    const totalReturns = roundMoney(returnsByInvoice.get(String(bill.invoiceNo)) || 0);
    const closingBalance = roundMoney(balanceDue - totalReturns);
    carried = closingBalance;
    return { bill, previousBalance, grandTotal, amountPaid, balanceDue, totalReturns, closingBalance };
  });
}

/**
 * The previous balance of a bill at its place in the chain: the closing balance of the bill just before it.
 * `target` = { invoiceNo, invoiceDate } of the bill being written or edited; a stored bill with the same number is
 * the bill itself (being edited / overwritten) and is left out. Without a predecessor the bill is the party's first:
 * `anchor` is then the opening balance (`null` = no earlier data, the caller decides).
 */
export function previousBalanceAt(bills, kind, target, { returnsByInvoice } = {}) {
  const self = target.invoiceNo ? bills.find((b) => String(b.invoiceNo) === String(target.invoiceNo).trim()) : null;
  const others = self ? bills.filter((b) => b !== self) : bills;
  const rows = computeLedger(others, kind, { returnsByInvoice });
  const probe = pendingKey({ invoiceDate: target.invoiceDate || self?.invoiceDate, invoiceNo: target.invoiceNo });
  const before = rows.filter((r) => compareKeys(storedKey(r.bill), probe) < 0);
  const last = before[before.length - 1];
  if (last) {
    return {
      previousBalance: last.closingBalance,
      previousBill: last.bill,
      count: before.length,
      totalPreviousBills: roundMoney(before.reduce((sum, r) => sum + r.grandTotal, 0)),
    };
  }
  // first bill of the party: keep its own opening, or take over the opening of the bills it now precedes
  let anchor = null;
  if (self) anchor = toNum(self.previousBalance);
  else if (rows.length > 0) anchor = rows[0].previousBalance;
  return { previousBalance: anchor, previousBill: null, count: 0, totalPreviousBills: 0 };
}

// ------------------------------------------------------------------ what to write back
/** Changed derived fields of a sales invoice (null when it is already right). */
export function salesLedgerChanges(row) {
  const { bill } = row;
  const fields = {};
  if (differs(bill.previousBalance, row.previousBalance)) fields.previousBalance = row.previousBalance;
  if (differs(bill.grandTotal, row.grandTotal)) fields.grandTotal = row.grandTotal;
  if (differs(bill.balanceDue, row.balanceDue)) fields.balanceDue = row.balanceDue;
  returnFieldChanges(bill, row, fields);
  return Object.keys(fields).length ? fields : null;
}
/**
 * Changed derived fields of a purchase bill (null when already right). The top-level `balanceDue` is always kept
 * (older readers — and the original web app — read only that one) and the nested `payment.balanceDue` follows.
 */
export function purchaseLedgerChanges(row) {
  const { bill } = row;
  const fields = {};
  if (differs(bill.previousBalance, row.previousBalance)) fields.previousBalance = row.previousBalance;
  if (differs(bill.grandTotal, row.grandTotal)) fields.grandTotal = row.grandTotal;
  if (differs(bill.balanceDue, row.balanceDue)) fields.balanceDue = row.balanceDue;
  if (bill.payment && typeof bill.payment === 'object' && differs(bill.payment.balanceDue, row.balanceDue))
    fields['payment.balanceDue'] = row.balanceDue;
  returnFieldChanges(bill, row, fields);
  return Object.keys(fields).length ? fields : null;
}
/** totalReturns / adjustedBalanceDue: refreshed when present, added only when the bill actually has returns. */
function returnFieldChanges(bill, row, fields) {
  const has = bill.totalReturns !== undefined || bill.adjustedBalanceDue !== undefined;
  if (!has && row.totalReturns === 0) return;
  if (differs(bill.totalReturns, row.totalReturns)) fields.totalReturns = row.totalReturns;
  if (differs(bill.adjustedBalanceDue, row.closingBalance)) fields.adjustedBalanceDue = row.closingBalance;
}
