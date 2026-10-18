import { db } from '@/core/db';
import { buildStockMap, computeStocks } from './stocksLogic';
/**
 * Loads purchases, sales and opening stocks and derives the stock rows + financial summary. The reads that feed
 * quantities are STRICT: a failed one throws instead of showing partial stock as real figures.
 */
export async function loadStocks() {
  const [
    purchaseBills,
    salesInvoices,
    openingStocks,
    productMetadata,
    salesReturns,
    purchaseReturns,
    dyeingBatches,
    combingBatches,
    processingLots,
  ] = await Promise.all([
    db.getAllPurchaseBills(),
    db.getAllInvoices(),
    db.getAllOpeningStocks(),
    db.getAllProductMetadata().catch(() => []),
    db.getAllReturns(),
    db.getAllPurchaseReturns(),
    db.getAllDyeingBatches ? db.getAllDyeingBatches() : Promise.resolve([]),
    db.getAllCombingBatches ? db.getAllCombingBatches() : Promise.resolve([]),
    db.getAllProcessingLots ? db.getAllProcessingLots() : Promise.resolve([]),
  ]);
  return computeStocks(
    purchaseBills || [],
    salesInvoices || [],
    openingStocks || [],
    productMetadata || [],
    salesReturns || [],
    purchaseReturns || [],
    dyeingBatches || [],
    combingBatches || [],
    processingLots || [],
  );
}

let _stocksCache = null;
let _stocksCacheTime = 0;

export function invalidateStocksCache() {
  _stocksCache = null;
  _stocksCacheTime = 0;
}

if (db && typeof db.onInvalidate === 'function') {
  db.onInvalidate(() => {
    invalidateStocksCache();
  });
}

/**
 * Returns a fast lookup Map of { [description]: { available, availableRolls, hasRolls, minStockLevel, avgPurchaseRate,
 * purchased, purchaseHistory } } keyed by the exact description plus a lower-case fallback (see buildStockMap /
 * lookupStock).
 */
export async function getStockQuantityMap(forceRefresh = false) {
  if (forceRefresh) {
    invalidateStocksCache();
  }
  const now = Date.now();
  if (!forceRefresh && _stocksCache && now - _stocksCacheTime < 15000) {
    return _stocksCache;
  }
  // a failed read throws (callers show their error state); nothing partial is ever cached
  const { rows } = await loadStocks();
  const map = buildStockMap(rows);
  _stocksCache = map;
  _stocksCacheTime = now;
  return map;
}
