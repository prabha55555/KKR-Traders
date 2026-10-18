/** Supplier Details page — port of js/supplier-details.js (aggregation, stats, search, phone masking, CSV export). */
import { digitsOnly, toNum } from '@/core/format';
function cleanInvoiceNo(invoiceNo) {
  let inv = invoiceNo.toString();
  if (inv.startsWith('P-')) inv = inv.substring(2);
  const num = parseInt(inv, 10);
  return Number.isNaN(num) ? inv : String(num).padStart(3, '0');
}
/**
 * processSupplierData: purchase bills grouped by trimmed supplier name (the suppliers collection is not used).
 * Phone/address come from the first bill seen — the newest, as getAllPurchaseBills sorts by timestamp desc.
 *
 * PARITY NOTE: paid / balance read `payment?.x || top-level x`, so a nested balanceDue of 0 falls back to the top-level
 * field — unlike billing.purchaseBalanceDue (`!== undefined`). Bills written by this app keep both in sync, so the
 * results only differ for stale legacy documents. `discount` is read without the `discountAmount` fallback history uses.
 */
export function aggregateSuppliers(bills, returns = [], directorySuppliers = []) {
  if ((!bills || !Array.isArray(bills)) && (!directorySuppliers || !Array.isArray(directorySuppliers)))
    return [];
  const returnedByInvoice = new Map();
  if (Array.isArray(returns)) {
    for (const r of returns) {
      const key = String(r.invoiceNo);
      returnedByInvoice.set(key, (returnedByInvoice.get(key) ?? 0) + toNum(r.returnAmount));
    }
  }
  const bySupplier = new Map();

  if (Array.isArray(directorySuppliers)) {
    for (const ds of directorySuppliers) {
      if (!ds || !ds.name) continue;
      const key = ds.name.trim();
      if (!key) continue;
      bySupplier.set(key, {
        name: key,
        phone: ds.phone || '',
        address: ds.address || '',
        totalBills: 0,
        totalAmount: 0,
        totalPaid: 0,
        totalDiscount: 0,
        totalReturns: 0,
        totalManualAdjustments: 0,
        firstBillPreviousBalance: 0,
        firstBillNo: undefined,
        allInvoiceNumbers: [],
        invoiceNos: [],
        latestBalanceDue: 0,
        lastInvoiceDate: null,
        balanceDue: 0,
      });
    }
  }

  if (Array.isArray(bills)) {
    bills.forEach((bill) => {
      if (!bill || !bill.supplierName) return;
      const key = bill.supplierName.trim();
      if (!key) return;
      let s = bySupplier.get(key);
      if (!s) {
        s = {
          name: key,
          phone: bill.supplierPhone || '',
          address: bill.supplierAddress || '',
          totalBills: 0,
          totalAmount: 0,
          totalPaid: 0,
          totalDiscount: 0,
          totalReturns: 0,
          totalManualAdjustments: 0,
          firstBillPreviousBalance: 0,
          firstBillNo: undefined,
          allInvoiceNumbers: [],
          invoiceNos: [],
          latestBalanceDue: 0,
          lastInvoiceDate: null,
          balanceDue: 0,
        };
        bySupplier.set(key, s);
      }
      if (!s.phone && bill.supplierPhone) s.phone = bill.supplierPhone;
      if (!s.address && bill.supplierAddress) s.address = bill.supplierAddress;
      s.totalBills++;
      s.totalAmount += toNum(bill.grandTotal);
      s.totalPaid += toNum(bill.payment?.totalPaid || bill.amountPaid);
      s.totalDiscount += toNum(bill.discount !== undefined ? bill.discount : bill.discountAmount || 0);
      s.balanceDue += toNum(bill.payment?.balanceDue || bill.balanceDue);
      s.totalManualAdjustments += toNum(bill.manualPreviousBalance);

      if (bill.invoiceNo) {
        const cleanNo = cleanInvoiceNo(bill.invoiceNo);
        s.allInvoiceNumbers.push(cleanNo);
        s.invoiceNos.push(cleanNo);
        const numVal = parseInt(cleanNo, 10);
        if (s.firstBillNo === undefined || numVal < s.firstBillNo) {
          s.firstBillNo = numVal;
          s.firstBillPreviousBalance = toNum(bill.previousBalance);
        }
      }
      if (bill.invoiceDate) {
        const dVal = new Date(bill.invoiceDate).getTime();
        if (!s.lastInvoiceDate || dVal > new Date(s.lastInvoiceDate).getTime()) {
          s.lastInvoiceDate = bill.invoiceDate;
          s.latestBalanceDue = toNum(bill.payment?.balanceDue || bill.balanceDue);
        }
      }
    });
  }

  const suppliers = Array.from(bySupplier.values());
  for (const s of suppliers) {
    s.allInvoiceNumbers.sort((a, b) => parseInt(b) - parseInt(a));
    s.invoiceNos.sort((a, b) => parseInt(b) - parseInt(a));
    s.totalReturns = 0;
    for (const invoiceNo of s.allInvoiceNumbers) {
      s.totalReturns += returnedByInvoice.get(String(invoiceNo)) ?? 0;
    }
    s.balanceDue = Math.max(0, s.balanceDue - s.totalReturns);
  }
  return suppliers.sort((a, b) => a.name.localeCompare(b.name));
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
  'Invoice Numbers',
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
