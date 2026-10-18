import { db } from '@/core/db';
import { buildStockMap, computeStocks } from './stocksLogic';
/** Loads purchases, sales and opening stocks and derives the stock rows + financial summary. */
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
  ] = await Promise.all([
    db.getAllPurchaseBills().catch(() => []),
    db.getAllInvoices().catch(() => []),
    db.getAllOpeningStocks().catch(() => []),
    db.getAllProductMetadata().catch(() => []),
    db.getAllReturns().catch(() => []),
    db.getAllPurchaseReturns().catch(() => []),
    db.getAllDyeingBatches ? db.getAllDyeingBatches().catch(() => []) : Promise.resolve([]),
    db.getAllCombingBatches ? db.getAllCombingBatches().catch(() => []) : Promise.resolve([]),
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
 * Returns a fast lookup Map of { [description]: { available, minStockLevel, avgPurchaseRate, purchased,
 * purchaseHistory } } keyed by the exact description plus a lower-case fallback (see buildStockMap / lookupStock).
 */
export async function getStockQuantityMap(forceRefresh = false) {
  if (forceRefresh) {
    invalidateStocksCache();
  }
  const now = Date.now();
  if (!forceRefresh && _stocksCache && now - _stocksCacheTime < 15000) {
    return _stocksCache;
  }
  try {
    const { rows } = await loadStocks();
    const map = buildStockMap(rows);
    _stocksCache = map;
    _stocksCacheTime = now;
    return map;
  } catch (err) {
    console.error('Failed to load stock map:', err);
    return new Map();
  }
}
