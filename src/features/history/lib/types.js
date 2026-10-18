import { formatInvoiceNo } from '@/core/format';
export const SALES_LABELS = { party: 'Customer', formatInvoiceNo };
/** The invoice number as shown on the history screens: the plain number (core/format formatInvoiceNo). */
export const displayInvoiceNo = (labels, invoiceNo) =>
  labels?.formatInvoiceNo ? labels.formatInvoiceNo(invoiceNo) : formatInvoiceNo(invoiceNo);
export const EMPTY_FILTERS = { search: '', fromInvoiceNo: '', toInvoiceNo: '', fromDate: '', toDate: '' };
export function userError(message) {
  return Object.assign(new Error(message), { userFacing: true });
}
export function isUserError(error) {
  return error instanceof Error && error.userFacing === true;
}
