/**
 * Purchase returns from the history screen: add (saveReturn), undo one, undo all
 * (purchase-history.js saveReturn / undoReturn / undoAllReturns / getAlreadyReturnedQty).
 */
import {
  calculateTotalPurchaseReturns,
  purchaseBalanceDue,
  syncSupplierLedgerOf,
  updatePurchaseBillWithReturns,
} from '@/core/billing';
import { db } from '@/core/db';
import { validateReturnDraft } from '../lib/returns';
import { userError } from '../lib/types';
/** The document written for one submitted return line (db.savePurchaseReturn adds `id` and the server `createdAt`). */
export function buildPurchaseReturnRecord(invoiceNo, supplierName, line, now, settlement = {}) {
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
 * Validates the draft against the bill (qty left to return, balance), then saves one return document per line,
 * refreshes the bill's totalReturns / adjustedBalanceDue and re-syncs the supplier's ledger (the later bills carry the
 * reduced balance). Validation failures are returned (shown inline), unexpected failures throw.
 *
 * The web ran the SALES ledger recomputation (`Utils.updateSubsequentInvoices(supplierName, …)`) here — the wrong
 * ledger; the supplier's own one is re-synced instead.
 */
export async function savePurchaseReturnDraft(invoiceNo, input, now = new Date()) {
  const bill = await db.getPurchaseBill(invoiceNo);
  if (!bill) throw userError('Invoice not found!');
  const existingReturns = await db.getPurchaseReturnsByInvoice(invoiceNo);
  const currentReturns = await calculateTotalPurchaseReturns(invoiceNo);
  const validation = validateReturnDraft({
    returnDate: input.returnDate,
    items: input.items,
    products: bill.products ?? [],
    existingReturns,
    currentBalance: purchaseBalanceDue(bill) - currentReturns,
    settlementType: input.settlementType,
  });
  if (!validation.ok) return validation;
  const settlement = {};
  if (input.settlementType) settlement.settlementType = input.settlementType;
  if (input.refundMethod) settlement.refundMethod = input.refundMethod;
  if (input.bankAccountId) settlement.bankAccountId = input.bankAccountId;
  for (const line of validation.lines) {
    await db.savePurchaseReturn(
      buildPurchaseReturnRecord(invoiceNo, bill.supplierName, line, now, settlement),
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
