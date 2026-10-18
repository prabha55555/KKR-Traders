/** Decisions of the Purchase Bill (create) screen that are not plain UI — kept pure/async so they can be tested. */
import { calculateSupplierPreviousBalanceAtTime } from '@/core/billing';
import { db } from '@/core/db';
import { purchaseNoExists, validatePurchaseBill } from '@/core/services/purchaseBill';
import { round2 } from './money';
/** purchase.js only looks a supplier up once the phone has at least this many characters. */
export const MIN_SUPPLIER_PHONE_LENGTH = 10;
export async function lookupSupplier(phone) {
  const p = phone.trim();
  if (p.length < MIN_SUPPLIER_PHONE_LENGTH) return { kind: 'incomplete' };
  const supplier = await db.getSupplier(p);
  return supplier ? { kind: 'found', supplier } : { kind: 'notFound' };
}
/**
 * Utils.calculateAndSetSupplierPreviousBalance: the previous balance shown on the bill (2 decimals, like the web's
 * displayed text) — the closing balance of the supplier's bill just before this one in their ledger. Depends on the
 * invoice number and date too: a number that already exists resolves to the bill before it, a back-dated bill to the
 * bill before its date. `null` when the ledger could not be read (callers keep the value they show).
 */
export async function previousBalanceFor(form) {
  if (!form.supplierName.trim() && !form.supplierPhone.trim()) return 0;
  const info = await calculateSupplierPreviousBalanceAtTime(
    form.supplierName,
    form.supplierPhone,
    form.invoiceNo.trim() || null,
    form.invoiceDate || null,
  );
  if (info.failed) return null;
  return round2(info.balanceCarriedForward);
}
/**
 * Everything the Save button checks before writing: the form rules against a FRESH read of the shortcut list (the web
 * re-read it on every click), then whether the bill number is already taken — the web overwrote silently, the screen
 * asks first.
 */
export async function checkPurchaseBeforeSave(form) {
  db.invalidate('shortcuts');
  const error = validatePurchaseBill(form, await db.getAllShortcuts());
  if (error) return { error };
  return { error: null, overwrites: await purchaseNoExists(form.invoiceNo) };
}
