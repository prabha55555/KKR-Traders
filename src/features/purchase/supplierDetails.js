/** Supplier Details page — port of js/supplier-details.js (aggregation, stats, search, phone masking, CSV export). */
import { digitsOnly, toNum } from '@/core/format';
import {
  groupParties,
  normalizePhone,
  PURCHASE_LEDGER,
  partySummary,
  returnsTotalsByInvoice,
  roundMoney,
} from '@/core/ledger';
function cleanInvoiceNo(invoiceNo) {
  let inv = invoiceNo.toString();
  if (inv.startsWith('P-')) inv = inv.substring(2);
  const num = parseInt(inv, 10);
  return Number.isNaN(num) ? inv : String(num).padStart(3, '0');
}
const emptySupplier = (key, name, phone, address) => ({
  key,
  name,
  phone,
  address,
  totalBills: 0,
  totalAmount: 0,
  totalPaid: 0,
  totalDiscount: 0,
  totalReturns: 0,
  openingBalance: 0,
  totalManualAdjustments: 0,
  allInvoiceNumbers: [],
  invoiceNos: [],
  lastInvoiceDate: null,
  balanceDue: 0,
});
/** The party key a directory supplier would get from groupParties (phone first, else the name). */
const nameKey = (name) =>
  `n:${String(name ?? '')
    .trim()
    .toLowerCase()}`;
const directoryKey = (ds) => {
  const phone = normalizePhone(ds.phone);
  return phone ? `p:${phone}` : nameKey(ds.name);
};
/**
 * processSupplierData, on the supplier LEDGER: purchase bills grouped into parties exactly as the ledger chains them
 * (phone first — two suppliers sharing a name stay apart, one supplier typed two ways stays together), plus the
 * suppliers of the directory that have no bill yet.
 *  - balanceDue    = what is owed now: the ledger closing of the latest bill (carried balances counted once, only
 *                    balance-settled returns lower it, negative = an advance / credit with the supplier)
 *  - totalAmount   = Σ the bills' subtotals (before discount, no opening-balance entries, no carried balance) — like Customer Details
 *  - openingBalance = the supplier's ledger opening; the page shows it plus totalManualAdjustments (the bills' opening-balance entries),
 *                    so opening + amount − discount − paid − balance returns = balance
 *  - totalPaid     = Σ the stored paid amounts · totalReturns = every return (refunds included)
 * Name / phone / address come from the supplier's latest bill (address falls back to older bills, then the directory).
 */
export function aggregateSuppliers(bills, returns = [], directorySuppliers = []) {
  const billList = (Array.isArray(bills) ? bills : []).filter(
    (b) =>
      b && (String(PURCHASE_LEDGER.name(b) ?? '').trim() || String(PURCHASE_LEDGER.phone(b) ?? '').trim()),
  );
  const directory = (Array.isArray(directorySuppliers) ? directorySuppliers : []).filter(
    (ds) => ds && String(ds.name ?? '').trim(),
  );
  const directoryByKey = new Map(directory.map((ds) => [directoryKey(ds), ds]));
  const returnsByInvoice = returnsTotalsByInvoice(Array.isArray(returns) ? returns : []);
  const bySupplier = new Map();

  groupParties(PURCHASE_LEDGER, billList).forEach((group) => {
    const newestFirst = [...group.bills].reverse();
    const listed = directoryByKey.get(group.key);
    const name =
      group.name ||
      newestFirst.map((b) => String(b.supplierName ?? '').trim()).find(Boolean) ||
      String(listed?.name ?? '').trim() ||
      group.phone;
    const address =
      newestFirst.map((b) => String(b.supplierAddress ?? '').trim()).find(Boolean) ||
      String(listed?.address ?? '').trim();
    const s = emptySupplier(group.key, name, group.phone || listed?.phone || '', address);
    const summary = partySummary(PURCHASE_LEDGER, group.bills, { returnsByInvoice });
    s.totalBills = group.bills.length;
    // same definitions as Customer Details: Amount = the bills' subtotals (before discount, without the opening-balance
    // entries typed on bills) and those entries are shown in Opening, so Opening + Amount - Paid - Discount - returns
    // reconciles with the unchanged ledger balance
    s.totalDiscount = roundMoney(group.bills.reduce((sum, b) => sum + PURCHASE_LEDGER.discount(b), 0));
    s.totalManualAdjustments = roundMoney(
      group.bills.reduce((sum, b) => sum + toNum(b.manualPreviousBalance), 0),
    );
    s.totalAmount = roundMoney(summary.billed + s.totalDiscount - s.totalManualAdjustments);
    s.totalPaid = summary.paid;
    s.totalReturns = summary.returns;
    s.openingBalance = summary.opening;
    s.balanceDue = summary.balance;
    s.lastInvoiceDate = summary.latest?.invoiceDate || null;
    group.bills.forEach((bill) => {
      if (bill.invoiceNo) s.allInvoiceNumbers.push(cleanInvoiceNo(bill.invoiceNo));
    });
    s.allInvoiceNumbers.sort((a, b) => parseInt(b) - parseInt(a));
    s.invoiceNos = [...s.allInvoiceNumbers];
    bySupplier.set(group.key, s);
  });

  // suppliers saved in the directory without any bill yet
  directory.forEach((ds) => {
    const key = directoryKey(ds);
    if (bySupplier.has(key)) return;
    // only phone-less bills under this name (and no phone claimed them yet): they are this supplier's
    const byName = bySupplier.get(nameKey(ds.name));
    if (byName && !byName.phone) {
      byName.phone = ds.phone || '';
      if (!byName.address) byName.address = String(ds.address ?? '').trim();
      return;
    }
    bySupplier.set(key, emptySupplier(key, ds.name.trim(), ds.phone || '', ds.address || ''));
  });

  return Array.from(bySupplier.values()).sort((a, b) => a.name.localeCompare(b.name));
}
export function supplierStats(suppliers) {
  const sum = (pick) => suppliers.reduce((total, s) => total + pick(s), 0);
  const totalReturns = sum((s) => s.totalReturns || 0);
  const stats = {
    totalSuppliers: suppliers.length,
    totalBills: sum((s) => s.totalBills),
    totalAmount: sum((s) => s.totalAmount),
    totalPaid: sum((s) => s.totalPaid),
    totalDiscount: sum((s) => s.totalDiscount),
    // net of advances: a supplier holding a credit lowers the total owed
    totalBalance: sum((s) => s.balanceDue),
  };
  if (totalReturns > 0) {
    stats.totalReturns = totalReturns;
  }
  return stats;
}
/** doSearch: case-insensitive substring match on name, phone or address. */
export function filterSuppliers(suppliers, query) {
  const q = query.toLowerCase().trim();
  if (!q) return suppliers;
  return suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q),
  );
}
/** formatPhoneNumber: digits only, everything but the last 3 masked. */
export function maskPhone(phone) {
  if (!phone) return 'N/A';
  const clean = digitsOnly(phone);
  if (clean.length <= 3) return clean;
  return '*'.repeat(clean.length - 3) + clean.slice(-3);
}
/** What a tap on the masked number reveals (togglePhoneNumber). */
export const revealedPhone = (phone) => digitsOnly(phone);
const CSV_HEADERS = [
  'Supplier Name',
  'Phone',
  'Address',
  'Total Bills',
  'Total Amount',
  'Amount Paid',
  'Discount',
  'Balance Due',
  'Invoice Nos',
];
/** exportCSV */
export function buildSuppliersCsv(suppliers) {
  const rows = suppliers.map((s) => [
    s.name || '',
    s.phone || '',
    s.address || '',
    s.totalBills || 0,
    (s.totalAmount || 0).toFixed(2),
    (s.totalPaid || 0).toFixed(2),
    (s.totalDiscount || 0).toFixed(2),
    (s.balanceDue || 0).toFixed(2),
    (s.invoiceNos || s.allInvoiceNumbers || []).join('; '),
  ]);
  return [CSV_HEADERS, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
export const suppliersCsvFileName = (dateISO) => `supplier-details-${dateISO}.csv`;
