/**
 * Pure helpers for the bill product rows (shared by Sales and Purchase bills).
 * A "shortcut" is `{ shortcutKey, fullDescription }`; products must be picked from that catalogue.
 */

/** A blank product line (qty/rate are strings so a half-typed number is never mangled). */
export const EMPTY_ROW = { description: '', qty: '0', rate: '0' };

export const MAX_PRODUCT_SUGGESTIONS = 8;

/** script.js autocomplete: shortcut key OR full description contains the typed text (case-insensitive). */
export function matchShortcuts(shortcuts, query, limit = MAX_PRODUCT_SUGGESTIONS) {
  const q = (query ?? '').trim().toLowerCase();
  if (!q || !shortcuts) return [];
  return shortcuts
    .filter((s) => s.shortcutKey.toLowerCase().includes(q) || s.fullDescription.toLowerCase().includes(q))
    .slice(0, limit);
}

/** Utils.validateForm: a typed description is valid only when it equals a catalogue description. */
export function isKnownProduct(shortcuts, description) {
  const d = (description ?? '').trim().toLowerCase();
  return !!shortcuts && shortcuts.some((s) => s.fullDescription.toLowerCase().trim() === d);
}

/** Removing the last remaining row leaves one blank row (the table never becomes empty). */
export function removeRowAt(rows, index) {
  const next = rows.filter((_, i) => i !== index);
  return next.length ? next : [{ ...EMPTY_ROW }];
}
