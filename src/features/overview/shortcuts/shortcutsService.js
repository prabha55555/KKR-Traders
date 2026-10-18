import { db } from '@/core/db';
/**
 * Saves an edited shortcut. The document id is the key, so a changed key = delete the old document, then save the new
 * one (same order as the web page; the two writes are not atomic). Saving stamps a fresh `createdAt` (db.saveShortcut).
 *
 * PARITY NOTE: the web page compared the typed key with the old UPPERCASE id before upper-casing it, so merely typing
 * "sh" for "SH" deleted and re-created the same document; the comparison is done on the normalised key here.
 * Saving onto a key that already belongs to another shortcut overwrites it without warning, as on the web.
 */
export async function updateShortcut(oldKey, shortcut) {
  if (shortcut.shortcutKey !== oldKey) await db.deleteShortcut(oldKey);
  await db.saveShortcut(shortcut);
}
