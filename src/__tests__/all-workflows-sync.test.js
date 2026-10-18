import { describe, expect, it } from 'vitest';
import { computeStocks } from '@/features/overview/stocks/stocksLogic';
import { buildAvgCostLookup, computeRevenueRows } from '@/features/overview/revenue/revenueLogic';
import { calcBatchTotals as calcDyeingTotals, computeGreyPurchaseRate } from '@/features/dyeing/dyeingLogic';
import { calcCombingBatchTotals, computeInputFabricRate } from '@/features/combing/combingLogic';

describe('Complete Inventory & Financial Synchronization Across All Workflows', () => {
  it('Workflow A (Trading): Purchase -> Stock -> Sales operates with 100% accuracy', () => {
    // 1. Purchase ready-made colored rolls from supplier
    const purchaseBills = [
      {
        invoiceNo: 'PB-A1',
        supplierName: 'Direct Fabric Mills',
        invoiceDate: '2026-10-01',
        grandTotal: 5000,
        products: [
          { description: 'Readymade Printed Rayon', qty: 100, rate: 50 },
        ],
      },
    ];

    // Check stock after purchase
    const { rows: stockAfterPurchase } = computeStocks(purchaseBills, [], [], [], [], [], [], []);
    const rayonStock = stockAfterPurchase.find((s) => s.description === 'Readymade Printed Rayon');
    expect(rayonStock.available).toBe(100);
    expect(rayonStock.avgPurchaseRate).toBe(50);

    // 2. Sell 40 rolls to customer on sales invoice
    const salesInvoices = [
      {
        invoiceNo: 'SI-A1',
        customerName: 'Style Garments',
        invoiceDate: '2026-10-05',
        grandTotal: 3200,
        products: [
          { description: 'Readymade Printed Rayon', qty: 40, rate: 80 },
        ],
      },
    ];

    // Check stock after sales
    const { rows: stockAfterSale } = computeStocks(purchaseBills, salesInvoices, [], [], [], [], [], []);
    const rayonStockAfterSale = stockAfterSale.find((s) => s.description === 'Readymade Printed Rayon');
    expect(rayonStockAfterSale.available).toBe(60); // 100 - 40
    expect(rayonStockAfterSale.sold).toBe(40);

    // Check profit calculation
    const costLookup = buildAvgCostLookup(purchaseBills, [], []);
    const revenueRows = computeRevenueRows(salesInvoices, costLookup);
    expect(revenueRows).toHaveLength(1);
    expect(revenueRows[0].revenue).toBe(3200); // 40 * 80
    expect(revenueRows[0].cost).toBe(2000); // 40 * 50
    expect(revenueRows[0].profit).toBe(1200); // 3200 - 2000 = 1200
  });

  it('Workflow B (Manufacturing with Combing): Purchase -> Dyeing -> Combing & Processing -> Stock -> Sales', () => {
    // 1. Purchase raw grey fabric from 2 suppliers at different rates
    // Supplier 1: 60 rolls @ ₹20 = 1200
    // Supplier 2: 40 rolls @ ₹25 = 1000
    // Total 100 rolls, total cost = 2200 => weighted average = ₹22.00 / roll
    const purchaseBills = [
      {
        invoiceNo: 'PB-B1',
        supplierName: 'Sri Balaji Grey Mills',
        invoiceDate: '2026-10-01',
        grandTotal: 1200,
        products: [{ description: 'Cotton Raw Grey 40s', qty: 60, rate: 20 }],
      },
      {
        invoiceNo: 'PB-B2',
        supplierName: 'Kaveri Yarn Traders',
        invoiceDate: '2026-10-02',
        grandTotal: 1000,
        products: [{ description: 'Cotton Raw Grey 40s', qty: 40, rate: 25 }],
      },
    ];

    const greyRate = computeGreyPurchaseRate('Cotton Raw Grey 40s', purchaseBills);
    expect(greyRate.totalQty).toBe(100);
    expect(greyRate.totalCost).toBe(2200);
    expect(greyRate.avgRate).toBe(22.00);

    // Check initial stock: 100 rolls of Cotton Raw Grey 40s available
    const { rows: initialStocks } = computeStocks(purchaseBills, [], [], [], [], [], [], []);
    expect(initialStocks.find((s) => s.description === 'Cotton Raw Grey 40s').available).toBe(100);

    // 2. Dispatch all 100 rolls for Dyeing (IN_PROCESS)
    const dyeingBatchInProcess = {
      batchId: 'B-101',
      batchDate: '2026-10-03',
      status: 'IN_PROCESS',
      processorName: 'Murugan Dyeing Works',
      input: {
        description: 'Cotton Raw Grey 40s',
        qty: 100,
        avgGreyRate: 22.00,
        totalGreyCost: 2200,
        dyeingRate: 10,
        totalDyeingCost: 1000,
      },
      dyeingRate: 10,
      totalBatchCost: 3200,
      output: [{ description: 'Cotton Dyed Royal Blue', qty: '', unitCost: 0 }],
    };

    // While in process: Grey fabric is deducted from stock (0 available). Finished goods are NOT added yet.
    const { rows: stocksDuringDyeing } = computeStocks(
      purchaseBills,
      [],
      [],
      [],
      [],
      [],
      [dyeingBatchInProcess],
      [],
    );
    expect(stocksDuringDyeing.find((s) => s.description === 'Cotton Raw Grey 40s').available).toBe(0);
    expect(stocksDuringDyeing.find((s) => s.description === 'Cotton Dyed Royal Blue')).toBeUndefined();

    // 3. Complete Dyeing Batch: Goods return. Actual weight loss 5% measured.
    // Finished output = 95 rolls.
    // Total Batch Cost = 2200 (fabric) + 1000 (dyeing) = 3200
    // Final Unit Cost = 3200 / 95 = ₹33.68
    const completedDyeingBatch = {
      ...dyeingBatchInProcess,
      status: 'COMPLETED',
      completedAt: '2026-10-06T10:00:00Z',
      weightLossPct: 5,
      totalOutputQty: 95,
      output: [{ description: 'Cotton Dyed Royal Blue', qty: 95, unitCost: 33.68 }],
    };

    const { rows: stocksAfterDyeing } = computeStocks(
      purchaseBills,
      [],
      [],
      [],
      [],
      [],
      [completedDyeingBatch],
      [],
    );
    expect(stocksAfterDyeing.find((s) => s.description === 'Cotton Raw Grey 40s').available).toBe(0);
    const dyedStock = stocksAfterDyeing.find((s) => s.description === 'Cotton Dyed Royal Blue');
    expect(dyedStock.available).toBe(95);
    expect(dyedStock.avgPurchaseRate).toBe(33.68);

    // 4. Send 95 rolls of "Cotton Dyed Royal Blue" to Combing & Processing (IN_PROCESS)
    // Rate auto-calculated from dyeing output: ₹33.68
    const inputRateInfo = computeInputFabricRate('Cotton Dyed Royal Blue', [completedDyeingBatch], []);
    expect(inputRateInfo.avgRate).toBe(33.68);

    const combingBatchInProcess = {
      batchId: 'CB-201',
      batchDate: '2026-10-07',
      status: 'IN_PROCESS',
      processorName: 'Sri Lakshmi Combing Mills',
      input: {
        description: 'Cotton Dyed Royal Blue',
        qty: 95,
        avgRate: 33.68,
        totalCost: 3199.6, // 95 * 33.68
        processingRate: 6,
        totalProcessingCost: 570, // 95 * 6
      },
      processingRate: 6,
      totalProcessingCost: 570,
      totalBatchCost: 3769.6,
      output: [{ description: 'Cotton Combed Royal Blue', qty: '', unitCost: 0 }],
    };

    // While combing is in process: Dyed fabric is deducted (0 available). Combed fabric not added yet.
    const { rows: stocksDuringCombing } = computeStocks(
      purchaseBills,
      [],
      [],
      [],
      [],
      [],
      [completedDyeingBatch],
      [combingBatchInProcess],
    );
    expect(stocksDuringCombing.find((s) => s.description === 'Cotton Dyed Royal Blue').available).toBe(0);
    expect(stocksDuringCombing.find((s) => s.description === 'Cotton Combed Royal Blue')).toBeUndefined();

    // 5. Complete Combing Batch: Actual weight loss 3% measured.
    // Actual finished yield = 92.15 rolls.
    // Total Batch Cost = 3769.60
    // Final Combed Unit Cost = 3769.60 / 92.15 = ₹40.91 / roll
    const completedCombingBatch = {
      ...combingBatchInProcess,
      status: 'COMPLETED',
      completedAt: '2026-10-10T14:00:00Z',
      weightLossPct: 3,
      totalOutputQty: 92.15,
      output: [{ description: 'Cotton Combed Royal Blue', qty: 92.15, unitCost: 40.91 }],
    };

    const { rows: stocksAfterCombing } = computeStocks(
      purchaseBills,
      [],
      [],
      [],
      [],
      [],
      [completedDyeingBatch],
      [completedCombingBatch],
    );
    expect(stocksAfterCombing.find((s) => s.description === 'Cotton Dyed Royal Blue').available).toBe(0);
    const combedStock = stocksAfterCombing.find((s) => s.description === 'Cotton Combed Royal Blue');
    expect(combedStock.available).toBe(92.15);
    expect(combedStock.avgPurchaseRate).toBe(40.91);

    // 6. Sell 60 rolls of "Cotton Combed Royal Blue" at ₹75 on sales bill
    const salesInvoices = [
      {
        invoiceNo: 'SI-B1',
        customerName: 'Metro Textiles',
        invoiceDate: '2026-10-12',
        grandTotal: 4500,
        products: [{ description: 'Cotton Combed Royal Blue', qty: 60, rate: 75 }],
      },
    ];

    const { rows: stocksAfterSale } = computeStocks(
      purchaseBills,
      salesInvoices,
      [],
      [],
      [],
      [],
      [completedDyeingBatch],
      [completedCombingBatch],
    );
    const combedStockFinal = stocksAfterSale.find((s) => s.description === 'Cotton Combed Royal Blue');
    expect(combedStockFinal.available).toBe(32.15); // 92.15 - 60
    expect(combedStockFinal.sold).toBe(60);

    // Profit calculation
    const costLookup = buildAvgCostLookup(purchaseBills, [completedDyeingBatch], [completedCombingBatch]);
    expect(costLookup('Cotton Combed Royal Blue')).toBe(40.91);

    const revenueRows = computeRevenueRows(salesInvoices, costLookup);
    expect(revenueRows).toHaveLength(1);
    expect(revenueRows[0].revenue).toBe(4500); // 60 * 75
    expect(revenueRows[0].cost).toBe(2454.6); // 60 * 40.91
    expect(revenueRows[0].profit).toBe(2045.4); // 4500 - 2454.6
  });

  it('Workflow C (Direct Dyeing to Stock): Purchase -> Dyeing -> Stock -> Sales operates seamlessly', () => {
    // 1. Purchase undyed grey rolls
    const purchaseBills = [
      {
        invoiceNo: 'PB-C1',
        supplierName: 'Supreme Yarn Mills',
        invoiceDate: '2026-10-01',
        grandTotal: 3000,
        products: [{ description: 'Cotton Grey 60s', qty: 100, rate: 30 }],
      },
    ];

    // 2. Dyeing Batch (Direct to Stock, no combing required)
    // 100 rolls grey issued @ ₹30 = 3000
    // Dyeing charges ₹12 / unit = 1200
    // Weight loss 4% -> 96 rolls finished
    // Total cost = 4200. Finished unit cost = 4200 / 96 = ₹43.75
    const dyeingBatch = {
      batchId: 'B-301',
      batchDate: '2026-10-04',
      status: 'COMPLETED',
      completedAt: '2026-10-07T12:00:00Z',
      processorName: 'Murugan Dyeing Works',
      input: {
        description: 'Cotton Grey 60s',
        qty: 100,
        avgGreyRate: 30,
        totalGreyCost: 3000,
        dyeingRate: 12,
        totalDyeingCost: 1200,
      },
      dyeingRate: 12,
      totalBatchCost: 4200,
      weightLossPct: 4,
      totalOutputQty: 96,
      output: [{ description: 'Cotton Dyed Emerald Green', qty: 96, unitCost: 43.75 }],
    };

    // No combing batches for this workflow!
    const combingBatches = [];

    const { rows: stocks } = computeStocks(
      purchaseBills,
      [],
      [],
      [],
      [],
      [],
      [dyeingBatch],
      combingBatches,
    );

    // Grey fabric is fully consumed (0 available)
    expect(stocks.find((s) => s.description === 'Cotton Grey 60s').available).toBe(0);

    // Dyed fabric enters stock directly!
    const dyedStock = stocks.find((s) => s.description === 'Cotton Dyed Emerald Green');
    expect(dyedStock.available).toBe(96);
    expect(dyedStock.avgPurchaseRate).toBe(43.75);

    // 3. Sell 70 rolls directly from stock on Sales Invoice
    const salesInvoices = [
      {
        invoiceNo: 'SI-C1',
        customerName: 'Anand Fabrics',
        invoiceDate: '2026-10-09',
        grandTotal: 4900,
        products: [{ description: 'Cotton Dyed Emerald Green', qty: 70, rate: 70 }],
      },
    ];

    const { rows: stocksAfterSale } = computeStocks(
      purchaseBills,
      salesInvoices,
      [],
      [],
      [],
      [],
      [dyeingBatch],
      combingBatches,
    );
    const dyedStockAfterSale = stocksAfterSale.find((s) => s.description === 'Cotton Dyed Emerald Green');
    expect(dyedStockAfterSale.available).toBe(26); // 96 - 70 = 26
    expect(dyedStockAfterSale.sold).toBe(70);

    // Profit calculation: 70 sold @ 70 = 4900. Cost = 70 * 43.75 = 3062.50. Profit = 1837.50
    const costLookup = buildAvgCostLookup(purchaseBills, [dyeingBatch], combingBatches);
    expect(costLookup('Cotton Dyed Emerald Green')).toBe(43.75);

    const revenueRows = computeRevenueRows(salesInvoices, costLookup);
    expect(revenueRows[0].revenue).toBe(4900);
    expect(revenueRows[0].cost).toBe(3062.5);
    expect(revenueRows[0].profit).toBe(1837.5);
  });

  it('All 3 workflows coexist in the same application without cross-contamination or double counting', () => {
    // Combine all 3 workflows in a single state:
    // Workflow A product: Readymade Printed Rayon (Purchase -> Stock -> Sales)
    // Workflow B product: Cotton Grey 40s -> Cotton Dyed Royal Blue -> Cotton Combed Royal Blue (Purchase -> Dyeing -> Combing -> Stock -> Sales)
    // Workflow C product: Cotton Grey 60s -> Cotton Dyed Emerald Green (Purchase -> Dyeing -> Stock -> Sales)
    const allPurchaseBills = [
      // Workflow A
      {
        invoiceNo: 'PB-A',
        supplierName: 'Direct Fabric Mills',
        invoiceDate: '2026-10-01',
        grandTotal: 5000,
        products: [{ description: 'Readymade Printed Rayon', qty: 100, rate: 50 }],
      },
      // Workflow B
      {
        invoiceNo: 'PB-B',
        supplierName: 'Sri Balaji Grey Mills',
        invoiceDate: '2026-10-01',
        grandTotal: 2200,
        products: [{ description: 'Cotton Raw Grey 40s', qty: 100, rate: 22 }],
      },
      // Workflow C
      {
        invoiceNo: 'PB-C',
        supplierName: 'Supreme Yarn Mills',
        invoiceDate: '2026-10-01',
        grandTotal: 3000,
        products: [{ description: 'Cotton Grey 60s', qty: 100, rate: 30 }],
      },
    ];

    const allDyeingBatches = [
      // Workflow B dyeing
      {
        batchId: 'B-B',
        batchDate: '2026-10-02',
        status: 'COMPLETED',
        completedAt: '2026-10-04T10:00:00Z',
        processorName: 'Murugan Dyeing Works',
        input: { description: 'Cotton Raw Grey 40s', qty: 100, avgGreyRate: 22, totalGreyCost: 2200, dyeingRate: 10 },
        dyeingRate: 10,
        totalBatchCost: 3200,
        weightLossPct: 5,
        totalOutputQty: 95,
        output: [{ description: 'Cotton Dyed Royal Blue', qty: 95, unitCost: 33.68 }],
      },
      // Workflow C dyeing
      {
        batchId: 'B-C',
        batchDate: '2026-10-03',
        status: 'COMPLETED',
        completedAt: '2026-10-05T10:00:00Z',
        processorName: 'Murugan Dyeing Works',
        input: { description: 'Cotton Grey 60s', qty: 100, avgGreyRate: 30, totalGreyCost: 3000, dyeingRate: 12 },
        dyeingRate: 12,
        totalBatchCost: 4200,
        weightLossPct: 4,
        totalOutputQty: 96,
        output: [{ description: 'Cotton Dyed Emerald Green', qty: 96, unitCost: 43.75 }],
      },
    ];

    const allCombingBatches = [
      // Only Workflow B creates a combing batch! Workflow C bypasses combing.
      {
        batchId: 'CB-B',
        batchDate: '2026-10-06',
        status: 'COMPLETED',
        completedAt: '2026-10-08T10:00:00Z',
        processorName: 'Sri Lakshmi Combing Mills',
        input: { description: 'Cotton Dyed Royal Blue', qty: 95, avgRate: 33.68, totalCost: 3199.6, processingRate: 6 },
        processingRate: 6,
        totalProcessingCost: 570,
        totalBatchCost: 3769.6,
        weightLossPct: 3,
        totalOutputQty: 92.15,
        output: [{ description: 'Cotton Combed Royal Blue', qty: 92.15, unitCost: 40.91 }],
      },
    ];

    const allSalesInvoices = [
      // Sell Workflow A item
      {
        invoiceNo: 'SI-1',
        customerName: 'Cust A',
        invoiceDate: '2026-10-10',
        grandTotal: 3200,
        products: [{ description: 'Readymade Printed Rayon', qty: 40, rate: 80 }],
      },
      // Sell Workflow B item
      {
        invoiceNo: 'SI-2',
        customerName: 'Cust B',
        invoiceDate: '2026-10-11',
        grandTotal: 4500,
        products: [{ description: 'Cotton Combed Royal Blue', qty: 60, rate: 75 }],
      },
      // Sell Workflow C item
      {
        invoiceNo: 'SI-3',
        customerName: 'Cust C',
        invoiceDate: '2026-10-12',
        grandTotal: 4900,
        products: [{ description: 'Cotton Dyed Emerald Green', qty: 70, rate: 70 }],
      },
    ];

    // 1. Check all stocks simultaneously
    const { rows: stockRows } = computeStocks(
      allPurchaseBills,
      allSalesInvoices,
      [],
      [],
      [],
      [],
      allDyeingBatches,
      allCombingBatches,
    );

    const stockMap = new Map(stockRows.map((r) => [r.description, r]));

    // Check Workflow A:
    expect(stockMap.get('Readymade Printed Rayon').available).toBe(60);

    // Check Workflow B:
    expect(stockMap.get('Cotton Raw Grey 40s').available).toBe(0); // consumed by dyeing
    expect(stockMap.get('Cotton Dyed Royal Blue').available).toBe(0); // consumed by combing
    expect(stockMap.get('Cotton Combed Royal Blue').available).toBe(32.15); // 92.15 - 60

    // Check Workflow C:
    expect(stockMap.get('Cotton Grey 60s').available).toBe(0); // consumed by dyeing
    expect(stockMap.get('Cotton Dyed Emerald Green').available).toBe(26); // 96 - 70

    // 2. Check cost lookup across all 3
    const costLookup = buildAvgCostLookup(allPurchaseBills, allDyeingBatches, allCombingBatches);
    expect(costLookup('Readymade Printed Rayon')).toBe(50);
    expect(costLookup('Cotton Combed Royal Blue')).toBe(40.91);
    expect(costLookup('Cotton Dyed Emerald Green')).toBe(43.75);

    // 3. Check revenue rows across all 3
    const revenueRows = computeRevenueRows(allSalesInvoices, costLookup);
    expect(revenueRows).toHaveLength(3);

    // Bill 1 (Workflow A): 3200 - 2000 = 1200
    expect(revenueRows.find((r) => r.name === 'Cust A').profit).toBe(1200);

    // Bill 2 (Workflow B): 4500 - 2454.6 = 2045.4
    expect(revenueRows.find((r) => r.name === 'Cust B').profit).toBe(2045.4);

    // Bill 3 (Workflow C): 4900 - 3062.5 = 1837.5
    expect(revenueRows.find((r) => r.name === 'Cust C').profit).toBe(1837.5);
  });
});
