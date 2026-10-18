/** CSV / JSON export of the customer list — port of `performExport` from js/customer-details.js. */
import { formatDateIN } from '@/core/format';
import { customerBalance } from './aggregate';
export const EXPORT_COLUMN_OPTIONS = [
  { value: 'phone', label: 'Phone Numbers' },
  { value: 'address', label: 'Address' },
  { value: 'invoices', label: 'Invoice Details' },
  { value: 'returns', label: 'Return Information' },
];
/**
 * Header: Customer Name, [Phone], [Address], Total Invoices, Total Amount, Amount Paid, [Returns], Balance Due,
 * Last Invoice, Last Invoice Date.
 * PARITY NOTE: there is no Discount column and the "Invoice Details" checkbox has no effect on CSV (JSON only);
 * numbers are written raw (no rounding), exactly as the web page did.
 */
export function buildCsv(customers, columns) {
  let csv = 'Customer Name';
  if (columns.includes('phone')) csv += ',Phone';
  if (columns.includes('address')) csv += ',Address';
  csv += ',Total Invoices,Total Amount,Amount Paid';
  if (columns.includes('returns')) csv += ',Returns';
  csv += ',Balance Due,Last Invoice,Last Invoice Date\n';
  for (const customer of customers) {
    const row = [`"${customer.name.replace(/"/g, '""')}"`];
    // PARITY NOTE: the phone is quoted without escaping (phones hold no quotes in practice)
    if (columns.includes('phone')) row.push(`"${customer.phone || 'N/A'}"`);
    if (columns.includes('address')) row.push(`"${(customer.address || 'N/A').replace(/"/g, '""')}"`);
    row.push(customer.totalInvoices, customer.totalCurrentBillAmount, customer.amountPaid);
    if (columns.includes('returns')) row.push(customer.totalReturns);
    row.push(
      customerBalance(customer),
      customer.lastInvoiceNo || 'N/A',
      customer.lastInvoiceDate ? formatDateIN(customer.lastInvoiceDate) : 'N/A',
    );
    csv += `${row.join(',')}\n`;
  }
  return csv;
}
export function buildJson(customers, columns) {
  const data = customers.map((customer) => {
    const entry = {
      name: customer.name,
      totalInvoices: customer.totalInvoices,
      totalAmount: customer.totalCurrentBillAmount,
      amountPaid: customer.amountPaid,
      balanceDue: customerBalance(customer),
      ...(customer.lastInvoiceNo ? { lastInvoiceNo: customer.lastInvoiceNo } : {}),
      ...(customer.lastInvoiceDate ? { lastInvoiceDate: customer.lastInvoiceDate } : {}),
    };
    if (columns.includes('phone')) entry.phone = customer.phone;
    if (columns.includes('address')) entry.address = customer.address;
    if (columns.includes('returns')) entry.returns = customer.totalReturns;
    if (columns.includes('invoices')) entry.invoiceNumbers = customer.allInvoiceNumbers;
    return entry;
  });
  return JSON.stringify(data, null, 2);
}
/**
 * PARITY NOTE: the file prefix is still the shop's old name ("PR_Fabrics"); kept so exports stay recognisable next to the
 * web ones. `dateISO` is the local date (the web used the UTC date from toISOString()).
 */
export function exportFileName(format, dateISO) {
  return `PR_Fabrics_Customers_${dateISO}.${format}`;
}
export function buildExport(customers, format, columns, dateISO) {
  if (format === 'csv') {
    return {
      fileName: exportFileName('csv', dateISO),
      mimeType: 'text/csv',
      uti: 'public.comma-separated-values-text',
      content: buildCsv(customers, columns),
    };
  }
  return {
    fileName: exportFileName('json', dateISO),
    mimeType: 'application/json',
    uti: 'public.json',
    content: buildJson(customers, columns),
  };
}
