/** Firestore side of the Add Customer screen (manage-customers.js addCustomer / saveEdit / deleteCustomer). */
import { db } from '@/core/db';
import { CUSTOMER_MESSAGES, hasErrors, trimDraft, validateCustomerDraft } from './customerValidation';
/** Validates, rejects an existing phone number, then writes `{ phone, name, address }` (no other fields, as on the web). */
export async function addCustomer(input) {
  const draft = trimDraft(input);
  const errors = validateCustomerDraft(draft, 'add');
  if (hasErrors(errors)) return { ok: false, errors };
  if (await db.getCustomer(draft.phone))
    return { ok: false, errors: { phone: CUSTOMER_MESSAGES.add.duplicate } };
  const customerData = {
    phone: draft.phone,
    name: draft.name,
    address: draft.address,
  };
  if (draft.openingBalance !== undefined) {
    customerData.openingBalance = draft.openingBalance;
  }
  await db.saveCustomer(customerData);
  return { ok: true };
}
/**
 * Rewrites the customer on every invoice carrying the old name and on the customer document. The phone number is the
 * document id, so a changed number creates a new document and the old one is removed afterwards.
 */
export async function updateCustomer(original, input) {
  const draft = trimDraft(input);
  const errors = validateCustomerDraft(draft, 'edit');
  if (hasErrors(errors)) return { ok: false, errors };
  const originalPhone = original.phone ?? '';
  const phoneChanged = draft.phone !== originalPhone;
  if (phoneChanged && (await db.getCustomer(draft.phone))) {
    return { ok: false, errors: { phone: CUSTOMER_MESSAGES.edit.duplicate } };
  }
  // the customer's ledger takes a NEW opening balance only when it was actually changed on the form (an untouched
  // field must never reset an opening the bills already carry)
  const openingChanged =
    draft.openingBalance !== undefined &&
    String(draft.openingBalance).trim() !== '' &&
    Number(draft.openingBalance) !== Number(original.openingBalance ?? 0);
  await db.updateCustomerDetails(
    original.name ?? '',
    draft.name,
    draft.phone,
    draft.address,
    draft.openingBalance,
    {
      oldPhone: originalPhone,
      newOpening: openingChanged ? Number(draft.openingBalance) : undefined,
    },
  );
  if (phoneChanged && originalPhone) {
    try {
      await db.deleteCustomerDoc(originalPhone);
    } catch (error) {
      console.error('Failed to delete old customer record:', error);
    }
  }
  return { ok: true };
}
/** Deletes the customer document and moves all invoices carrying this phone number to the recycle bin. */
export async function deleteCustomer(phone) {
  await db.deleteCustomer(phone);
}
