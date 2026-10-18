/**
 * Sales returns from the history screen: add (saveReturn), undo one, undo all
 * (invoice-history.js saveReturn / undoReturn / undoAllReturns / getAlreadyReturnedQty).
 */
import { updateInvoiceWithReturns, updateSubsequentInvoices } from '@/core/billing';
import { db } from '@/core/db';
import { SALES_LEDGER } from '@/core/ledger';
import { partyReturnProducts, refundSettlement, validateReturnDraft } from '../lib/returns';
import { userError } from '../lib/types';
/**
 * The documents written for one submitted return line (db.saveReturn adds `id` and the server `createdAt`).
 * `settlement` = lib/returns refundSettlement(): every new return is a refund (Cash, or 'bank' + bankAccountId), so
 * it can never be read as a balance adjustment (a missing settlement means "adjust the balance" to core/ledger).
 */
export function buildReturnRecord(
  invoiceNo,
  customerName,
  line,
  now,
  settlement = refundSettlement({ refundMethod: 'cash' }),
) {
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
 * Validates the draft (qty left to return over the customer's bills — the same product list the sheet offered, see
 * partyReturnProducts — and the refund account), then saves one return document per line as a refund, refreshes the
 * invoice's totalReturns / adjustedBalanceDue and re-computes the customer's later invoices (a refund leaves the
 * balances as they were). Validation failures are returned (shown inline), unexpected failures throw.
 */
export async function saveSalesReturn(invoiceNo, input, now = new Date()) {
  const invoice = await db.getInvoice(invoiceNo);
  if (!invoice) throw userError('Invoice not found!');
  const [allInvoices, allReturns] = await Promise.all([db.getAllInvoices(), db.getAllReturns()]);
  const { products, invoiceNos } = partyReturnProducts(SALES_LEDGER, allInvoices, invoice);
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
    await db.saveReturn(buildReturnRecord(invoiceNo, invoice.customerName, line, now, validation.settlement));
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
