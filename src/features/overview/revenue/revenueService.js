import { db } from '@/core/db';
import { computeRevenueRows } from './revenueLogic';
/** Loads every invoice, purchase bill, and dyeing batch and derives the revenue rows. */
export async function loadRevenueRows() {
  const [invoices, purchaseBills, dyeingBatches, combingBatches, processingLots] = await Promise.all([
    db.getAllInvoices(),
    db.getAllPurchaseBills(),
    db.getAllDyeingBatches ? db.getAllDyeingBatches() : Promise.resolve([]),
    db.getAllCombingBatches ? db.getAllCombingBatches() : Promise.resolve([]),
    db.getAllProcessingLots ? db.getAllProcessingLots().catch(() => []) : Promise.resolve([]),
  ]);
  return computeRevenueRows(invoices, purchaseBills, dyeingBatches, combingBatches, processingLots);
}
