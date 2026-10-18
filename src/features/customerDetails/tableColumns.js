/** Column layout of the desktop table: the same ten columns, in the same order, as the web page's `<table>`. */
// Sized for a dense DataTable (8px cell padding, 10px wrapping headers) so all ten columns fit the ~966px content area
// of a 1280px window (1280 - 248 sidebar - 64 padding) without scrolling. Amount columns hold ₹12,34,567.00; name and
// address share what is left (the table scrolls sideways only when they would get less than ~96px per flex unit).
export const CUSTOMER_COLUMNS = [
  { key: 'name', header: 'Customer Name', flex: 1 },
  { key: 'phone', header: 'Phone', width: 80 },
  { key: 'address', header: 'Address', flex: 1.2 },
  { key: 'invoices', header: 'Total Invoices', width: 76, align: 'right' },
  { key: 'amount', header: 'Total Amount', width: 100, align: 'right' },
  { key: 'paid', header: 'Amount Paid', width: 100, align: 'right' },
  { key: 'discount', header: 'Discount', width: 80, align: 'right' },
  { key: 'returns', header: 'Returns', width: 80, align: 'right' },
  { key: 'balance', header: 'Balance Due', width: 100, align: 'right' },
  { key: 'reminder', header: 'WhatsApp Reminder', width: 104, align: 'center' },
];
export const FIXED_COLUMNS_WIDTH = CUSTOMER_COLUMNS.reduce((sum, c) => sum + (c.width ?? 0), 0);
