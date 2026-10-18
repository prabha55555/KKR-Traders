import { describe, it, expect } from 'vitest';
import {
  computeAnalytics,
  getBillProfit,
  isWithinRange,
  parseAnyDate,
  dateRanges,
} from '@/features/overview/revenue/dashboardAnalytics';
import { buildAvgCostLookup } from '@/features/overview/revenue/revenueLogic';
import { toISODate } from '@/core/format';

describe('Statistics & Dashboard Analytics', () => {
  const purchaseBills = [
    {
      invoiceNo: 'P-101',
      invoiceDate: '2026-10-01',
      products: [
        { description: 'Blue Jeans', qty: 10, rate: 500 },
        { description: 'White Shirt', qty: 20, rate: 200 },
      ],
      grandTotal: 9000,
    },
    {
      invoiceNo: 'P-102',
      invoiceDate: '2026-10-05',
      products: [{ description: 'Blue Jeans', qty: 10, rate: 600 }],
      grandTotal: 6000,
    },
  ];

  // Blue Jeans avg cost: (10*500 + 10*600) / 20 = 550
  // White Shirt avg cost: (20*200) / 20 = 200
  const avgCostLookup = buildAvgCostLookup(purchaseBills);

  it('computes accurate profit for a bill based on avg purchase costs and discounts', () => {
    const bill = {
      invoiceNo: 'INV-001',
      invoiceDate: '2026-10-10',
      products: [
        { description: 'Blue Jeans', qty: 2, rate: 800 }, // (800 - 550) * 2 = 500 profit
        { description: 'White Shirt', qty: 3, rate: 300 }, // (300 - 200) * 3 = 300 profit
      ],
      discountAmount: 100,
      grandTotal: 2400,
    };

    // Expected profit: 500 + 300 - 100 = 700
    const profit = getBillProfit(bill, avgCostLookup);
    expect(profit).toBe(700);
  });

  it('prefers pre-computed or existing bill.profit when available', () => {
    const bill = {
      invoiceNo: 'INV-002',
      invoiceDate: '2026-10-10',
      computedProfit: 1250,
      products: [],
      grandTotal: 5000,
    };

    expect(getBillProfit(bill, avgCostLookup)).toBe(1250);
  });

  it('correctly aggregates gross profit, sales, purchases and expenses in computeAnalytics', () => {
    const todayStr = toISODate(new Date()); // LOCAL date: 'today' is a local-day range
    const mockData = {
      salesBills: [
        {
          invoiceNo: 'INV-10',
          invoiceDate: todayStr,
          grandTotal: 2000,
          products: [
            { description: 'Blue Jeans', qty: 2, rate: 1000 }, // (1000 - 550) * 2 = 900 profit
          ],
        },
      ],
      purchaseBills,
      expenses: [
        {
          id: 'EXP-1',
          date: todayStr,
          amount: 250,
        },
      ],
      salesReturns: [],
      purchaseReturns: [],
      customers: [],
      suppliers: [],
    };

    const analytics = computeAnalytics(mockData, 'today');
    expect(analytics.current.salesAmount).toBe(2000);
    expect(analytics.current.profitAmount).toBe(900); // 900 profit! NOT 0!
    expect(analytics.current.expensesAmount).toBe(250);
  });

  it('parses YYYY-MM-DD dates and full ISO dates reliably with parseAnyDate', () => {
    const parsedNoon = parseAnyDate('2026-10-13');
    expect(parsedNoon).toBeInstanceOf(Date);
    expect(parsedNoon.getHours()).toBe(12);

    const parsedIso = parseAnyDate('2026-10-13T15:30:00.000Z');
    expect(parsedIso).toBeInstanceOf(Date);
    expect(parsedIso.getTime()).not.toBeNaN();
  });

  it('filters dates correctly with isWithinRange', () => {
    const range = dateRanges.thisMonth();
    const todayStr = toISODate(new Date()); // LOCAL date: 'today' is a local-day range
    expect(isWithinRange(todayStr, range)).toBe(true);

    // Old date from 2 years ago
    expect(isWithinRange('2024-01-01', range)).toBe(false);
  });
});

describe('computeAnalytics: ledger-consistent outstanding and bill values', () => {
  const base = { purchaseBills: [], expenses: [], purchaseReturns: [], customers: [], suppliers: [] };

  it('customer outstanding = ledger closing per party (carried returns not subtracted twice, refunds ignored)', () => {
    const salesBills = [
      // opening 1000; #1 500 unpaid with a 200 balance return -> 1300; #2 100 -> 1400
      {
        invoiceNo: '1',
        invoiceDate: '2026-01-01',
        customerName: 'Ravi',
        customerPhone: '9000000001',
        previousBalance: 1000,
        subtotal: 500,
        grandTotal: 1500,
        amountPaid: 0,
        balanceDue: 1500,
      },
      {
        invoiceNo: '2',
        invoiceDate: '2026-01-02',
        customerName: 'Ravi',
        customerPhone: '9000000001',
        previousBalance: 1300,
        subtotal: 100,
        grandTotal: 1400,
        amountPaid: 0,
        balanceDue: 1400,
      },
      // same name, different phone: a separate customer owing 100 (a 30 cash refund does not lower it)
      {
        invoiceNo: '3',
        invoiceDate: '2026-01-02',
        customerName: 'Ravi',
        customerPhone: '9000000002',
        subtotal: 100,
        grandTotal: 100,
        amountPaid: 0,
        balanceDue: 100,
      },
    ];
    const salesReturns = [
      { invoiceNo: '1', returnAmount: 200 },
      { invoiceNo: '3', returnAmount: 30, settlementType: 'refund', refundMethod: 'cash' },
    ];
    const a = computeAnalytics({ ...base, salesBills, salesReturns }, 'all');
    expect(a.customerOutstanding).toBe(1500);
    expect(a.customersWithDues).toBe(2);
    // Sales = the bills' own amounts (600 + 100), not grandTotal (which carries the previous balance)
    expect(a.current.salesAmount).toBe(700);
  });

  it('purchases KPI sums the bill amount; a supplier credit (negative closing) is not outstanding', () => {
    const purchaseBills = [
      {
        invoiceNo: 'P-1',
        invoiceDate: '2026-01-01',
        supplierName: 'Mill',
        subtotal: 1000,
        grandTotal: 1000,
        balanceDue: 1000,
      },
      {
        invoiceNo: 'P-2',
        invoiceDate: '2026-01-02',
        supplierName: 'Mill',
        subtotal: 500,
        previousBalance: 1000,
        grandTotal: 1500,
        balanceDue: 1500,
      },
      {
        invoiceNo: 'P-3',
        invoiceDate: '2026-01-03',
        supplierName: 'Mill',
        subtotal: 200,
        previousBalance: 1500,
        grandTotal: 1700,
        payment: { totalPaid: 2000 },
      },
    ];
    const a = computeAnalytics(
      { ...base, salesBills: [], salesReturns: [], purchaseBills, purchaseReturns: [] },
      'all',
    );
    expect(a.current.purchasesAmount).toBe(1700);
    // closing: 1000 -> 1500 -> 1500 + 200 - 2000 = -300 (advance with the supplier)
    expect(a.suppliersOutstanding).toBe(0);
    expect(a.suppliersWithDues).toBe(0);
  });
});
