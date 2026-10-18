/** "Share Acknowledgement" button of purchase.js / edit-purchase.js. */
import { copyText, shareText } from '@/platform';
import { buildProductLines } from '@/core/billing';
/**
 * Same checks as the web handlers: at least one product (description + qty > 0), and — only on the create page —
 * every product must come from the shortcut list (`shortcuts` = null skips that rule, as the edit page does).
 */
export function validateAcknowledgement(form, shortcuts) {
  const lines = buildProductLines(form.rows, { requirePositiveQty: true });
  if (lines.length === 0) {
    return { title: 'Empty Bill', message: 'Please add at least one product before sharing.' };
  }
  if (shortcuts) {
    const known = new Set(shortcuts.map((s) => s.fullDescription.toLowerCase().trim()));
    if (!lines.every((l) => known.has(l.description.toLowerCase()))) {
      return { title: 'Invalid Product', message: 'Please select products only from the suggestions list.' };
    }
  }
  return null;
}
/** navigator.share when available, otherwise copy to the clipboard (web: `navigator.share` ?? `navigator.clipboard`). */
export async function shareAcknowledgement(message) {
  const result = await shareText(message, 'Acknowledgement');
  if (result === 'shared' || result === 'dismissed') return result;
  // no share sheet on this browser: fall back to the clipboard
  return (await copyText(message)) ? 'copied' : 'failed';
}
