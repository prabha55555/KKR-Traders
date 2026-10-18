/**
 * Purchase returns from the history screen: add (saveReturn), undo one, undo all
 * (purchase-history.js saveReturn / undoReturn / undoAllReturns / getAlreadyReturnedQty).
 */
import { syncSupplierLedgerOf, updatePurchaseBillWithReturns } from '@/core/billing';
import { db } from '@/core/db';
import { PURCHASE_LEDGER } from '@/core/ledger';
import { partyReturnProducts, refundSettlement, validateReturnDraft } from '../lib/returns';
import { userError } from '../lib/types';
/**
 * The document written for one submitted return line (db.savePurchaseReturn adds `id` and the server `createdAt`).
 * `settlement` = lib/returns refundSettlement(): every new return is a refund from the supplier (Cash, or 'bank' +
 * bankAccountId), never a balance adjustment.
 */
export function buildPurchaseReturnRecord(
  invoiceNo,
  supplierName,
  line,
  now,
  settlement = refundSettlement({ refundMethod: 'cash' }),
) {
  const record = {
    invoiceNo,
    supplierName,
    ...line,
    createdAt: now.toISOString(),
  };
  if (settlement.settlementType) record.settlementType = settlement.settlementType;
  if (settlement.refundMethod) record.refundMethod = settlement.refundMethod;
  if (settlement.bankAccountId) record.bankAccountId = settlement.bankAccountId;
  return record;
}
/**
 * Validates the draft (qty left to return over the supplier's bills — the same product list the sheet offered, see
 * partyReturnProducts — and the refund account), then saves one return document per line as a refund, refreshes the
 * bill's totalReturns / adjustedBalanceDue and re-syncs the supplier's ledger. Validation failures are returned (shown
 * inline), unexpected failures throw.
 *
 * The web ran the SALES ledger recomputation (`Utils.updateSubsequentInvoices(supplierName, …)`) here — the wrong
 * ledger; the supplier's own one is re-synced instead.
 */
export async function savePurchaseReturnDraft(invoiceNo, input, now = new Date()) {
  const bill = await db.getPurchaseBill(invoiceNo);
  if (!bill) throw userError('Invoice not found!');
  const [allBills, allReturns] = await Promise.all([db.getAllPurchaseBills(), db.getAllPurchaseReturns()]);
  const { products, invoiceNos } = partyReturnProducts(PURCHASE_LEDGER, allBills, bill);
  const validation = validateReturnDraft({
    returnDate: input.returnDate,
    items: input.items,
    products,
    existingReturns: allReturns.filter((r) => invoiceNos.has(String(r.invoiceNo))),
    refundMethod: input.refundMethod,
    bankAccountId: input.bankAccountId,
  });
  if (!validation.ok) return validation;
  for (const line of validation.lines) {
    await db.savePurchaseReturn(
      buildPurchaseReturnRecord(invoiceNo, bill.supplierName, line, now, validation.settlement),
    );
  }
  await updatePurchaseBillWithReturns(invoiceNo);
  await syncSupplierLedgerOf(invoiceNo);
  return { ok: true, total: validation.total };
}
export async function undoPurchaseReturn(invoiceNo, returnId) {
  await db.deletePurchaseReturn(returnId);
  await updatePurchaseBillWithReturns(invoiceNo);
  await syncSupplierLedgerOf(invoiceNo);
}
/** Returns the number of returns removed, or null when the bill had none. */
export async function undoAllPurchaseReturns(invoiceNo) {
  const returns = await db.getPurchaseReturnsByInvoice(invoiceNo);
  if (returns.length === 0) return null;
  for (const returnItem of returns) await db.deletePurchaseReturn(returnItem.id);
  await updatePurchaseBillWithReturns(invoiceNo);
  await syncSupplierLedgerOf(invoiceNo);
  return returns.length;
}
