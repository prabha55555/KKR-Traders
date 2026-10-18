/** Add Supplier page — port of js/manage-suppliers.js (validation, duplicate checks, rename side-effects). */
import { db } from '@/core/db';
import { digitsOnly } from '@/core/format';
import { normalizePhone } from '@/core/ledger';
const trimmed = (i) => ({ phone: i.phone.trim(), name: i.name.trim(), address: i.address.trim() });
/** addSupplier(): phone first, then name. Returns the message to show, or null when valid. */
export function validateNewSupplier(input) {
  const { phone, name } = trimmed(input);
  if (!phone || digitsOnly(phone).length < 10)
    return 'Please enter a valid phone number (at least 10 digits).';
  if (!name) return 'Supplier name is required.';
  return null;
}
/** saveEdit(): name first, then phone. */
export function validateSupplierEdit(input) {
  const { phone, name } = trimmed(input);
  if (!name) return 'Name cannot be empty.';
  if (!phone || digitsOnly(phone).length < 10) return 'Please enter a valid phone number.';
  return null;
}
/** Per-field messages (phone / name) for the inline errors under the inputs; {} when valid. */
export function supplierFieldErrors(input) {
  const { phone, name } = trimmed(input);
  const errors = {};
  if (!phone || digitsOnly(phone).length < 10)
    errors.phone = 'Enter a valid phone number (at least 10 digits).';
  if (!name) errors.name = 'Supplier name is required.';
  return errors;
}
/** Directory search box (the web page had none): case-insensitive match on name, phone or address. */
export function filterSupplierDirectory(suppliers, query) {
  const q = query.toLowerCase().trim();
  if (!q) return suppliers;
  return suppliers.filter(
    (s) =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.address || '').toLowerCase().includes(q),
  );
}
/**
 * Which purchase bills a supplier edit rewrites: the bills with the supplier's OLD name that are really this
 * supplier's — those with its phone, and phone-less ones stamped into its ledger chain or (unstamped) while no other
 * phone uses that name. (The web matched by name only, which rewrote a namesake's bills with this phone.) `suppliers`
 * = the directory, to spot a namesake that has no bills yet. A blank new address keeps the bill's own address.
 */
export function planSupplierEdit(original, input, bills, suppliers = []) {
  const next = trimmed(input);
  const oldName = (original.name || '').trim();
  const own = normalizePhone(original.phone);
  const named = bills.filter((b) => (b.supplierName || '').trim() === oldName);
  const otherPhone = (p) => p && p !== own;
  const namesake =
    named.some((b) => otherPhone(normalizePhone(b.supplierPhone))) ||
    suppliers.some((x) => (x.name || '').trim() === oldName && otherPhone(normalizePhone(x.phone)));
  const isOwn = (b) => {
    if (!own) return true;
    const p = normalizePhone(b.supplierPhone);
    if (p) return p === own;
    if (b.ledgerParty !== undefined && b.ledgerParty !== null) return normalizePhone(b.ledgerParty) === own;
    return !namesake;
  };
  const billUpdates = named.filter(isOwn).map((b) => ({
    invoiceNo: b.invoiceNo,
    fields: {
      supplierName: next.name,
      supplierPhone: next.phone,
      supplierAddress: next.address || b.supplierAddress || '',
    },
  }));
  return { phoneChanged: next.phone !== original.phone, billUpdates };
}
export async function addSupplier(input) {
  const { phone, name, address } = trimmed(input);
  if (await db.getSupplier(phone)) return 'duplicate';
  await db.saveSupplier({ phone, name, address });
  return 'added';
}
/**
 * saveEdit(): new phone must be free, then all of the supplier's purchase bills are rewritten, the supplier document is
 * saved under the (possibly new) phone and, when the phone changed, the old document is deleted (best effort).
 *
 * PARITY NOTE: the web re-saved each bill with savePurchaseBill, which also re-stamped `timestamp`/`createdAt` and so
 * reshuffled the history order. A field-level update is used here: the same three fields change, nothing else does.
 */
export async function updateSupplier(original, input) {
  const next = trimmed(input);
  const phoneChanged = next.phone !== original.phone;
  if (phoneChanged && (await db.getSupplier(next.phone))) return { status: 'duplicate' };
  db.invalidate('purchaseInvoices');
  const [bills, suppliers] = await Promise.all([
    db.getAllPurchaseBills(),
    db.getAllSuppliers().catch(() => []),
  ]);
  const { billUpdates } = planSupplierEdit(original, next, bills, suppliers);
  await Promise.all(billUpdates.map((u) => db.updatePurchaseBillFields(u.invoiceNo, u.fields)));
  await db.saveSupplier({ name: next.name, phone: next.phone, address: next.address }, { merge: true });
  // the rewritten bills may now form one chain (or have left another): keep the stored balances in step
  if (billUpdates.length) {
    await db.syncPurchaseLedger({ supplierName: next.name, supplierPhone: next.phone });
    if (phoneChanged)
      await db.syncPurchaseLedger({ supplierName: original.name, supplierPhone: original.phone });
  }
  if (phoneChanged) {
    try {
      await db.deleteSupplier(original.phone);
    } catch (error) {
      console.error('Failed to delete old supplier record:', error);
    }
  }
  return { status: 'updated', billsUpdated: billUpdates.length };
}
/** deleteSupplier(): removes the supplier document only; their bills stay. */
export async function removeSupplier(phone) {
  await db.deleteSupplier(phone);
}
