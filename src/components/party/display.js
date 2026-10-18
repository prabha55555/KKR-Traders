/**
 * Presentation helpers shared by the Customer Details and Supplier Details lists: phone masking (ports of
 * formatPhoneNumber / togglePhoneNumber), the address preview, whole-number counts and the balance colour.
 * Display only — no business rules live here.
 */
import { digitsOnly, formatCurrency } from '@/core/format';

/** How long a tapped phone number stays unmasked (both web pages: setTimeout 5000). */
export const PHONE_REVEAL_MS = 5000;
const ADDRESS_PREVIEW_LENGTH = 30;

/** `formatPhoneNumber`: digits only, everything but the last 3 masked with `*`; 'N/A' when there is no phone. */
export function maskPhone(phone) {
  if (!phone) return 'N/A';
  const clean = digitsOnly(phone);
  if (clean.length <= 3) return clean;
  return '*'.repeat(clean.length - 3) + clean.slice(-3);
}

/** What a tap on the masked phone reveals (`togglePhoneNumber`): the digits only. */
export function revealPhone(phone) {
  return digitsOnly(phone);
}

/** Only numbers long enough to have a masked part can be revealed (the web checked for a `*` in the text). */
export function isPhoneMasked(phone) {
  return maskPhone(phone).includes('*');
}

/** First 30 characters + '...'; 'N/A' when empty. The full text is in the tooltip and a tap expands it. */
export function previewAddress(address) {
  if (!address) return 'N/A';
  return address.length > ADDRESS_PREVIEW_LENGTH
    ? `${address.substring(0, ADDRESS_PREVIEW_LENGTH)}...`
    : address;
}

export const isAddressTruncated = (address) => !!address && address.length > ADDRESS_PREVIEW_LENGTH;

/** Whole-number count with Indian grouping (the web used `toLocaleString()`). */
export function formatCount(n) {
  return formatCurrency(n).replace(/\.\d\d$/, '');
}

/**
 * App status tone (Badge / StatCard `tone`) of a party balance, the same on both pages: still owed = danger (red),
 * in credit / advance = success (green), nil = neutral.
 */
export function balanceStatusTone(balance) {
  if (balance > 0) return 'danger';
  if (balance < 0) return 'success';
  return 'neutral';
}
