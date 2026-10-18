/**
 * Revenue & profit tracking (port of `loadRevenueTracking` / `filterRevenue` in js/revenue.js).
 *
 * Profit per sold product = (selling rate - average purchase rate of that product) x qty, where the average purchase
 * rate is total purchase cost / total purchased qty over ALL purchase bills, products matched by trimmed UPPERCASE
 * description. The bill's profit is the sum over its products minus the bill discount.
 */
import { toNum } from '@/core/format';
import { lotStockMovements } from '@/features/processing/lotLogic';
const normalise = (description) => description.trim().toUpperCase();
/** Average purchase or manufactured cost per unit of a product description; 0 for unknown products. */
export function buildAvgCostLookup(
  purchaseBills = [],
  dyeingBatches = [],
  combingBatches = [],
  processingLots = [],
) {
  const stats = new Map();
  purchaseBills.forEach((bill) => {
    if (!bill.products || !Array.isArray(bill.products)) return;
    bill.products.forEach((p) => {
      if (!p.description) return;
      const key = normalise(String(p.description));
      const entry = stats.get(key) ?? { qty: 0, cost: 0 };
      entry.qty += toNum(p.qty);
      entry.cost += toNum(p.qty) * toNum(p.rate);
      stats.set(key, entry);
    });
  });

  // Account for completed dyeing batches (manufactured finished colored rolls)
  if (Array.isArray(dyeingBatches)) {
    dyeingBatches.forEach((batch) => {
      if (batch.status !== 'COMPLETED' || !Array.isArray(batch.output)) return;
      batch.output.forEach((p) => {
        if (!p.description) return;
        const key = normalise(String(p.description));
        const entry = stats.get(key) ?? { qty: 0, cost: 0 };
        const qty = toNum(p.qty);
        const unitCost = toNum(p.unitCost);
        entry.qty += qty;
        entry.cost += qty * unitCost;
        stats.set(key, entry);
      });
    });
  }

  // Account for completed combing batches (manufactured combed & processed rolls)
  if (Array.isArray(combingBatches)) {
    combingBatches.forEach((batch) => {
      if (batch.status !== 'COMPLETED' || !Array.isArray(batch.output)) return;
      batch.output.forEach((p) => {
        if (!p.description) return;
        const key = normalise(String(p.description));
        const entry = stats.get(key) ?? { qty: 0, cost: 0 };
        const qty = toNum(p.qty);
        const unitCost = toNum(p.unitCost);
        entry.qty += qty;
        entry.cost += qty * unitCost;
        stats.set(key, entry);
      });
    });
  }

  // Received processing lots: the finished fabric at its cost per kg (grey + dyeing + combing)
  (processingLots || []).forEach((lot) => {
    lotStockMovements(lot)
      .filter((m) => m.kind === 'receipt')
      .forEach((m) => {
        const key = normalise(m.description);
        const entry = stats.get(key) ?? { qty: 0, cost: 0 };
        entry.qty += m.qty;
        entry.cost += m.qty * m.rate;
        stats.set(key, entry);
      });
  });

  return (description) => {
    if (!description) return 0;
    const entry = stats.get(normalise(description));
    if (!entry || entry.qty === 0) return 0;
    return entry.cost / entry.qty;
  };
}
/** Bill discount: `discountAmount`, else the legacy `discount`, else 0. */
export function invoiceDiscount(invoice) {
  return toNum(invoice.discountAmount) || toNum(invoice.discount) || 0;
}
/**
 * One row per invoice, sorted by bill number ascending.
 * PARITY NOTE: the sort key is `parseInt(billNo)`; bill numbers that do not start with a digit give NaN, which JS sort
 * treats as "equal", so such invoices keep their incoming (newest-first) position relative to their neighbours.
 */
export function computeRevenueRows(
  invoices,
  purchaseBills,
  dyeingBatches = [],
  combingBatches = [],
  processingLots = [],
) {
  const avgCost =
    typeof purchaseBills === 'function'
      ? purchaseBills
      : buildAvgCostLookup(purchaseBills, dyeingBatches, combingBatches, processingLots);
  const rows = invoices.map((invoice) => {
    let totalCost = 0;
    let totalBillProfit = 0;
    const lines = [];
    if (invoice.products && Array.isArray(invoice.products)) {
      invoice.products.forEach((p) => {
        const description = p.description || 'Unknown Item';
        const qty = toNum(p.qty);
        const sellingRate = toNum(p.rate);
        const costRate = avgCost(description);
        totalCost += qty * costRate;
        const profitPerUnit = sellingRate - costRate;
        const totalProfit = profitPerUnit * qty;
        totalBillProfit += totalProfit;
        lines.push({ description, qty, sellingRate, costRate, profitPerUnit, totalProfit });
      });
    }
    const discount = invoiceDiscount(invoice);
    const legacyDate = invoice.date;
    return {
      billNo: String(invoice.invoiceNo).replace('INV-', ''),
      rawBillNo: invoice.invoiceNo,
      name: invoice.customerName || 'Unknown',
      profit: totalBillProfit - discount,
      revenue: invoice.subtotal || totalBillProfit + totalCost,
      cost: totalCost,
      lines,
      discount,
      date: invoice.invoiceDate || legacyDate || 'Unknown',
    };
  });
  return rows
    .map((row, index) => ({ row, index, key: parseInt(row.billNo) }))
    .sort((a, b) => {
      const diff = a.key - b.key;
      return Number.isNaN(diff) || diff === 0 ? a.index - b.index : diff;
    })
    .map((x) => x.row);
}
/** Date term is a substring of the stored date, name term a case-insensitive substring of the customer name. */
export function filterRevenueRows(rows, dateTerm, nameTerm) {
  const date = dateTerm.toLowerCase().trim();
  const name = nameTerm.toLowerCase().trim();
  if (!date && !name) return rows;
  return rows.filter(
    (row) =>
      (!date || (!!row.date && row.date.includes(date))) &&
      (!name || (!!row.name && row.name.toLowerCase().includes(name))),
  );
}
export function totalNetProfit(rows) {
  return rows.reduce((sum, row) => sum + row.profit, 0);
}

/** KPI figures of the (filtered) list: bill count, total revenue (bill subtotal), total cost and net profit. */
export function revenueTotals(rows) {
  return rows.reduce(
    (t, row) => ({
      bills: t.bills + 1,
      revenue: t.revenue + toNum(row.revenue),
      cost: t.cost + toNum(row.cost),
      profit: t.profit + row.profit,
    }),
    { bills: 0, revenue: 0, cost: 0, profit: 0 },
  );
}
