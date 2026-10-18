/**
 * Customer aggregation for the Customer Details screen — port of `processCustomerData`, `updateStatistics` and
 * `searchCustomers` from js/customer-details.js.
 *
 * Customers are NOT read from the `customers` collection: the page derives them from the sales invoices, grouped by the
 * exact `customerName` string, and subtracts returns (`returns` collection, matched by invoice number). Payments are not
 * read separately — each invoice's own `amountPaid` is summed.
 */
import { toNum } from '@/core/format';
const invoiceNumberValue = (invoiceNo) => parseInt(String(invoiceNo), 10) || 0;
const dateValue = (date) => new Date(date).getTime();
/**
 * PARITY NOTE: `balanceDue` / `adjustedBalanceDue` (last invoice's balance minus returns) and the grand-total sum are
 * computed by the web page but never displayed or exported, so they are not part of the summary here.
 */
export function buildCustomerSummaries(invoices, returns, directoryCustomers = []) {
  if (!Array.isArray(invoices) && !Array.isArray(directoryCustomers)) return [];
  const byName = new Map();

  // First seed with master customer directory if provided
  if (Array.isArray(directoryCustomers)) {
    for (const dc of directoryCustomers) {
      if (!dc || !dc.name) continue;
      const key = dc.name.trim();
      if (!key) continue;
      const openingBal = toNum(dc.openingBalance);
      byName.set(key, {
        name: key,
        phone: dc.phone || '',
        address: dc.address || '',
        totalInvoices: 0,
        totalCurrentBillAmount: 0,
        amountPaid: 0,
        totalDiscountAmount: 0,
        totalReturns: 0,
        totalManualAdjustments: 0,
        firstInvoicePreviousBalance: openingBal,
        firstInvoiceNo: undefined,
        allInvoiceNumbers: [],
        latestBalanceDue: openingBal,
        lastInvoiceDate: undefined,
        lastInvoiceNo: undefined,
      });
    }
  }

  if (Array.isArray(invoices)) {
    for (const invoice of invoices) {
      // invoices without a customer name are skipped entirely (they count towards nothing)
      if (!invoice || !invoice.customerName) continue;
      const key = invoice.customerName.trim();
      if (!key) continue;
      let customer = byName.get(key);
      if (!customer) {
        customer = {
          name: key,
          phone: invoice.customerPhone || '',
          address: invoice.customerAddress || '',
          totalInvoices: 0,
          totalCurrentBillAmount: 0,
          amountPaid: 0,
          totalDiscountAmount: 0,
          totalReturns: 0,
          totalManualAdjustments: 0,
          firstInvoicePreviousBalance: 0,
          firstInvoiceNo: undefined,
          allInvoiceNumbers: [],
          latestBalanceDue: 0,
          lastInvoiceDate: undefined,
          lastInvoiceNo: undefined,
        };
        byName.set(key, customer);
      }
      if (!customer.phone && invoice.customerPhone) customer.phone = invoice.customerPhone;
      if (!customer.address && invoice.customerAddress) customer.address = invoice.customerAddress;
      customer.totalInvoices += 1;
      customer.totalCurrentBillAmount += toNum(invoice.subtotal);
      customer.amountPaid += toNum(invoice.amountPaid);
      customer.totalDiscountAmount += toNum(invoice.discountAmount);
      customer.totalManualAdjustments += toNum(invoice.manualPreviousBalance);

      if (invoice.invoiceNo) {
        customer.allInvoiceNumbers.push(invoice.invoiceNo);
        const numVal = invoiceNumberValue(invoice.invoiceNo);
        if (customer.firstInvoiceNo === undefined || numVal < customer.firstInvoiceNo) {
          customer.firstInvoiceNo = numVal;
          customer.firstInvoicePreviousBalance = toNum(invoice.previousBalance);
        }
      }
      if (invoice.invoiceDate) {
        const dVal = dateValue(invoice.invoiceDate);
        if (!customer.lastInvoiceDate || dVal > dateValue(customer.lastInvoiceDate)) {
          customer.lastInvoiceDate = invoice.invoiceDate;
          customer.lastInvoiceNo = invoice.invoiceNo;
          customer.latestBalanceDue = toNum(invoice.balanceDue);
        }
      }
    }
  }
  const returnedByInvoice = new Map();
  for (const r of returns) {
    const key = String(r.invoiceNo);
    returnedByInvoice.set(key, (returnedByInvoice.get(key) ?? 0) + toNum(r.returnAmount));
  }
  const customers = Array.from(byName.values());
  for (const customer of customers) {
    customer.allInvoiceNumbers.sort((a, b) => invoiceNumberValue(b) - invoiceNumberValue(a));
    // summed per invoice in the same (newest-first) order as the web page so floating-point results match
    customer.totalReturns = 0;
    for (const invoiceNo of customer.allInvoiceNumbers) {
      customer.totalReturns += returnedByInvoice.get(String(invoiceNo)) ?? 0;
    }
  }
  return customers;
}
/**
 * Outstanding balance of one customer: bill amounts - paid - returns - discounts.
 * The web list, the export and the stat cards all use this; the reminder dialog used a variant without the discount
 * (see reminder.ts).
 */
export function customerBalance(customer) {
  if (
    customer.latestBalanceDue !== undefined &&
    (customer.firstInvoicePreviousBalance || customer.totalManualAdjustments)
  ) {
    return customer.latestBalanceDue - (customer.totalReturns || 0);
  }
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
  const totalInvoices = customers.reduce((sum, c) => sum + c.totalInvoices, 0);
  const totalCurrentBillAmount = customers.reduce((sum, c) => sum + c.totalCurrentBillAmount, 0);
  const totalPaid = customers.reduce((sum, c) => sum + c.amountPaid, 0);
  const totalReturns = customers.reduce((sum, c) => sum + c.totalReturns, 0);
  const totalDiscountAmount = customers.reduce((sum, c) => sum + c.totalDiscountAmount, 0);
  return {
    totalCustomers: customers.length,
    totalInvoices,
    totalCurrentBillAmount,
    totalPaid,
    totalReturns,
    totalDiscountAmount,
    pendingBalance: customers.reduce((sum, c) => sum + customerBalance(c), 0),
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
