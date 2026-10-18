export const SALES_LABELS = { party: 'Customer' };
export const displayInvoiceNo = (labels, invoiceNo) =>
  labels.formatInvoiceNo ? labels.formatInvoiceNo(invoiceNo) : invoiceNo;
export const EMPTY_FILTERS = { search: '', fromInvoiceNo: '', toInvoiceNo: '', fromDate: '', toDate: '' };
export function userError(message) {
  return Object.assign(new Error(message), { userFacing: true });
}
export function isUserError(error) {
  return error instanceof Error && error.userFacing === true;
}
