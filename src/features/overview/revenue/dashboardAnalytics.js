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
import {
  PURCHASE_LEDGER,
  SALES_LEDGER,
  billAmount,
  groupParties,
  partySummary,
  returnsTotalsByInvoice,
} from '@/core/ledger';
import { buildAvgCostLookup, invoiceDiscount } from './revenueLogic';

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
  ]);

  const pBills = purchaseBills || [];
  const batches = dyeingBatches || [];
  const cBatches = combingBatches || [];
  const avgCostLookup = buildAvgCostLookup(pBills, batches, cBatches);

  // Pre-calculate accurate profit for each bill using purchase cost history
  const enrichedSalesBills = (salesBills || []).map((bill) => {
    const computedProfit = getBillProfit(bill, avgCostLookup);
    return {
      ...bill,
      computedProfit,
    };
  });

  return {
    salesBills: enrichedSalesBills,
    purchaseBills: pBills,
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

export function computeAnalytics(data, rangeKey) {
  const range = dateRanges[rangeKey] ? dateRanges[rangeKey]() : null;
  const previousRange = getPreviousPeriod(rangeKey);
  const avgCostLookup = data.avgCostLookup || buildAvgCostLookup(data.purchaseBills || []);

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
export const salesBillValue = (bill) => billAmount(bill, SALES_LEDGER);
/** What a purchase bill itself billed (no carried previous balance). */
export const purchaseBillValue = (bill) => billAmount(bill, PURCHASE_LEDGER);
/** Amount paid on a purchase bill (nested `payment.totalPaid` or top-level `amountPaid`). */
export const purchasePaid = (bill) => toNum(purchaseAmountPaid(bill));

function aggregatePeriod(data, range, avgCostLookup) {
  let salesAmount = 0;
  let salesCount = 0;
  let profitAmount = 0;
  let purchasesAmount = 0;
  let expensesAmount = 0;

  for (const bill of data.salesBills || []) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      salesAmount += salesBillValue(bill);
      salesCount++;
      profitAmount += getBillProfit(bill, avgCostLookup);
    }
  }

  for (const bill of data.purchaseBills || []) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      purchasesAmount += purchaseBillValue(bill);
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
