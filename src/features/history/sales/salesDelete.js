/** Deleting a sales invoice from history (invoice-history.js deleteInvoice / proceedWithDelete). */
import { db } from '@/core/db';
export const DELETE_BLOCKED_TITLE = 'Action Denied';
export const DELETE_BLOCKED_MESSAGE =
  'Please undo all the payment and return history first before deleting this bill.';
/**
 * An invoice that still has payment or return records cannot be deleted: they must be undone first.
 * If the check itself fails the web logged it and went on to the confirmation dialog; so does this.
 */
export async function hasPaymentOrReturnHistory(invoiceNo) {
  try {
    const payments = await db.getPaymentsByInvoice(invoiceNo);
    const returns = await db.getReturnsByInvoice(invoiceNo);
    return payments.length > 0 || returns.length > 0;
  } catch (error) {
    console.error('Error checking invoice history:', error);
    return false;
  }
}
/**
 * db.deleteInvoice moves the invoice (with its payments/returns) to the recycle bin and re-computes later invoices.
 * WORDING: the web dialog and toast called this "permanent" ("Delete Permanently", "...permanently deleted"), which
 * was wrong — the invoice can be restored from the Recycle Bin — so the mobile/web-app wording says so.
 */
export async function deleteSalesInvoice(invoiceNo) {
  await db.deleteInvoice(invoiceNo);
}
export const deleteSuccessMessage = (invoiceNo) =>
  `Invoice #${invoiceNo} moved to the Recycle Bin — you can restore it from there.`;
