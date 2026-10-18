/**
 * Available stock + financial summary (port of `loadStocks` / the search handler in js/stocks.js).
 *
 * available = opening stock + purchased qty - sold qty, where purchase returns lower `purchased`, sales returns lower
 * `sold`, fabric issued to dyeing / combing counts as sold and their finished receipts as purchased. Products are matched by their TRIMMED description,
 * case-sensitively — "Cotton" and "COTTON" are two stock rows, unlike the revenue page which upper-cases.
 * avgPurchaseRate = weighted average rate of the positive purchase entries (purchase-bill lines + dyeing / combing
 * receipts at their unit cost); purchase returns and opening stock (no price) are left out.
 *
 * FINANCIAL SUMMARY (same figures as the Statistics page for all time): Total Sales / Total Purchases = each bill's own
 * amount less the value of the returns entered against it (returnAmount, else amount, else qty × rate — returned goods
 * re-enter / leave stock, refunded or settled on the balance alike); Net Profit / Loss = net sales − net purchases;
 * Cash Received = amount paid on the invoices less the sales returns refunded in cash / to an account.
 *
 * ROLLS are counted the same way, next to the quantity: availableRolls = openingRolls + purchasedRolls - soldRolls, from
 * the optional `rolls` of opening stock, bill lines, returns and processing-lot movements. A line without a roll count
 * adds 0, and rolls never touch the quantities or the money.
 */
import { formatDateIN, formatInvoiceNo, invoiceNoLabel, toNum } from '@/core/format';
import { PURCHASE_LEDGER, SALES_LEDGER, billAmount, isBalanceReturn } from '@/core/ledger';
import { returnValue } from '@/features/overview/revenue/revenueLogic';
import { LOT_STATUS, formatDcNo, lotStockMovements } from '@/features/processing/lotLogic';
const round3 = (n) => Math.round(n * 1000) / 1000;
const round2 = (n) => Number(n.toFixed(2));
const newAccumulator = (opening = 0) => ({
  opening,
  purchased: 0,
  sold: 0,
  openingRolls: 0,
  purchasedRolls: 0,
  soldRolls: 0,
  minStockLevel: 0,
  purchaseHistory: [],
  salesHistory: [],
});
/**
 * Roll count of an old dyeing / combing batch input or output: only an explicit `rolls`. Their `unit` is NOT used — the
 * old batch forms stored a fixed 'Rolls' unit while the quantity was weighed and counted with the kg of the bills (weight
 * loss %), so reading that quantity as rolls would invent roll counts.
 */
const batchRolls = (part) => toNum(part?.rolls);
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
  processingLots = [],
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
    const acc = entry(description);
    acc.opening = toNum(stock.qty);
    acc.openingRolls = toNum(stock.rolls);
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
      const rolls = toNum(product.rolls);
      const rate = toNum(product.rate);
      const acc = entry(String(product.description).trim());
      acc.purchased += qty;
      acc.purchasedRolls += rolls;
      acc.purchaseHistory.push({
        date: bill.invoiceDate || bill.date || '',
        party: bill.supplierName || 'Unknown',
        qty,
        rolls,
        rate,
        invoiceNo: String(bill.invoiceNo || ''),
        rawInvoiceNo: String(bill.invoiceNo || ''),
        amount: round2(qty * rate),
      });
    });
  });

  // Account for purchase returns (goods returned to supplier decrease purchased stock)
  if (Array.isArray(purchaseReturns)) {
    // Total Purchases is net of the goods sent back against a loaded bill (as Statistics attaches them to their bill)
    const purchaseBillNos = new Set(purchaseBills.map((bill) => String(bill.invoiceNo)));
    purchaseReturns.forEach((pr) => {
      if (purchaseBillNos.has(String(pr.invoiceNo ?? ''))) totalPurchases -= returnValue(pr);
      if (!pr.description) return;
      const qty = toNum(pr.qty);
      const rolls = toNum(pr.rolls);
      const rate = toNum(pr.rate);
      const acc = entry(String(pr.description).trim());
      acc.purchased -= qty;
      acc.purchasedRolls -= rolls;
      acc.purchaseHistory.push({
        date: pr.returnDate || pr.date || '',
        party: `${pr.supplierName || 'Supplier'} (Return)`,
        qty: -qty,
        rolls: -rolls,
        rate,
        invoiceNo: pr.invoiceNo ? `Return - ${invoiceNoLabel(pr.invoiceNo)}` : 'Return',
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
      const rolls = toNum(product.rolls);
      const rate = toNum(product.rate);
      const acc = entry(String(product.description).trim());
      acc.sold += qty;
      acc.soldRolls += rolls;
      acc.salesHistory.push({
        date: invoice.invoiceDate || invoice.date || '',
        party: invoice.customerName || 'Unknown',
        qty,
        rolls,
        rate,
        invoiceNo: String(invoice.invoiceNo || ''),
        rawInvoiceNo: String(invoice.invoiceNo || ''),
        amount: round2(qty * rate),
      });
    });
  });

  // Account for sales returns (goods returned by customer decrease sold stock / add back to stock)
  if (Array.isArray(salesReturns)) {
    // Total Sales is net of the goods returned against a loaded invoice (as Statistics attaches them to their bill)
    const invoiceNos = new Set(salesInvoices.map((invoice) => String(invoice.invoiceNo)));
    salesReturns.forEach((sr) => {
      if (invoiceNos.has(String(sr.invoiceNo ?? ''))) totalSales -= returnValue(sr);
      // a refunded return (Cash / Account) handed the money back: Cash Received is net of it, as in Finance
      const refund = isBalanceReturn(sr) ? 0 : toNum(sr.returnAmount) || toNum(sr.amount);
      if (refund > 0) cashReceived -= refund;
      if (!sr.description) return;
      const qty = toNum(sr.qty);
      const rolls = toNum(sr.rolls);
      const rate = toNum(sr.rate);
      const acc = entry(String(sr.description).trim());
      acc.sold -= qty;
      acc.soldRolls -= rolls;
      acc.salesHistory.push({
        date: sr.returnDate || sr.date || '',
        party: `${sr.customerName || 'Customer'} (Return)`,
        qty: -qty,
        rolls: -rolls,
        rate,
        invoiceNo: sr.invoiceNo ? `Return - ${invoiceNoLabel(sr.invoiceNo)}` : 'Return',
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
        const rolls = batchRolls(batch.input);
        const rate = toNum(batch.input.avgGreyRate || batch.input.rate);
        const acc = entry(desc);
        acc.sold += qty;
        acc.soldRolls += rolls;
        acc.salesHistory.push({
          date: batch.batchDate || batch.date || '',
          party: `${batch.processorName || 'Dye House'} (Dyeing Issue)`,
          qty,
          rolls,
          rate,
          invoiceNo: batch.batchId ? `Batch ${batch.batchId}` : 'Batch',
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
          const rolls = batchRolls(out);
          const unitCost = toNum(out.unitCost);
          const acc = entry(desc);
          acc.purchased += qty;
          acc.purchasedRolls += rolls;
          acc.purchaseHistory.push({
            date: batch.completedAt || batch.batchDate || '',
            party: `${batch.processorName || 'Dye House'} (Finished Receipt)`,
            qty,
            rolls,
            rate: unitCost,
            invoiceNo: batch.batchId ? `Batch ${batch.batchId}` : 'Batch',
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
        const rolls = batchRolls(batch.input);
        const rate = toNum(batch.input.avgRate || batch.input.rate);
        const acc = entry(desc);
        acc.sold += qty;
        acc.soldRolls += rolls;
        acc.salesHistory.push({
          date: batch.batchDate || batch.date || '',
          party: `${batch.processorName || 'Combing Mill'} (Combing Issue)`,
          qty,
          rolls,
          rate,
          invoiceNo: batch.batchId ? `Batch ${batch.batchId}` : 'Batch',
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
          const rolls = batchRolls(out);
          const unitCost = toNum(out.unitCost);
          const acc = entry(desc);
          acc.purchased += qty;
          acc.purchasedRolls += rolls;
          acc.purchaseHistory.push({
            date: batch.completedAt || batch.batchDate || '',
            party: `${batch.processorName || 'Combing Mill'} (Combed Receipt)`,
            qty,
            rolls,
            rate: unitCost,
            invoiceNo: batch.batchId ? `Batch ${batch.batchId}` : 'Batch',
            rawInvoiceNo: String(batch.batchId || ''),
            amount: round2(qty * unitCost),
            isCombingReceipt: true,
          });
        });
      }
    });
  }

  // Processing lots (Issue -> Dyeing -> Combing -> Received): grey leaves stock on my DC, the finished fabric enters
  // stock only when it is received back, at the lot's cost per kg. Rolls move with every DC (m.rolls, 0 when not typed).
  // `lotStatus` = where the lot is now, so its history line opens the right lot page (processingLotLink).
  (processingLots || []).forEach((lot) => {
    lotStockMovements(lot).forEach((m) => {
      const acc = entry(m.description);
      const rolls = toNum(m.rolls);
      const line = {
        date: m.date,
        party: m.party,
        qty: m.qty,
        rolls,
        rate: m.rate,
        invoiceNo: m.ref,
        rawInvoiceNo: m.rawRef,
        amount: round2(m.qty * m.rate),
        lotStatus: lot.status,
      };
      if (m.kind === 'issue') {
        acc.sold += m.qty;
        acc.soldRolls += rolls;
        acc.salesHistory.push({ ...line, isProcessingIssue: true });
      } else {
        // the finished receipt, or fabric a unit sent back unprocessed
        acc.purchased += m.qty;
        acc.purchasedRolls += rolls;
        acc.purchaseHistory.push(
          m.kind === 'return'
            ? { ...line, isProcessingReturn: true }
            : { ...line, isProcessingReceipt: true },
        );
      }
    });
  });

  const rows = Array.from(stockMap, ([description, acc]) => {
    const opening = round3(acc.opening);
    const purchased = round3(acc.purchased);
    const sold = round3(acc.sold);
    const openingRolls = round3(acc.openingRolls);
    const purchasedRolls = round3(acc.purchasedRolls);
    const soldRolls = round3(acc.soldRolls);
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
      openingRolls,
      purchasedRolls,
      soldRolls,
      availableRolls: round3(openingRolls + purchasedRolls - soldRolls),
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
      availableRolls: r.availableRolls || 0,
      // the product has ever been counted in rolls (the bill hints show its rolls only then)
      hasRolls: hasRolls(r),
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
/** Total rolls across history entries (entries without a roll count add 0). */
export function historyRolls(entries) {
  return round3(entries.reduce((sum, e) => sum + toNum(e.rolls), 0));
}
/** A stock row that has ever been counted in rolls (opening, purchased or sold rolls). */
export function hasRolls(row) {
  return Boolean(toNum(row?.openingRolls) || toNum(row?.purchasedRolls) || toNum(row?.soldRolls));
}
/** "12 rolls" / "1 roll". */
export const rollsText = (rolls) => `${rolls} ${Math.abs(toNum(rolls)) === 1 ? 'roll' : 'rolls'}`;
/**
 * Stock as the bill screens show it: "80 kg · 12 rolls" for a product counted in rolls, otherwise just the quantity
 * (as before rolls existed). `stock` = a stock-map entry (lookupStock).
 */
export function stockLabel(stock) {
  if (!stock) return '';
  return stock.hasRolls
    ? `${stock.available} kg · ${rollsText(stock.availableRolls)}`
    : String(stock.available);
}
/**
 * The "Invoice No" column of the stock history: the plain invoice number ("P-" prefix / "#" dropped, see core/format).
 * Return / batch / DC references ("Return - Invoice No 001", "Batch B-001", "DC-001") come out unchanged.
 */
export function historyInvoiceNo(invoiceNo) {
  return formatInvoiceNo(invoiceNo);
}
/**
 * Page a processing-lot history line opens, searched by the lot's DC: a received lot on Completed Lots, an ongoing one
 * on Processing Lots at the stage it is in NOW (that page lists one stage at a time, dyeing by default).
 */
export function processingLotLink(entry) {
  const search = encodeURIComponent(formatDcNo(entry?.rawInvoiceNo));
  if (entry?.lotStatus === LOT_STATUS.RECEIVED || entry?.isProcessingReceipt)
    return `/processing/completed?search=${search}`;
  const stage = entry?.lotStatus === LOT_STATUS.AT_COMBING ? 'combing' : 'dyeing';
  return `/processing/lots?search=${search}&stage=${stage}`;
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
export const OPENING_ROLLS_INVALID = 'Rolls must be a whole number (or leave it blank).';
/** The optional roll count of the opening stock: blank = 0, otherwise a whole number of 0 or more. */
export function parseOpeningStockRolls(input) {
  const value = String(input ?? '').trim();
  if (!value) return { rolls: 0 };
  if (!/^\d+$/.test(value)) return { error: OPENING_ROLLS_INVALID };
  return { rolls: parseInt(value, 10) };
}
/**
 * Which opening-stock actions a row offers: "Add Old Stock" when there is none (no quantity, no rolls), else Edit +
 * Delete. A negative opening (the form accepts it) is an opening stock too.
 */
export function openingActions(row) {
  return toNum(row.opening) !== 0 || toNum(row.openingRolls) !== 0 ? 'edit' : 'add';
}
