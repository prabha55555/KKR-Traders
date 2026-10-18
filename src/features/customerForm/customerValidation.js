/** Pure rules of the Add Customer screen (manage-customers.js addCustomer / saveEdit validation and list). */
import { digitsOnly, toNum } from '@/core/format';
export const EMPTY_CUSTOMER_DRAFT = { phone: '', name: '', address: '', openingBalance: '' };
/** Texts of the web page's alert() boxes, shown inline next to the offending field. */
export const CUSTOMER_MESSAGES = {
  add: {
    phone: 'Please enter a valid phone number (at least 10 digits).',
    name: 'Customer name is required.',
    duplicate: 'A customer with this phone number already exists.',
  },
  edit: {
    phone: 'Please enter a valid phone number.',
    name: 'Name cannot be empty.',
    duplicate: 'A customer with the new phone number already exists.',
  },
};
export const trimDraft = (draft) => {
  const result = {
    phone: (draft.phone || '').trim(),
    name: (draft.name || '').trim(),
    address: (draft.address || '').trim(),
  };
  if (draft.openingBalance !== undefined && draft.openingBalance !== '') {
    result.openingBalance = toNum(draft.openingBalance);
  }
  return result;
};
/**
 * The web page only checked `phone.length < 10`; a number with letters or punctuation padding it out passed.
 * Counting digits keeps every real number valid and rejects such junk (the phone is also the Firestore document id).
 */
export const isValidCustomerPhone = (phone) => digitsOnly(phone).length >= 10;
/** Empty object = valid. Expects a trimmed draft (see `trimDraft`). */
export function validateCustomerDraft(draft, mode) {
  const errors = {};
  if (!isValidCustomerPhone(draft.phone)) errors.phone = CUSTOMER_MESSAGES[mode].phone;
  if (!draft.name) errors.name = CUSTOMER_MESSAGES[mode].name;
  return errors;
}
export const hasErrors = (errors) => Object.keys(errors).length > 0;
const looksLikePhoneQuery = (q) => /^[\d\s+()-]+$/.test(q);
/** Search box over name / phone / address (case-insensitive; digits-only matching for phone-like queries). */
export function filterCustomers(customers, query) {
  const q = query.trim().toLowerCase();
  if (!q) return customers;
  const qDigits = looksLikePhoneQuery(q) ? digitsOnly(q) : '';
  return customers.filter(
    (c) =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.address || '').toLowerCase().includes(q) ||
      (qDigits !== '' && digitsOnly(c.phone).includes(qDigits)),
  );
}
