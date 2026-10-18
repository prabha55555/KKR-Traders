/**
 * Presentation helpers for the Customer Details list. Phone masking, the address preview and counts are shared with
 * Supplier Details (`@/components/party/display`); re-exported here so existing imports keep working.
 */
export {
  formatCount,
  isAddressTruncated,
  isPhoneMasked,
  maskPhone,
  PHONE_REVEAL_MS,
  previewAddress,
  revealPhone,
} from '@/components/party/display';

/** Balance colour: owing = red (negative), credit = green (positive), nil = neutral. */
export function balanceTone(balance) {
  if (balance > 0) return 'negative';
  if (balance < 0) return 'positive';
  return 'neutral';
}
