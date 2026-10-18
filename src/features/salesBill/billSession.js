/**
 * Pure state model of the Sales Bill screen. The web page kept this state in the DOM plus two globals
 * (`window.isBillSaved` and the read-only invoice-number input of edit mode); here it is one plain object so every
 * transition can be unit-tested without rendering anything.
 */
import { formatCurrency } from '@/core/format';
import { emptySalesForm, invoiceNoExists, validateSalesBill } from '@/core/services/salesBill';
export function newBillSession() {
  return { form: emptySalesForm(), saved: false, editingNo: null, persistedNo: null };
}
/** Any field change marks the bill unsaved (script.js: the `input` listeners that clear `isBillSaved`). */
export function editBill(session, patch) {
  return { ...session, form: { ...session.form, ...patch }, saved: false };
}
/**
 * A save finished for `savedForm`. If the form was edited while the save was running (an async customer lookup
 * landing late), the bill stays unsaved but the stored number is still remembered.
 */
export function markSaved(session, savedForm) {
  return { ...session, persistedNo: savedForm.invoiceNo.trim(), saved: session.form === savedForm };
}
/** loadInvoiceForEditing: a loaded bill counts as saved, its number becomes read-only. */
export function loadedBillSession(form, editingNo) {
  return { form, saved: true, editingNo, persistedNo: form.invoiceNo.trim() };
}
export const saveButtonLabel = (session) => (session.editingNo !== null ? 'Update Bill' : 'Save Bill');
/**
 * After a save the customer's ledger was re-synced, which may have corrected this bill's previous balance (another
 * device added a bill meanwhile, a back-dated bill…). The saved session shows what is stored, so a later Generate /
 * Share prints the same figure. Ignored when the form was edited while the save ran.
 */
export function withSavedLedger(session, invoice) {
  const previousBalance = invoice?.previousBalance;
  if (!session.saved || previousBalance === undefined || session.form.previousBalance === previousBalance)
    return session;
  return { ...session, form: { ...session.form, previousBalance } };
}
/**
 * Re-computed "Previous Balance Due" for a bill that is being composed or edited and has unsaved changes (its customer,
 * number or date moved it in the ledger). A bill showing exactly what is stored keeps it. `null` (the ledger could not
 * be read) changes nothing.
 */
export function withRefreshedPreviousBalance(session, previousBalance) {
  if (previousBalance === null || previousBalance === undefined) return session;
  if (session.saved || session.form.previousBalance === previousBalance) return session;
  return { ...session, form: { ...session.form, previousBalance } };
}
/** What the screen must do when the `edit` search param changes (tab screens stay mounted, so it can change). */
export function editParamAction(editParam, session) {
  if (editParam)
    return session.editingNo === editParam ? { type: 'none' } : { type: 'load', invoiceNo: editParam };
  return session.editingNo !== null ? { type: 'reset' } : { type: 'none' };
}
export function unsavedBillError(kind) {
  return {
    title: 'Unsaved Bill',
    message:
      kind === 'pdf'
        ? 'Please click "Save Bill" first before generating the PDF.'
        : 'Please click "Save Bill" first before sharing on WhatsApp.',
  };
}
/** Generate / Share: the form must be valid AND saved without changes since (script.js checks them in this order). */
export function outputGuard(session, shortcuts, kind) {
  return validateSalesBill(session.form, shortcuts) ?? (session.saved ? null : unsavedBillError(kind));
}
/**
 * Save BILL, step 1. Beyond the web app's validation: a NEW bill (not edit mode, number not saved earlier on this
 * screen) whose number already exists would silently replace that invoice, so the user is asked first.
 */
export async function planSave(session, shortcuts, exists = invoiceNoExists) {
  const error = validateSalesBill(session.form, shortcuts);
  if (error) return { kind: 'invalid', error };
  const invoiceNo = session.form.invoiceNo.trim();
  const isSameBill = session.editingNo !== null || invoiceNo === session.persistedNo;
  if (!isSameBill && (await exists(invoiceNo))) return { kind: 'confirm-overwrite', invoiceNo };
  return { kind: 'ready' };
}
/** Body of the 'Bill Saved' toast (script.js saveBill). */
export function savedBillMessage(invoice) {
  return `Invoice #: ${invoice.invoiceNo}\nCustomer: ${invoice.customerName}\nAmount: ₹${formatCurrency(invoice.grandTotal)}`;
}
