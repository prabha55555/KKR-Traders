import { calculatePreviousBalanceAtTime } from '@/core/billing';
import { loadSalesBillForEditing } from '@/core/services/salesBill';
import { loadedBillSession } from './billSession';
import { roundMoney } from './customerLookup';
/**
 * script.js loadInvoiceForEditing: turns a stored invoice into an editable session.
 * Returns null when the invoice does not exist ('Invoice not found!'); throws on a read failure.
 */
export async function openInvoiceForEditing(invoiceNo) {
  const loaded = await loadSalesBillForEditing(invoiceNo);
  if (!loaded) return null;
  // Always taken from the customer's ledger (the web used the stored figure, which went stale whenever an earlier
  // bill changed — the user had to re-save bills by hand). Falls back to the stored figure if the lookup fails.
  const { customerName, customerPhone, invoiceNo: no, invoiceDate } = loaded.form;
  const carried =
    customerName || customerPhone
      ? await calculatePreviousBalanceAtTime(customerName, customerPhone, no, invoiceDate)
      : { failed: true };
  const previousBalance = roundMoney(
    carried.failed ? (loaded.invoice.previousBalance ?? 0) : carried.balanceCarriedForward,
  );
  return loadedBillSession({ ...loaded.form, previousBalance }, invoiceNo);
}
