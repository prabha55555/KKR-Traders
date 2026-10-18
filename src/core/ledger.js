/**
 * Party ledger — the single source of truth for the "Previous Balance Due" of sales invoices (per customer) and
 * purchase bills (per supplier). Pure functions: no Firestore, no React (db.js and billing.js feed them data).
 *
 * All bills of one party form a running-balance chain in chronological order (bill date, then bill number, then
 * creation time — the same order the history screens use):
 *
 *   previousBalance(first) = the party's OPENING balance (see partyOpening)
 *   previousBalance(n)     = closingBalance(n - 1)
 *   grandTotal(n)          = subtotal + previousBalance + manualPreviousBalance - discount
 *   balanceDue(n)          = grandTotal - amountPaid
 *   closingBalance(n)      = balanceDue - returns settled against the balance   (= adjustedBalanceDue)
 *
 * previousBalance / grandTotal / balanceDue / totalReturns / adjustedBalanceDue stored on a bill are therefore
 * DERIVED values: whenever a bill, its payments or its returns change, the whole chain is rebuilt from fresh data
 * (db.syncSalesLedger / db.syncPurchaseLedger) and only the fields that differ are written back.
 *
 * The opening is a property of the PARTY, not of whichever bill happens to sort first: the sync stamps it on every
 * bill of the party as `ledgerOpening`, so moving a bill's date, deleting the first bill or restoring one can never
 * turn a carried balance into an opening (which would count it twice).
 */
import { toNum } from './format';

/** 2-decimal money rounding (paise), -0 -> 0. */
export const roundMoney = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100 || 0;

const EPSILON = 0.005;
const differs = (stored, computed) =>
  stored === undefined || stored === null || Math.abs(toNum(stored) - computed) > EPSILON;
const isAmount = (v) => v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v));

// ------------------------------------------------------------------ the two kinds of ledger
/** Sales invoices: discount is `discountAmount` (legacy `discount`), paid is the top-level `amountPaid`. */
export const SALES_LEDGER = {
  name: (b) => b.customerName,
  phone: (b) => b.customerPhone,
  discount: (b) => (b.discountAmount !== undefined ? toNum(b.discountAmount) : toNum(b.discount)),
  paid: (b) => (b.amountPaid !== undefined ? toNum(b.amountPaid) : undefined),
};
/**
 * Purchase bills: discount is `discount` (older `discountAmount`); paid lives in the nested `payment.totalPaid` (new
 * bills) and/or the top-level `amountPaid` (edited / legacy bills) — read like core/billing `purchaseAmountPaid`.
 * Like sales, a total below zero is kept (an advance / credit with the supplier carries into the next bill).
 */
export const PURCHASE_LEDGER = {
  name: (b) => b.supplierName,
  phone: (b) => b.supplierPhone,
  discount: (b) => toNum(b.discount) || toNum(b.discountAmount),
  paid: (b) =>
    b.payment?.totalPaid === undefined && b.amountPaid === undefined
      ? undefined
      : toNum(b.payment?.totalPaid) || toNum(b.amountPaid),
};

// ------------------------------------------------------------------ who belongs to a party
/** Last 10 digits: '+91 98765 43210', '098765 43210' and '9876543210' are the same phone. */
export const normalizePhone = (p) =>
  String(p ?? '')
    .replace(/\D/g, '')
    .slice(-10);
const cleanName = (n) =>
  String(n ?? '')
    .trim()
    .toLowerCase();
/**
 * The bills of one party, chosen so that two different parties can never be merged:
 *  - bills with the party's phone;
 *  - bills WITHOUT a phone and with the party's name: once synced they carry `ledgerParty` (the phone of the chain
 *    they were put in, '' = a phone-less chain of that name) and stay there; an unstamped one joins only while its
 *    name is not used by a different phone;
 *  - a party without a phone takes the phone of its name when exactly one phone uses that name (unless `stamp` says
 *    which chain it is: a bill's own `ledgerParty`), otherwise it is the phone-less bills of that name.
 * Returns `{ phone, members }` — `phone` is the resolved party phone ('' for a phone-less chain).
 */
export function resolveParty(kind, bills, name, phone, stamp) {
  const n = cleanName(name);
  let p = normalizePhone(phone);
  const namePhones = new Set();
  if (n) {
    bills.forEach((b) => {
      const bp = normalizePhone(kind.phone(b));
      if (bp && cleanName(kind.name(b)) === n) namePhones.add(bp);
    });
  }
  if (!p && stamp !== undefined && stamp !== null) p = normalizePhone(stamp);
  else if (!p && namePhones.size === 1) [p] = namePhones;
  const nameIsOnlyThisParty = [...namePhones].every((x) => x === p);
  const members = bills.filter((b) => {
    const bp = normalizePhone(kind.phone(b));
    if (bp) return p !== '' && bp === p;
    if (n === '' || cleanName(kind.name(b)) !== n) return false;
    if (b.ledgerParty !== undefined && b.ledgerParty !== null) return normalizePhone(b.ledgerParty) === p;
    return p === '' || nameIsOnlyThisParty;
  });
  return { phone: p, members };
}
/** The bills of one party (see resolveParty). */
export const partyBills = (kind, bills, name, phone, stamp) =>
  resolveParty(kind, bills, name, phone, stamp).members;
/** Same customer / supplier on both bills (used to decide whether an edit moved a bill to another party). */
export function sameParty(kind, a, b) {
  const pa = normalizePhone(kind.phone(a));
  const pb = normalizePhone(kind.phone(b));
  if (pa || pb) return pa === pb;
  return cleanName(kind.name(a)) === cleanName(kind.name(b));
}

// ------------------------------------------------------------------ chronological order
const dayMillis = (value) => {
  if (!value) return null;
  const t = Date.parse(String(value).slice(0, 10));
  return Number.isNaN(t) ? null : t;
};
const billNumber = (invoiceNo) => {
  const digits = String(invoiceNo ?? '').match(/\d+/g);
  // the LAST digit run is the running number: 'INV/2026-27/012' -> 12, 'P-5' -> 5, 'A012B' -> 12
  return digits ? parseInt(digits[digits.length - 1], 10) : null;
};
/** [date, number, whole number text, createdAt] — missing values sort first for stored bills (oldest data). */
function storedKey(bill) {
  return [
    dayMillis(bill.invoiceDate) ?? -Infinity,
    billNumber(bill.invoiceNo) ?? -Infinity,
    String(bill.invoiceNo ?? ''),
    String(bill.createdAt ?? ''),
  ];
}
/** A bill being composed: a missing date / number means "after everything already stored". */
function pendingKey(target) {
  const hasNo = String(target.invoiceNo ?? '').trim() !== '';
  return [
    dayMillis(target.invoiceDate) ?? Infinity,
    (hasNo ? billNumber(target.invoiceNo) : null) ?? Infinity,
    hasNo ? String(target.invoiceNo).trim() : '￿',
    '￿',
  ];
}
const naturalCompare = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
function compareKeys(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  const text = naturalCompare(a[2], b[2]);
  if (text !== 0) return text;
  if (a[3] !== b[3]) return a[3] < b[3] ? -1 : 1;
  return 0;
}
/** Oldest first: bill date, then bill number (numbers restart every financial year), then creation time. */
export const compareLedgerOrder = (a, b) => compareKeys(storedKey(a), storedKey(b));

// ------------------------------------------------------------------ opening balance of a party
/**
 * The party's opening balance: the `ledgerOpening` the sync stamped on its bills, or — for a party never synced
 * before — the stored previous balance of its first bill (what that bill was written with: the customer's / supplier's
 * opening balance, or the balance from before this app). `null` when there are no bills.
 */
export function partyOpening(bills) {
  if (!bills.length) return null;
  const ordered = [...bills].sort(compareLedgerOrder);
  const stamped = ordered.find((b) => isAmount(b.ledgerOpening));
  return roundMoney(stamped ? stamped.ledgerOpening : ordered[0].previousBalance);
}

// ------------------------------------------------------------------ the chain
function subtotalOf(bill, kind) {
  if (isAmount(bill.subtotal)) return toNum(bill.subtotal);
  if (Array.isArray(bill.products) && bill.products.length > 0)
    return bill.products.reduce((sum, p) => sum + toNum(p.amount ?? toNum(p.qty) * toNum(p.rate)), 0);
  // nothing to rebuild it from: keep what the bill says it was
  return (
    toNum(bill.grandTotal) -
    toNum(bill.previousBalance) -
    toNum(bill.manualPreviousBalance) +
    kind.discount(bill)
  );
}
/** A return refunded in cash / bank (money handed over) does not change what is owed; only adjustments do. */
export const isBalanceReturn = (r) => !(r?.settlementType === 'refund' || r?.refundMethod);
/** Per bill number: `total` of all returns (shown as "Total Returns") and `balance` = those settled on the balance. */
export function returnsTotalsByInvoice(returns) {
  const totals = new Map();
  (returns || []).forEach((r) => {
    const key = String(r.invoiceNo);
    const t = totals.get(key) || { total: 0, balance: 0 };
    const amount = toNum(r.returnAmount);
    t.total += amount;
    if (isBalanceReturn(r)) t.balance += amount;
    totals.set(key, t);
  });
  return totals;
}
/**
 * Rebuilds a party's chain. `bills` = that party's bills in any order; `returnsByInvoice` from returnsTotalsByInvoice;
 * `opening` = the party's opening balance (default: partyOpening(bills)).
 * Returns one row per bill, oldest first, with every derived value.
 */
export function computeLedger(bills, kind, { returnsByInvoice = new Map(), opening } = {}) {
  const ordered = [...bills].sort(compareLedgerOrder);
  const start =
    opening !== undefined && opening !== null ? roundMoney(opening) : (partyOpening(ordered) ?? 0);
  let carried = start;
  return ordered.map((bill) => {
    const previousBalance = roundMoney(carried);
    const grandTotal = roundMoney(
      subtotalOf(bill, kind) + previousBalance + toNum(bill.manualPreviousBalance) - kind.discount(bill),
    );
    // a legacy bill without any "paid" field: what it says it still owes is the truth
    const storedPaid = kind.paid(bill);
    const amountPaid = roundMoney(
      storedPaid !== undefined
        ? storedPaid
        : toNum(bill.grandTotal) - toNum(bill.balanceDue ?? bill.payment?.balanceDue),
    );
    const balanceDue = roundMoney(grandTotal - amountPaid);
    const returns = returnsByInvoice.get(String(bill.invoiceNo)) || { total: 0, balance: 0 };
    const totalReturns = roundMoney(returns.total);
    const closingBalance = roundMoney(balanceDue - returns.balance);
    carried = closingBalance;
    return {
      bill,
      opening: start,
      previousBalance,
      grandTotal,
      amountPaid,
      balanceDue,
      totalReturns,
      closingBalance,
    };
  });
}

/**
 * The previous balance of a bill at its place in the chain: the closing balance of the bill just before it.
 * `target` = { invoiceNo, invoiceDate } of the bill being written or edited; a stored bill with the same number is
 * the bill itself (being edited / overwritten) and is left out. Without a predecessor the bill is the party's first
 * and starts from the party's opening (`null` = the party has no bills at all, the caller decides).
 */
export function previousBalanceAt(bills, kind, target, { returnsByInvoice } = {}) {
  const no = String(target.invoiceNo ?? '').trim();
  const self = no ? bills.find((b) => String(b.invoiceNo).trim() === no) : null;
  const others = self ? bills.filter((b) => b !== self) : bills;
  const opening = partyOpening(bills);
  const rows = computeLedger(others, kind, { returnsByInvoice, opening });
  const probe = pendingKey({ invoiceDate: target.invoiceDate || self?.invoiceDate, invoiceNo: no });
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
  return { previousBalance: opening, previousBill: null, count: 0, totalPreviousBills: 0 };
}

// ------------------------------------------------------------------ party summaries (Customer / Supplier Details, dashboard, statements)
/** What one bill itself charged: subtotal + its opening-balance entry − discount (no carried balance). */
export const billAmount = (bill, kind) =>
  roundMoney(subtotalOf(bill, kind) + toNum(bill.manualPreviousBalance) - kind.discount(bill));
/** Sum of the returns that lower what is owed (not the ones refunded in cash / bank). */
export const balanceReturnsTotal = (returns) =>
  roundMoney((returns || []).filter(isBalanceReturn).reduce((sum, r) => sum + toNum(r.returnAmount), 0));
/**
 * All bills grouped into parties exactly the way the ledger chains them (phone, else a phone-less bill's
 * `ledgerParty` stamp, else the single phone using its name, else its name). Each group: `{ key, phone, name, bills }`
 * with the bills oldest first and `name` / `phone` taken from the latest bill.
 */
export function groupParties(kind, bills) {
  const namePhones = new Map();
  bills.forEach((b) => {
    const bp = normalizePhone(kind.phone(b));
    const n = cleanName(kind.name(b));
    if (!bp || !n) return;
    if (!namePhones.has(n)) namePhones.set(n, new Set());
    namePhones.get(n).add(bp);
  });
  const groups = new Map();
  bills.forEach((b) => {
    const bp = normalizePhone(kind.phone(b));
    const n = cleanName(kind.name(b));
    let key;
    if (bp) key = `p:${bp}`;
    else if (b.ledgerParty !== undefined && b.ledgerParty !== null) {
      const stamped = normalizePhone(b.ledgerParty);
      key = stamped ? `p:${stamped}` : `n:${n}`;
    } else {
      const phones = namePhones.get(n);
      key = phones && phones.size === 1 ? `p:${[...phones][0]}` : `n:${n}`;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  });
  return [...groups.entries()].map(([key, list]) => {
    const ordered = [...list].sort(compareLedgerOrder);
    const latest = ordered[ordered.length - 1];
    const latestWithPhone = [...ordered].reverse().find((b) => String(kind.phone(b) ?? '').trim());
    return {
      key,
      phone: latestWithPhone ? String(kind.phone(latestWithPhone)).trim() : '',
      name: String(kind.name(latest) ?? '').trim(),
      bills: ordered,
    };
  });
}
/**
 * One party's position from its bills: `balance` = what is owed now (closing of the latest bill; negative = advance /
 * credit), `opening`, `billed` (Σ bill amounts, no carried balances), `paid`, `returns` (all) and `balanceReturns`.
 */
export function partySummary(kind, bills, { returnsByInvoice = new Map(), opening } = {}) {
  const rows = computeLedger(bills, kind, { returnsByInvoice, opening });
  const last = rows[rows.length - 1];
  return {
    rows,
    opening: rows.length ? rows[0].opening : roundMoney(opening ?? 0),
    balance: last ? last.closingBalance : roundMoney(opening ?? 0),
    billed: roundMoney(rows.reduce((sum, r) => sum + billAmount(r.bill, kind), 0)),
    paid: roundMoney(rows.reduce((sum, r) => sum + r.amountPaid, 0)),
    returns: roundMoney(rows.reduce((sum, r) => sum + r.totalReturns, 0)),
    balanceReturns: roundMoney(
      rows.reduce((sum, r) => sum + (returnsByInvoice.get(String(r.bill.invoiceNo))?.balance || 0), 0),
    ),
    latest: last ? last.bill : null,
  };
}

// ------------------------------------------------------------------ what to write back
/** Changed derived fields of a sales invoice (null when it is already right). */
export function salesLedgerChanges(row) {
  const { bill } = row;
  const fields = {};
  commonChanges(bill, row, fields);
  return Object.keys(fields).length ? fields : null;
}
/**
 * Changed derived fields of a purchase bill (null when already right). The top-level `balanceDue` is always kept
 * (older readers — and the original web app — read only that one) and the nested `payment.balanceDue` follows.
 */
export function purchaseLedgerChanges(row) {
  const { bill } = row;
  const fields = {};
  commonChanges(bill, row, fields);
  if (bill.payment && typeof bill.payment === 'object' && differs(bill.payment.balanceDue, row.balanceDue))
    fields['payment.balanceDue'] = row.balanceDue;
  return Object.keys(fields).length ? fields : null;
}
function commonChanges(bill, row, fields) {
  if (differs(bill.ledgerOpening, row.opening)) fields.ledgerOpening = row.opening;
  if (differs(bill.previousBalance, row.previousBalance)) fields.previousBalance = row.previousBalance;
  if (differs(bill.grandTotal, row.grandTotal)) fields.grandTotal = row.grandTotal;
  if (differs(bill.balanceDue, row.balanceDue)) fields.balanceDue = row.balanceDue;
  // totalReturns / adjustedBalanceDue: refreshed when present, added only when the bill actually has returns
  const has = bill.totalReturns !== undefined || bill.adjustedBalanceDue !== undefined;
  if (!has && row.totalReturns === 0) return;
  if (differs(bill.totalReturns, row.totalReturns)) fields.totalReturns = row.totalReturns;
  if (differs(bill.adjustedBalanceDue, row.closingBalance)) fields.adjustedBalanceDue = row.closingBalance;
}
