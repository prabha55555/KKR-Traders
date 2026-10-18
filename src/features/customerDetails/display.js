/** Presentation helpers for the Customer Details list (ports of formatPhoneNumber / address truncation / colour rules). */
import { digitsOnly, formatCurrency } from '@/core/format';
/** How long a tapped phone number stays unmasked (web: setTimeout 5000). */
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
/** First 30 characters + '...'; 'N/A' when empty. The web showed the full text in a hover tooltip. */
export function previewAddress(address) {
  if (!address) return 'N/A';
  return address.length > ADDRESS_PREVIEW_LENGTH
    ? `${address.substring(0, ADDRESS_PREVIEW_LENGTH)}...`
    : address;
}
export const isAddressTruncated = (address) => !!address && address.length > ADDRESS_PREVIEW_LENGTH;
/** Balance colour: owing = red (negative), credit = green (positive), nil = neutral. */
export function balanceTone(balance) {
  if (balance > 0) return 'negative';
  if (balance < 0) return 'positive';
  return 'neutral';
}
/** Whole-number count with Indian grouping (the web used `toLocaleString()`). */
export function formatCount(n) {
  return formatCurrency(n).replace(/\.\d\d$/, '');
}
