import { describe, it, expect } from 'vitest';
import {
  computeAnalytics,
  getBillProfit,
  isWithinRange,
  parseAnyDate,
  dateRanges,
} from '@/features/overview/revenue/dashboardAnalytics';
import { buildAvgCostLookup } from '@/features/overview/revenue/revenueLogic';

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
    const todayStr = new Date().toISOString().slice(0, 10);
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
    const todayStr = new Date().toISOString().slice(0, 10);
    expect(isWithinRange(todayStr, range)).toBe(true);

    // Old date from 2 years ago
    expect(isWithinRange('2024-01-01', range)).toBe(false);
  });
});
