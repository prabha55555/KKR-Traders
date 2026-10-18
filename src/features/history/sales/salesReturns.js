/**
 * Sales returns from the history screen: add (saveReturn), undo one, undo all
 * (invoice-history.js saveReturn / undoReturn / undoAllReturns / getAlreadyReturnedQty).
 */
import { calculateTotalReturns, updateInvoiceWithReturns, updateSubsequentInvoices } from '@/core/billing';
import { db } from '@/core/db';
import { validateReturnDraft } from '../lib/returns';
import { userError } from '../lib/types';
/** The documents written for one submitted return line (db.saveReturn adds `id` and the server `createdAt`). */
export function buildReturnRecord(invoiceNo, customerName, line, now, settlement = {}) {
  const record = {
    invoiceNo,
    customerName,
    ...line,
    createdAt: now.toISOString(),
  };
  if (settlement.settlementType) record.settlementType = settlement.settlementType;
  if (settlement.refundMethod) record.refundMethod = settlement.refundMethod;
  if (settlement.bankAccountId) record.bankAccountId = settlement.bankAccountId;
  return record;
}
/**
 * Validates the draft against the invoice (qty left to return, balance), then saves one return document per line,
 * refreshes the invoice's totalReturns / adjustedBalanceDue and re-computes the customer's later invoices.
 * Validation failures are returned (shown inline), unexpected failures throw.
 */
export async function saveSalesReturn(invoiceNo, input, now = new Date()) {
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) throw userError('Invoice not found!');
  const existingReturns = await db.getReturnsByInvoice(invoiceNo);
  const currentReturns = await calculateTotalReturns(invoiceNo);
  const validation = validateReturnDraft({
    returnDate: input.returnDate,
    items: input.items,
    products: invoice.products ?? [],
    existingReturns,
    currentBalance: invoice.balanceDue - currentReturns,
    settlementType: input.settlementType,
  });
  if (!validation.ok) return validation;
  const settlement = {};
  if (input.settlementType) settlement.settlementType = input.settlementType;
  if (input.refundMethod) settlement.refundMethod = input.refundMethod;
  if (input.bankAccountId) settlement.bankAccountId = input.bankAccountId;
  for (const line of validation.lines) {
    await db.saveReturn(buildReturnRecord(invoiceNo, invoice.customerName, line, now, settlement));
  }
  await updateInvoiceWithReturns(invoiceNo);
  await updateSubsequentInvoices(invoice.customerName, invoiceNo);
  return { ok: true, total: validation.total };
}
/** Shared tail of both undo flows: refresh the invoice's return totals, then its customer's later invoices. */
async function refreshAfterReturnChange(invoiceNo) {
  await updateInvoiceWithReturns(invoiceNo);
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) throw userError('Invoice not found!');
  await updateSubsequentInvoices(invoice.customerName, invoiceNo);
}
export async function undoSalesReturn(invoiceNo, returnId) {
  await db.deleteReturn(returnId);
  await refreshAfterReturnChange(invoiceNo);
}
/** Returns the number of returns removed, or null when the invoice had none. */
export async function undoAllSalesReturns(invoiceNo) {
  const returns = await db.getReturnsByInvoice(invoiceNo);
  if (returns.length === 0) return null;
  for (const returnItem of returns) await db.deleteReturn(returnItem.id);
  await refreshAfterReturnChange(invoiceNo);
  return returns.length;
}
