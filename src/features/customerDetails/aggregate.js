/**
 * Customer aggregation for the Customer Details screen — port of `processCustomerData`, `updateStatistics` and
 * `searchCustomers` from js/customer-details.js.
 *
 * Customers are derived from the sales invoices, grouped into parties exactly the way the ledger chains them (phone
 * first — see core/ledger `groupParties`), so two customers sharing a name are never merged and one customer typed
 * as 'Ravi' / 'ravi ' is never split. The balance is the ledger's: the closing balance of the party's latest bill
 * (`partySummary(...).balance`), where returns refunded in cash / bank do not lower what is owed. Payments are not
 * read separately — each invoice's stored `amountPaid` is used.
 */
import { toNum } from '@/core/format';
import {
  SALES_LEDGER,
  groupParties,
  normalizePhone,
  partySummary,
  returnsTotalsByInvoice,
  roundMoney,
} from '@/core/ledger';

const invoiceNumberValue = (invoiceNo) => parseInt(String(invoiceNo), 10) || 0;
const cleanName = (n) =>
  String(n ?? '')
    .trim()
    .toLowerCase();

/** A row with no invoices (a directory customer who was never billed). */
function emptyCustomer(name, phone, address, opening) {
  return {
    name,
    phone,
    address,
    totalInvoices: 0,
    totalCurrentBillAmount: 0,
    amountPaid: 0,
    totalDiscountAmount: 0,
    totalReturns: 0,
    totalManualAdjustments: 0,
    openingBalance: opening,
    firstInvoicePreviousBalance: opening,
    allInvoiceNumbers: [],
    balance: opening,
    lastInvoiceDate: undefined,
    lastInvoiceNo: undefined,
  };
}

/** One ledger party -> its Customer Details row. */
function partyRow(group, returnsByInvoice) {
  const { bills } = group;
  const summary = partySummary(SALES_LEDGER, bills, { returnsByInvoice });
  const discount = roundMoney(bills.reduce((sum, b) => sum + SALES_LEDGER.discount(b), 0));
  const manual = roundMoney(bills.reduce((sum, b) => sum + toNum(b.manualPreviousBalance), 0));
  const newestFirst = [...bills].reverse();
  const address = newestFirst.find((b) => String(b.customerAddress ?? '').trim())?.customerAddress ?? '';
  const latest = summary.latest;
  return {
    name: group.name,
    phone: group.phone,
    address: String(address).trim(),
    totalInvoices: bills.length,
    // the bills' own amounts before discount (Σ billAmount + discount − opening-balance entries): never grandTotal,
    // which carries the previous balance
    totalCurrentBillAmount: roundMoney(summary.billed + discount - manual),
    amountPaid: summary.paid,
    totalDiscountAmount: discount,
    totalReturns: summary.returns,
    totalManualAdjustments: manual,
    openingBalance: summary.opening,
    // kept for older readers: the party's opening (not the lowest-numbered bill's carried balance)
    firstInvoicePreviousBalance: summary.opening,
    allInvoiceNumbers: bills
      .map((b) => b.invoiceNo)
      .filter((no) => no !== undefined && no !== null && no !== '')
      .sort((a, b) => invoiceNumberValue(b) - invoiceNumberValue(a)),
    balance: summary.balance,
    // latest bill in ledger order (date, then number); a party whose bills carry no date has no "last invoice"
    lastInvoiceDate: latest?.invoiceDate || undefined,
    lastInvoiceNo: latest?.invoiceDate ? latest.invoiceNo || undefined : undefined,
  };
}

/**
 * One row per customer. `directoryCustomers` (the `customers` collection) adds customers who have no invoice yet
 * (their balance is their opening balance) and fills a missing phone / address of a billed one.
 */
export function buildCustomerSummaries(invoices, returns, directoryCustomers = []) {
  if (!Array.isArray(invoices) && !Array.isArray(directoryCustomers)) return [];
  // invoices without a customer name are skipped entirely (they count towards nothing)
  const named = (Array.isArray(invoices) ? invoices : []).filter(
    (invoice) => invoice && String(invoice.customerName ?? '').trim(),
  );
  const returnsByInvoice = returnsTotalsByInvoice(returns);
  const rows = groupParties(SALES_LEDGER, named).map((group) => partyRow(group, returnsByInvoice));

  const used = new Set();
  const seeded = [];
  for (const dc of Array.isArray(directoryCustomers) ? directoryCustomers : []) {
    const name = String(dc?.name ?? '').trim();
    if (!name) continue;
    const phone = normalizePhone(dc.phone);
    const match = rows.find(
      (r) =>
        !used.has(r) &&
        (phone ? normalizePhone(r.phone) === phone : !r.phone && cleanName(r.name) === cleanName(name)),
    );
    if (match) {
      used.add(match);
      if (!match.phone && dc.phone) match.phone = dc.phone;
      if (!match.address && dc.address) match.address = dc.address;
      seeded.push(match);
    } else {
      seeded.push(emptyCustomer(name, dc.phone || '', dc.address || '', roundMoney(dc.openingBalance)));
    }
  }
  return [...seeded, ...rows.filter((r) => !used.has(r))];
}

/**
 * Outstanding balance of one customer: the ledger closing balance computed by buildCustomerSummaries (may be negative
 * = advance). A row built elsewhere without it falls back to bill amounts + opening − paid − returns − discounts.
 * The list, the export, the stat cards and the reminder all use this.
 */
export function customerBalance(customer) {
  if (typeof customer.balance === 'number' && Number.isFinite(customer.balance)) return customer.balance;
  return (
    (customer.totalCurrentBillAmount || 0) +
    (customer.firstInvoicePreviousBalance || 0) +
    (customer.totalManualAdjustments || 0) -
    (customer.amountPaid || 0) -
    (customer.totalReturns || 0) -
    (customer.totalDiscountAmount || 0)
  );
}
/** The six stat cards (+ the dynamic "Total Returns" card) computed over whatever list is currently shown. */
export function computeStats(customers) {
  const sum = (pick) => roundMoney(customers.reduce((total, c) => total + toNum(pick(c)), 0));
  return {
    totalCustomers: customers.length,
    totalInvoices: customers.reduce((total, c) => total + c.totalInvoices, 0),
    totalCurrentBillAmount: sum((c) => c.totalCurrentBillAmount),
    totalPaid: sum((c) => c.amountPaid),
    totalReturns: sum((c) => c.totalReturns),
    totalDiscountAmount: sum((c) => c.totalDiscountAmount),
    pendingBalance: sum(customerBalance),
  };
}
/**
 * Search box filter: name, phone (raw, un-normalised substring), address — and, undocumented in the UI, any invoice number.
 * An empty / whitespace-only term returns the list untouched.
 */
export function filterCustomers(customers, rawTerm) {
  const term = rawTerm.trim().toLowerCase();
  if (!term) return customers;
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(term) ||
      (!!c.phone && c.phone.includes(term)) ||
      (!!c.address && c.address.toLowerCase().includes(term)) ||
      c.allInvoiceNumbers.some((no) => String(no).toLowerCase().includes(term)),
  );
}
