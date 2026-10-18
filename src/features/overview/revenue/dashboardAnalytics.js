import { db } from '@/core/db';
import { toNum, parseISODate } from '@/core/format';
import {
  isSameDay,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  subDays,
  subMonths,
} from 'date-fns';
import { purchaseAmountPaid } from '@/core/billing';
import { billOwnAmount } from '../billOwnAmount';
import {
  PURCHASE_LEDGER,
  SALES_LEDGER,
  groupParties,
  partySummary,
  returnsTotalsByInvoice,
} from '@/core/ledger';
import {
  buildAvgCostLookup,
  invoiceDiscount,
  returnValue,
  returnsByBill,
  salesReturnsOfBill,
} from './revenueLogic';

/**
 * Robust date parser: Handles pure YYYY-MM-DD dates at local noon, full timestamps, and numbers
 */
export function parseAnyDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === 'number') return new Date(val);
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return parseISODate(str);
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? parseISODate(str) : d;
}

/**
 * Filter data by date range
 */
export const dateRanges = {
  today: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }),
  yesterday: () => {
    const yesterday = subDays(new Date(), 1);
    return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
  },
  thisWeek: () => ({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: endOfWeek(new Date(), { weekStartsOn: 1 }),
  }),
  thisMonth: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }),
  lastMonth: () => {
    const lastM = subMonths(new Date(), 1);
    return { start: startOfMonth(lastM), end: endOfMonth(lastM) };
  },
  thisQuarter: () => ({ start: startOfQuarter(new Date()), end: endOfQuarter(new Date()) }),
  thisYear: () => ({ start: startOfYear(new Date()), end: endOfYear(new Date()) }),
};

export const getPreviousPeriod = (rangeKey) => {
  const now = new Date();
  switch (rangeKey) {
    case 'today': {
      const y = subDays(now, 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'yesterday': {
      const y2 = subDays(now, 2);
      return { start: startOfDay(y2), end: endOfDay(y2) };
    }
    case 'thisWeek': {
      const lw = subDays(startOfWeek(now, { weekStartsOn: 1 }), 7);
      return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) };
    }
    case 'thisMonth': {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
    case 'lastMonth': {
      const l2m = subMonths(now, 2);
      return { start: startOfMonth(l2m), end: endOfMonth(l2m) };
    }
    case 'thisQuarter': {
      const lq = subMonths(startOfQuarter(now), 3);
      return { start: startOfQuarter(lq), end: endOfQuarter(lq) };
    }
    case 'thisYear': {
      const ly = subMonths(startOfYear(now), 12);
      return { start: startOfYear(ly), end: endOfYear(ly) };
    }
    default:
      return null;
  }
};

export const isWithinRange = (dateString, { start, end }) => {
  if (!dateString) return false;
  const d = parseAnyDate(dateString);
  if (!d) return false;
  const time = d.getTime();
  return time >= start.getTime() && time <= end.getTime();
};

/**
 * Computes profit for a sales bill by matching products with average purchase costs
 */
export function getBillProfit(bill, avgCostLookup) {
  if (bill.computedProfit !== undefined) return toNum(bill.computedProfit);
  if (bill.profit !== undefined && bill.profit !== null && bill.profit !== '') return toNum(bill.profit);

  let totalBillProfit = 0;
  if (bill.products && Array.isArray(bill.products)) {
    bill.products.forEach((p) => {
      const description = p.description || '';
      const qty = toNum(p.qty);
      const sellingRate = toNum(p.rate);
      const costRate = avgCostLookup ? avgCostLookup(description) : toNum(p.purchaseRate || p.costRate || 0);
      const profitPerUnit = sellingRate - costRate;
      totalBillProfit += profitPerUnit * qty;
    });
  }
  const discount = invoiceDiscount(bill);
  return totalBillProfit - discount;
}

export async function fetchDashboardData() {
  const [
    salesBills,
    purchaseBills,
    expenses,
    customers,
    suppliers,
    salesReturns,
    purchaseReturns,
    dyeingBatches,
    combingBatches,
    processingLots,
  ] = await Promise.all([
    db.getAllInvoices(),
    db.getAllPurchaseBills(),
    db.getAllExpenses ? db.getAllExpenses() : Promise.resolve([]),
    db.getAllCustomers(),
    db.getAllSuppliers(),
    db.getAllReturns(),
    db.getAllPurchaseReturns(),
    db.getAllDyeingBatches ? db.getAllDyeingBatches() : Promise.resolve([]),
    db.getAllCombingBatches ? db.getAllCombingBatches() : Promise.resolve([]),
    db.getAllProcessingLots ? db.getAllProcessingLots().catch(() => []) : Promise.resolve([]),
  ]);
  return prepareDashboardData({
    salesBills,
    purchaseBills,
    expenses,
    customers,
    suppliers,
    salesReturns,
    purchaseReturns,
    dyeingBatches,
    combingBatches,
    processingLots,
  });
}

/**
 * The loaded collections as the Statistics page reads them: the average-cost lookup, every sales bill with its
 * `computedProfit` (less what its sales returns took back) and `computedReturns` (value of the goods returned against
 * it), and every purchase bill with `computedReturns` (value of the goods sent back to the supplier). Returned goods
 * re-enter / leave stock, so Sales, Purchases and Profit are shown net of them (see netSalesValue / netPurchaseValue).
 * Purchase returns stay out of the average cost, as they stay out of the Stocks average purchase rate.
 */
export function prepareDashboardData({
  salesBills,
  purchaseBills,
  expenses,
  customers,
  suppliers,
  salesReturns,
  purchaseReturns,
  dyeingBatches,
  combingBatches,
  processingLots,
} = {}) {
  const pBills = purchaseBills || [];
  const batches = dyeingBatches || [];
  const cBatches = combingBatches || [];
  const avgCostLookup = buildAvgCostLookup(pBills, batches, cBatches, processingLots || []);
  const salesReturnsOf = returnsByBill(salesReturns);
  const purchaseReturnsOf = returnsByBill(purchaseReturns);

  // Pre-calculate accurate profit for each bill using purchase cost history, less its sales returns
  const enrichedSalesBills = (salesBills || []).map((bill) => {
    const returned = salesReturnsOfBill(salesReturnsOf.get(String(bill.invoiceNo)), avgCostLookup);
    return {
      ...bill,
      computedProfit: getBillProfit(bill, avgCostLookup) - returned.profit,
      computedReturns: returned.amount,
    };
  });
  const enrichedPurchaseBills = pBills.map((bill) => ({
    ...bill,
    computedReturns: (purchaseReturnsOf.get(String(bill.invoiceNo)) || []).reduce(
      (sum, r) => sum + returnValue(r),
      0,
    ),
  }));

  return {
    salesBills: enrichedSalesBills,
    purchaseBills: enrichedPurchaseBills,
    dyeingBatches: batches,
    combingBatches: cBatches,
    expenses: expenses || [],
    customers: customers || [],
    suppliers: suppliers || [],
    salesReturns: salesReturns || [],
    purchaseReturns: purchaseReturns || [],
    avgCostLookup,
  };
}

/** `data` = prepareDashboardData's result (raw collections are prepared first). */
export function computeAnalytics(rawData, rangeKey) {
  const data = typeof rawData.avgCostLookup === 'function' ? rawData : prepareDashboardData(rawData);
  const range = dateRanges[rangeKey] ? dateRanges[rangeKey]() : null;
  const previousRange = getPreviousPeriod(rangeKey);
  const { avgCostLookup } = data;

  const current = range
    ? aggregatePeriod(data, range, avgCostLookup)
    : aggregatePeriod(data, { start: new Date(0), end: new Date(2100, 1, 1) }, avgCostLookup);
  const previous = previousRange ? aggregatePeriod(data, previousRange, avgCostLookup) : null;

  // Outstanding is cumulative (not bound to the date filter): each party's ledger closing balance.
  const customers = outstandingParties(SALES_LEDGER, data.salesBills, data.salesReturns);
  const suppliers = outstandingParties(PURCHASE_LEDGER, data.purchaseBills, data.purchaseReturns);
  const customerOutstanding = customers.total;
  const customersWithDues = customers.count;
  const suppliersOutstanding = suppliers.total;
  const suppliersWithDues = suppliers.count;

  return {
    current,
    previous,
    customerOutstanding,
    customersWithDues,
    suppliersOutstanding,
    suppliersWithDues,
    stockValue: 0,
    totalProducts: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
  };
}

/** A bill that names a party (bills without a name or phone are not part of any ledger). */
const hasParty = (kind, bill) =>
  Boolean(String(kind.name(bill) ?? '').trim() || String(kind.phone(bill) ?? '').trim());

/**
 * Parties of one kind grouped exactly like the ledger chains them, with what each owes now
 * (partySummary(...).balance = closing of the latest bill; returns refunded in cash / bank do not lower it).
 */
export function partyBalances(kind, bills, returns) {
  const returnsByInvoice = returnsTotalsByInvoice(returns);
  return groupParties(
    kind,
    (bills || []).filter((b) => hasParty(kind, b)),
  ).map((group) => ({ ...group, ...partySummary(kind, group.bills, { returnsByInvoice }) }));
}

/** Σ of the positive party balances and how many parties owe something. */
function outstandingParties(kind, bills, returns) {
  let total = 0;
  let count = 0;
  partyBalances(kind, bills, returns).forEach(({ balance }) => {
    if (balance > 0) {
      total += balance;
      count++;
    }
  });
  return { total: Math.round(total * 100) / 100, count };
}

/** Bill -> its ledger party `{ key, name }` (for per-party totals that must not split or merge by exact name). */
export function partyOfBill(kind, bills) {
  const map = new Map();
  groupParties(
    kind,
    (bills || []).filter((b) => hasParty(kind, b)),
  ).forEach(({ key, name, bills: members }) => members.forEach((b) => map.set(b, { key, name })));
  return map;
}

/** What a sales invoice itself billed (no carried previous balance). */
export const salesBillValue = (bill) => billOwnAmount(bill, SALES_LEDGER);
/** What a purchase bill itself billed (no carried previous balance). */
export const purchaseBillValue = (bill) => billOwnAmount(bill, PURCHASE_LEDGER);
/** Amount paid on a purchase bill (nested `payment.totalPaid` or top-level `amountPaid`). */
export const purchasePaid = (bill) => toNum(purchaseAmountPaid(bill));
/** A sales invoice's own amount less the goods returned against it (`computedReturns`, see prepareDashboardData). */
export const netSalesValue = (bill) => salesBillValue(bill) - toNum(bill.computedReturns);
/** A purchase bill's own amount less the goods sent back against it (`computedReturns`, see prepareDashboardData). */
export const netPurchaseValue = (bill) => purchaseBillValue(bill) - toNum(bill.computedReturns);

/**
 * The Statistics "top 5" tables of the bills dated in `range` (`data` = prepareDashboardData's result): customers by
 * sales, suppliers by purchases (both net of the bill's returns) and products by quantity sold, each sales return taken
 * off its product (qty, revenue and profit at the same average cost the sale was charged at).
 */
export function computeInsights(data, range) {
  const custMap = new Map();
  const supMap = new Map();
  const prodMap = new Map();
  const avgCost = data.avgCostLookup || (() => 0);
  const salesReturnsOf = returnsByBill(data.salesReturns);
  // parties as the ledger groups them (phone first), so two customers sharing a name are not merged
  const customerOf = partyOfBill(SALES_LEDGER, data.salesBills);
  const supplierOf = partyOfBill(PURCHASE_LEDGER, data.purchaseBills);
  const addProduct = (description, qty, revenue, profit) => {
    const name = String(description).trim();
    const pd = prodMap.get(name) || { name, qty: 0, revenue: 0, profit: 0 };
    pd.qty += qty;
    pd.revenue += revenue;
    pd.profit += profit;
    prodMap.set(name, pd);
  };

  (data.salesBills || []).forEach((bill) => {
    const d = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(d, range)) {
      // Customer aggregation
      const party = customerOf.get(bill);
      if (party) {
        const c = custMap.get(party.key) || {
          key: party.key,
          name: party.name,
          sales: 0,
          paid: 0,
          invoices: 0,
        };
        c.sales += netSalesValue(bill);
        c.paid += toNum(bill.amountPaid);
        c.invoices++;
        custMap.set(party.key, c);
      }

      // Product aggregation
      if (bill.products && Array.isArray(bill.products)) {
        bill.products.forEach((p) => {
          if (!p.description) return;
          const qty = toNum(p.qty);
          const rate = toNum(p.rate);
          const cost = avgCost(p.description);
          const itemProfit = (rate - cost) * qty;
          addProduct(p.description, qty, toNum(p.amount) || rate * qty, toNum(p.totalProfit ?? itemProfit));
        });
      }
      // the bill's sales returns: back into stock, so off the product's qty, revenue and profit
      salesReturnsOfBill(salesReturnsOf.get(String(bill.invoiceNo)), avgCost).lines.forEach((l) =>
        addProduct(l.description, l.qty, l.amount, l.totalProfit),
      );
    }
  });

  (data.purchaseBills || []).forEach((bill) => {
    const d = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(d, range)) {
      // Supplier aggregation
      const party = supplierOf.get(bill);
      if (party) {
        const s = supMap.get(party.key) || {
          key: party.key,
          name: party.name,
          purchases: 0,
          paid: 0,
          bills: 0,
        };
        s.purchases += netPurchaseValue(bill);
        s.paid += purchasePaid(bill);
        s.bills++;
        supMap.set(party.key, s);
      }
    }
  });

  return {
    topCustomers: Array.from(custMap.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5),
    topSuppliers: Array.from(supMap.values())
      .sort((a, b) => b.purchases - a.purchases)
      .slice(0, 5),
    topProducts: Array.from(prodMap.values())
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5),
  };
}

function aggregatePeriod(data, range, avgCostLookup) {
  let salesAmount = 0;
  let salesCount = 0;
  let profitAmount = 0;
  let purchasesAmount = 0;
  let expensesAmount = 0;

  for (const bill of data.salesBills || []) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      salesAmount += netSalesValue(bill);
      salesCount++;
      profitAmount += getBillProfit(bill, avgCostLookup);
    }
  }

  for (const bill of data.purchaseBills || []) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      purchasesAmount += netPurchaseValue(bill);
    }
  }

  for (const exp of data.expenses || []) {
    const date = exp.date || exp.timestamp;
    if (isWithinRange(date, range)) {
      expensesAmount += toNum(exp.amount);
    }
  }

  return {
    salesAmount,
    salesCount,
    profitAmount,
    purchasesAmount,
    expensesAmount,
  };
}
