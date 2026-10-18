/**
 * Available stock + financial summary (port of `loadStocks` / the search handler in js/stocks.js).
 *
 * available = opening stock + purchased qty - sold qty, where purchase returns lower `purchased`, sales returns lower
 * `sold`, fabric issued to dyeing / combing counts as sold and their finished receipts as purchased. Products are matched by their TRIMMED description,
 * case-sensitively — "Cotton" and "COTTON" are two stock rows, unlike the revenue page which upper-cases.
 * avgPurchaseRate = weighted average rate of the positive purchase entries (purchase-bill lines + dyeing / combing
 * receipts at their unit cost); purchase returns and opening stock (no price) are left out.
 */
import { formatDateIN, toNum } from '@/core/format';
import { PURCHASE_LEDGER, SALES_LEDGER, billAmount } from '@/core/ledger';
const round3 = (n) => Math.round(n * 1000) / 1000;
const round2 = (n) => Number(n.toFixed(2));
const newAccumulator = (opening = 0) => ({
  opening,
  purchased: 0,
  sold: 0,
  minStockLevel: 0,
  purchaseHistory: [],
  salesHistory: [],
});
/** Newest first; unparseable dates compare as equal (JS sort of NaN) and keep their order. */
function sortHistory(entries) {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const diff = new Date(b.entry.date).getTime() - new Date(a.entry.date).getTime();
      return Number.isNaN(diff) || diff === 0 ? a.index - b.index : diff;
    })
    .map((x) => x.entry);
}
export function computeStocks(
  purchaseBills,
  salesInvoices,
  openingStocks,
  productMetadata = [],
  salesReturns = [],
  purchaseReturns = [],
  dyeingBatches = [],
  combingBatches = [],
) {
  const stockMap = new Map();
  const entry = (description) => {
    let acc = stockMap.get(description);
    if (!acc) {
      acc = newAccumulator();
      stockMap.set(description, acc);
    }
    return acc;
  };
  // Seed with opening stocks (a duplicate description: the last one wins)
  openingStocks.forEach((stock) => {
    const description = String(stock.description ?? '').trim();
    if (!description) return;
    entry(description).opening = toNum(stock.qty);
  });

  // Seed with metadata
  if (productMetadata) {
    productMetadata.forEach((meta) => {
      const description = String(meta.description ?? '').trim();
      if (!description) return;
      entry(description).minStockLevel = toNum(meta.minStockLevel);
    });
  }
  let totalSales = 0;
  let cashReceived = 0;
  let totalPurchases = 0;
  purchaseBills.forEach((bill) => {
    // the bill's own amount: grandTotal also carries the supplier's previous balance, which would be counted again
    totalPurchases += billAmount(bill, PURCHASE_LEDGER);
    if (!bill.products || !Array.isArray(bill.products)) return;
    bill.products.forEach((product) => {
      if (!product.description) return;
      const qty = toNum(product.qty);
      const rate = toNum(product.rate);
      const acc = entry(String(product.description).trim());
      acc.purchased += qty;
      acc.purchaseHistory.push({
        date: bill.invoiceDate || bill.date || '',
        party: bill.supplierName || 'Unknown',
        qty,
        rate,
        invoiceNo: String(bill.invoiceNo || ''),
        rawInvoiceNo: String(bill.invoiceNo || ''),
        amount: round2(qty * rate),
      });
    });
  });

  // Account for purchase returns (goods returned to supplier decrease purchased stock)
  if (Array.isArray(purchaseReturns)) {
    purchaseReturns.forEach((pr) => {
      if (!pr.description) return;
      const qty = toNum(pr.qty);
      const rate = toNum(pr.rate);
      const acc = entry(String(pr.description).trim());
      acc.purchased -= qty;
      acc.purchaseHistory.push({
        date: pr.returnDate || pr.date || '',
        party: `${pr.supplierName || 'Supplier'} (Return)`,
        qty: -qty,
        rate,
        invoiceNo: pr.invoiceNo ? `Return #${pr.invoiceNo}` : 'Return',
        rawInvoiceNo: String(pr.invoiceNo || ''),
        amount: -round2(qty * rate),
      });
    });
  }

  salesInvoices.forEach((invoice) => {
    // the invoice's own amount: grandTotal also carries the customer's previous balance, which would be counted again
    totalSales += billAmount(invoice, SALES_LEDGER);
    cashReceived += toNum(invoice.amountPaid);
    if (!invoice.products || !Array.isArray(invoice.products)) return;
    invoice.products.forEach((product) => {
      if (!product.description) return;
      const qty = toNum(product.qty);
      const rate = toNum(product.rate);
      const acc = entry(String(product.description).trim());
      acc.sold += qty;
      acc.salesHistory.push({
        date: invoice.invoiceDate || invoice.date || '',
        party: invoice.customerName || 'Unknown',
        qty,
        rate,
        invoiceNo: String(invoice.invoiceNo || ''),
        rawInvoiceNo: String(invoice.invoiceNo || ''),
        amount: round2(qty * rate),
      });
    });
  });

  // Account for sales returns (goods returned by customer decrease sold stock / add back to stock)
  if (Array.isArray(salesReturns)) {
    salesReturns.forEach((sr) => {
      if (!sr.description) return;
      const qty = toNum(sr.qty);
      const rate = toNum(sr.rate);
      const acc = entry(String(sr.description).trim());
      acc.sold -= qty;
      acc.salesHistory.push({
        date: sr.returnDate || sr.date || '',
        party: `${sr.customerName || 'Customer'} (Return)`,
        qty: -qty,
        rate,
        invoiceNo: sr.invoiceNo ? `Return #${sr.invoiceNo}` : 'Return',
        rawInvoiceNo: String(sr.invoiceNo || ''),
        amount: -round2(qty * rate),
      });
    });
  }

  // Account for dyeing batches (Workflow 2: Manufacturing & Processing)
  if (Array.isArray(dyeingBatches)) {
    dyeingBatches.forEach((batch) => {
      if (batch.status === 'CANCELLED') return;

      // 1. Raw Grey Material issued to dyeing (reduces raw grey available stock)
      if (batch.input?.description) {
        const desc = String(batch.input.description).trim();
        const qty = toNum(batch.input.qty);
        const rate = toNum(batch.input.avgGreyRate || batch.input.rate);
        const acc = entry(desc);
        acc.sold += qty;
        acc.salesHistory.push({
          date: batch.batchDate || batch.date || '',
          party: `${batch.processorName || 'Dye House'} (Dyeing Issue)`,
          qty,
          rate,
          invoiceNo: batch.batchId ? `Batch #${batch.batchId}` : 'Batch',
          rawInvoiceNo: String(batch.batchId || ''),
          amount: round2(qty * rate),
          isDyeingIssue: true,
        });
      }

      // 2. Finished Colored Rolls produced from dyeing (increases finished available stock at manufactured unit cost)
      if (batch.status === 'COMPLETED' && Array.isArray(batch.output)) {
        batch.output.forEach((out) => {
          if (!out.description) return;
          const desc = String(out.description).trim();
          const qty = toNum(out.qty);
          const unitCost = toNum(out.unitCost);
          const acc = entry(desc);
          acc.purchased += qty;
          acc.purchaseHistory.push({
            date: batch.completedAt || batch.batchDate || '',
            party: `${batch.processorName || 'Dye House'} (Finished Receipt)`,
            qty,
            rate: unitCost,
            invoiceNo: batch.batchId ? `Batch #${batch.batchId}` : 'Batch',
            rawInvoiceNo: String(batch.batchId || ''),
            amount: round2(qty * unitCost),
            isDyeingReceipt: true,
          });
        });
      }
    });
  }

  // Account for combing & processing batches (Workflow: Dyeing -> Combing -> Stock)
  if (Array.isArray(combingBatches)) {
    combingBatches.forEach((batch) => {
      if (batch.status === 'CANCELLED') return;

      // 1. Fabric issued to combing (reduces input dyed/colored fabric available stock)
      if (batch.input?.description) {
        const desc = String(batch.input.description).trim();
        const qty = toNum(batch.input.qty);
        const rate = toNum(batch.input.avgRate || batch.input.rate);
        const acc = entry(desc);
        acc.sold += qty;
        acc.salesHistory.push({
          date: batch.batchDate || batch.date || '',
          party: `${batch.processorName || 'Combing Mill'} (Combing Issue)`,
          qty,
          rate,
          invoiceNo: batch.batchId ? `Batch #${batch.batchId}` : 'Batch',
          rawInvoiceNo: String(batch.batchId || ''),
          amount: round2(qty * rate),
          isCombingIssue: true,
        });
      }

      // 2. Finished Combed/Processed fabric produced (increases finished available stock at manufactured unit cost)
      if (batch.status === 'COMPLETED' && Array.isArray(batch.output)) {
        batch.output.forEach((out) => {
          if (!out.description) return;
          const desc = String(out.description).trim();
          const qty = toNum(out.qty);
          const unitCost = toNum(out.unitCost);
          const acc = entry(desc);
          acc.purchased += qty;
          acc.purchaseHistory.push({
            date: batch.completedAt || batch.batchDate || '',
            party: `${batch.processorName || 'Combing Mill'} (Combed Receipt)`,
            qty,
            rate: unitCost,
            invoiceNo: batch.batchId ? `Batch #${batch.batchId}` : 'Batch',
            rawInvoiceNo: String(batch.batchId || ''),
            amount: round2(qty * unitCost),
            isCombingReceipt: true,
          });
        });
      }
    });
  }

  const rows = Array.from(stockMap, ([description, acc]) => {
    const opening = round3(acc.opening);
    const purchased = round3(acc.purchased);
    const sold = round3(acc.sold);
    const totalPurchaseCost = acc.purchaseHistory.reduce((sum, e) => sum + (e.qty > 0 ? e.amount : 0), 0);
    const totalPositivePurchasedQty = acc.purchaseHistory.reduce(
      (sum, e) => sum + (e.qty > 0 ? e.qty : 0),
      0,
    );
    const avgPurchaseRate =
      totalPositivePurchasedQty > 0
        ? round2(totalPurchaseCost / totalPositivePurchasedQty)
        : purchased > 0
          ? round2(totalPurchaseCost / purchased)
          : 0;

    return {
      description,
      opening,
      purchased,
      avgPurchaseRate,
      sold,
      available: round3(opening + purchased - sold),
      minStockLevel: acc.minStockLevel || 0,
      purchaseHistory: sortHistory(acc.purchaseHistory),
      salesHistory: sortHistory(acc.salesHistory),
    };
  }).sort((a, b) => a.description.localeCompare(b.description));
  return {
    rows,
    summary: { totalSales, totalPurchases, cashReceived, netProfitLoss: totalSales - totalPurchases },
  };
}
/**
 * Lookup Map for the bill screens (Sales / Purchase Bill, dyeing / combing pickers): each row under its trimmed
 * description, plus a lower-case fallback key that never replaces another row's exact key (when two rows differ only
 * by case, the exact casing always finds its own row; the lower-case key goes to the first row that claims it).
 */
export function buildStockMap(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const key = (r.description || '').trim();
    if (!key) return;
    map.set(key, {
      available: r.available,
      minStockLevel: r.minStockLevel || 0,
      avgPurchaseRate: r.avgPurchaseRate || 0,
      purchased: r.purchased || 0,
      purchaseHistory: r.purchaseHistory || [],
    });
  });
  // fallbacks after every exact key is in, so a fallback can never shadow a real description
  Array.from(map.entries()).forEach(([key, info]) => {
    const lower = key.toLowerCase();
    if (!map.has(lower)) map.set(lower, info);
  });
  return map;
}
/** The stock-map entry of a description: exact (trimmed) key first, then the lower-case fallback; null if unknown. */
export function lookupStock(stockMap, description) {
  const key = String(description ?? '').trim();
  if (!key || !stockMap) return null;
  return stockMap.get(key) ?? stockMap.get(key.toLowerCase()) ?? null;
}
/** Case-insensitive substring of the description. (The web page did not trim the term; trailing spaces from keyboards are ignored here.) */
export function filterStocks(rows, term) {
  const q = term.trim().toLowerCase();
  return q ? rows.filter((r) => r.description.toLowerCase().includes(q)) : rows;
}
export function stockTone(available) {
  return available > 0 ? 'positive' : available < 0 ? 'negative' : 'zero';
}
/** Detail-sheet total: sum of the (2-decimal rounded) amounts, formatted `toFixed(2)` like the web table. */
export function historyTotal(entries) {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
/** Total quantity across history entries. */
export function historyQty(entries) {
  return round3(entries.reduce((sum, e) => sum + e.qty, 0));
}
/** Invoice number as the web history tables printed it ("P-" prefix dropped, for sales rows too). */
export function historyInvoiceNo(invoiceNo) {
  return invoiceNo.replace('P-', '');
}
/** Date column of the history tables (3/10/2026); unparseable values are shown as stored. */
export function historyDate(date) {
  return date ? formatDateIN(date) : '';
}
// ------------------------------------------------------------------ opening stock input
export const OPENING_STOCK_INVALID = 'You need to write a valid number!';
/** Validation of the quantity prompt: non-empty and parseable (0 and negatives are accepted, like the web prompt). */
export function parseOpeningStockQty(input) {
  const value = input.trim();
  if (!value || Number.isNaN(parseFloat(value))) return { error: OPENING_STOCK_INVALID };
  return { qty: parseFloat(value) };
}
/** Which opening-stock actions a row offers: "Add Old Stock" when there is none, else Edit + Delete. */
export function openingActions(row) {
  return row.opening > 0 ? 'edit' : 'add';
}
