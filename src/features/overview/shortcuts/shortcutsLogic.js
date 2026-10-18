export const SHORTCUT_KEY_MAX_LENGTH = 20;
export const SHORTCUT_REQUIRED_MESSAGE = 'Please enter both shortcut key and full description';
/** Each space-separated word: first letter upper case, the rest lower case ("lycra DERBY" -> "Lycra Derby"). */
export function titleCaseDescription(description) {
  return description
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
/** null when the key or the description is blank. */
export function normaliseShortcut(rawKey, rawDescription) {
  const key = rawKey.trim();
  const fullDescription = titleCaseDescription(rawDescription);
  if (!key || !fullDescription) return null;
  return { shortcutKey: key.toUpperCase(), fullDescription };
}
/** Case-insensitive substring of the key or the description. */
export function filterShortcuts(shortcuts, query) {
  const q = query.trim().toLowerCase();
  if (!q) return shortcuts;
  return shortcuts.filter(
    (s) => s.shortcutKey.toLowerCase().includes(q) || s.fullDescription.toLowerCase().includes(q),
  );
}
