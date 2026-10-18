/** Thin adapter over the two recycle-bin families of `db` methods, so one screen serves both bins. */
import { db } from '@/core/db';
import { sortNewestFirst } from './binLogic';
export async function loadBinItems(kind) {
  const items = kind === 'sales' ? await db.getRecycleBinItems() : await db.getPurchaseRecycleBinItems();
  return sortNewestFirst(items);
}
export function restoreBinItem(kind, itemId) {
  return kind === 'sales' ? db.restoreFromRecycleBin(itemId) : db.restorePurchaseFromRecycleBin(itemId);
}
export function permanentlyDeleteBinItem(kind, itemId) {
  return kind === 'sales'
    ? db.permanentDeleteFromRecycleBin(itemId)
    : db.permanentDeletePurchaseFromRecycleBin(itemId);
}
/** Resolves with the number of deleted items. */
export function emptyBin(kind) {
  return kind === 'sales' ? db.emptyRecycleBin() : db.emptyPurchaseRecycleBin();
}
