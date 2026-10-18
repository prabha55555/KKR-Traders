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

  // Outstanding logic is cumulative, not bound to the date filter.
  // It uses the ledger balances.
  let customerOutstanding = 0;
  let suppliersOutstanding = 0;
  let customersWithDues = 0;
  let suppliersWithDues = 0;

  const custLedger = new Map();
  for (const inv of data.salesBills) {
    if (!inv.customerName) continue;
    const c = custLedger.get(inv.customerName) || { latestDate: 0, balance: 0, returns: 0 };
    const dTime = new Date(inv.invoiceDate || inv.date || 0).getTime();
    if (dTime >= c.latestDate) {
      c.latestDate = dTime;
      c.balance = toNum(inv.balanceDue);
    }
    custLedger.set(inv.customerName, c);
  }
  for (const r of data.salesReturns) {
    const inv = data.salesBills.find((i) => String(i.invoiceNo) === String(r.invoiceNo));
    if (inv && inv.customerName) {
      const c = custLedger.get(inv.customerName);
      if (c) c.returns += toNum(r.returnAmount);
    }
  }

  custLedger.forEach((c) => {
    const due = c.balance - c.returns;
    if (due > 0) {
      customerOutstanding += due;
      customersWithDues++;
    }
  });

  const supLedger = new Map();
  for (const bill of data.purchaseBills) {
    if (!bill.supplierName) continue;
    const s = supLedger.get(bill.supplierName) || { latestDate: 0, balance: 0, returns: 0 };
    const dTime = new Date(bill.invoiceDate || bill.date || 0).getTime();
    if (dTime >= s.latestDate) {
      s.latestDate = dTime;
      s.balance = toNum(bill.payment?.balanceDue || bill.balanceDue);
    }
    supLedger.set(bill.supplierName, s);
  }
  for (const r of data.purchaseReturns) {
    const inv = data.purchaseBills.find((i) => String(i.invoiceNo) === String(r.invoiceNo));
    if (inv && inv.supplierName) {
      const s = supLedger.get(inv.supplierName);
      if (s) s.returns += toNum(r.returnAmount);
    }
  }

  supLedger.forEach((s) => {
    const due = s.balance - s.returns;
    if (due > 0) {
      suppliersOutstanding += due;
      suppliersWithDues++;
    }
  });

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

function aggregatePeriod(data, range, avgCostLookup) {
  let salesAmount = 0;
  let salesCount = 0;
  let profitAmount = 0;
  let purchasesAmount = 0;
  let expensesAmount = 0;

  for (const bill of data.salesBills || []) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      salesAmount += toNum(bill.grandTotal);
      salesCount++;
      profitAmount += getBillProfit(bill, avgCostLookup);
    }
  }

  for (const bill of data.purchaseBills || []) {
    const date = bill.invoiceDate || bill.date || bill.timestamp;
    if (isWithinRange(date, range)) {
      purchasesAmount += toNum(bill.grandTotal);
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
