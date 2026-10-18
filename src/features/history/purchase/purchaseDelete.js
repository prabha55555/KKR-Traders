/** Deleting a purchase bill from history (purchase-history.js window.deletePurchaseBill / proceedWithDelete). */
import { db } from '@/core/db';
import { PURCHASE_LABELS } from './purchaseModel';
export { DELETE_BLOCKED_MESSAGE, DELETE_BLOCKED_TITLE } from '../sales/salesDelete';
/** 'P-5' / '5' -> '005': the zero-padded number older bills were also stored under (payments / returns are looked up under both). */
export function paddedInvoiceNo(invoiceNo) {
  let clean = String(invoiceNo);
  if (clean.startsWith('P-')) clean = clean.substring(2);
  return String(parseInt(clean, 10) || clean).padStart(3, '0');
}
/**
 * A bill that still has payment or return records cannot be deleted: they must be undone first. Records are looked up
 * under the stored number AND its padded form. If the check itself fails the web logged it and went on to the
 * confirmation dialog; so does this.
 */
export async function hasPurchasePaymentOrReturnHistory(invoiceNo) {
  const clean = paddedInvoiceNo(invoiceNo);
  try {
    const payments = await db.getPurchasePaymentsByInvoice(invoiceNo);
    const cleanPayments = await db.getPurchasePaymentsByInvoice(clean);
    const returns = await db.getPurchaseReturnsByInvoice(invoiceNo);
    const cleanReturns = await db.getPurchaseReturnsByInvoice(clean);
    return payments.length > 0 || cleanPayments.length > 0 || returns.length > 0 || cleanReturns.length > 0;
  } catch (error) {
    console.error('Error checking purchase history:', error);
    return false;
  }
}
/**
 * db.deletePurchaseBill moves the bill (with its payments) to the PURCHASE recycle bin.
 * PARITY NOTE: like the sales dialog, the web's wording calls this "permanent" although the bill can be restored.
 */
export async function deletePurchaseBill(invoiceNo) {
  await db.deletePurchaseBill(invoiceNo);
}
export const purchaseDeleteSuccessMessage = (invoiceNo) =>
  `Invoice #${PURCHASE_LABELS.formatInvoiceNo?.(invoiceNo) ?? invoiceNo} and all related data have been permanently deleted.`;
