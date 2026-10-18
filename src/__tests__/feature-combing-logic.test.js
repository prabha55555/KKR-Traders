import {
  calcCombingBatchPaymentStats,
  calcCombingBatchTotals,
  calcProcessorBalanceSummary,
  computeInputFabricRate,
  emptyCombingBatch,
  emptyProcessor,
  filterCombingBatches,
  filterProcessors,
  findProcessorByQuery,
  suggestNextCombingBatchId,
  validateCombingBatch,
  validateProcessor,
  COMBING_STATUS,
} from '@/features/combing/combingLogic';
import { computeStocks } from '@/features/overview/stocks/stocksLogic';
import { buildAvgCostLookup, computeRevenueRows } from '@/features/overview/revenue/revenueLogic';

describe('Combing & Processing Logic (Workflow: Dyeing -> Combing & Processing -> Stock)', () => {
  it('creates an empty combing batch with default structure', () => {
    const batch = emptyCombingBatch('2026-10-14');
    expect(batch.batchDate).toBe('2026-10-14');
    expect(batch.status).toBe(COMBING_STATUS.IN_PROCESS);
    expect(batch.input.unit).toBe('Rolls');
    expect(batch.input.processingRate).toBe('');
    expect(batch.input.weightLossPct).toBe('');
    expect(batch.output.length).toBe(1);
    expect(batch.output[0].unit).toBe('Rolls');
  });

  it('accurately computes weighted average cost of input dyed fabric from completed dyeing batches', () => {
    const dyeingBatches = [
      {
        batchId: 'B-001',
        status: 'COMPLETED',
        completedAt: '2026-10-01',
        processorName: 'Murugan Dyeing',
        output: [{ description: 'Cotton Dyed Navy Blue', qty: 50, unitCost: 40 }],
      },
      {
        batchId: 'B-002',
        status: 'COMPLETED',
        completedAt: '2026-10-05',
        processorName: 'Sri Balaji Dyeing',
        output: [{ description: 'Cotton Dyed Navy Blue', qty: 50, unitCost: 50 }],
      },
    ];

    const result = computeInputFabricRate('Cotton Dyed Navy Blue', dyeingBatches, []);
    // 50 @ 40 (= 2000) + 50 @ 50 (= 2500) = 100 units, total = 4500 => avg rate = 45
    expect(result.totalQty).toBe(100);
    expect(result.totalCost).toBe(4500);
    expect(result.avgRate).toBe(45);
    expect(result.sourcesCount).toBe(2);
    expect(result.history).toHaveLength(2);
  });

  it('calculates combing batch totals, processing charges, and true cost adjustment for weight loss', () => {
    // Example:
    // Input dyed fabric: 100 rolls @ ₹45 = ₹4,500
    // Combing rate: ₹10 / roll = 100 * 10 = ₹1,000
    // Total batch cost = 4500 + 1000 = ₹5,500
    // Weight loss recorded at completion: 4% -> loss = 4 rolls, finished yield = 96 rolls
    // True unit cost = 5500 / 96 = ₹57.29 / roll
    const form = {
      input: {
        description: 'Cotton Dyed Navy Blue',
        qty: '100',
        avgRate: '45',
        processingRate: '10',
        weightLossPct: '4',
      },
      output: [
        { description: 'Cotton Combed Navy Blue', qty: '96' },
      ],
    };

    const totals = calcCombingBatchTotals(form);
    expect(totals.inputQty).toBe(100);
    expect(totals.fabricRate).toBe(45);
    expect(totals.totalFabricCost).toBe(4500);
    expect(totals.processingRate).toBe(10);
    expect(totals.totalProcessingCost).toBe(1000);
    expect(totals.totalBatchCost).toBe(5500);
    expect(totals.costPerUnitBeforeLoss).toBe(55); // 45 + 10
    expect(totals.weightLossQty).toBe(4);
    expect(totals.expectedOutputQty).toBe(96);
    expect(totals.adjustedUnitCost).toBe(57.29); // 5500 / 96 rounded to 2 decimals
    expect(totals.totalOutputQty).toBe(96);
    expect(totals.avgFinishedUnitCost).toBe(57.29);
  });

  it('validates combing batch form correctly', () => {
    // Missing batch ID
    expect(validateCombingBatch({ batchId: '', batchDate: '2026-10-14' })).toEqual({
      title: 'Missing Information',
      message: 'Please enter a Batch Number.',
    });

    // Missing processor
    expect(
      validateCombingBatch({
        batchId: 'CB-001',
        batchDate: '2026-10-14',
        processorName: '',
      }),
    ).toEqual({
      title: 'Missing Information',
      message: 'Please enter the Combing / Processing Mill Name.',
    });

    // Missing input description
    expect(
      validateCombingBatch({
        batchId: 'CB-001',
        batchDate: '2026-10-14',
        processorName: 'Star Combing',
        input: { description: '', qty: '50' },
      }),
    ).toEqual({
      title: 'Missing Input Material',
      message: 'Please select the dyed fabric to process.',
    });

    // Invalid quantity
    expect(
      validateCombingBatch({
        batchId: 'CB-001',
        batchDate: '2026-10-14',
        processorName: 'Star Combing',
        input: { description: 'Cotton Dyed Navy Blue', qty: '0' },
      }),
    ).toEqual({
      title: 'Invalid Quantity',
      message: 'Please enter a valid fabric quantity greater than 0.',
    });

    // Completed batch without output goods
    expect(
      validateCombingBatch({
        batchId: 'CB-001',
        batchDate: '2026-10-14',
        processorName: 'Star Combing',
        status: COMBING_STATUS.COMPLETED,
        input: { description: 'Cotton Dyed Navy Blue', qty: '50' },
        output: [],
      }),
    ).toEqual({
      title: 'Missing Finished Goods',
      message:
        'To mark the batch as Completed, please specify at least one finished combed product with quantity.',
    });
  });

  it('filters combing batches by search query and status', () => {
    const batches = [
      {
        batchId: 'CB-001',
        status: COMBING_STATUS.IN_PROCESS,
        processorName: 'Super Combing Mills',
        input: { description: 'Cotton Dyed Red' },
        output: [{ description: 'Cotton Combed Red' }],
      },
      {
        batchId: 'CB-002',
        status: COMBING_STATUS.COMPLETED,
        processorName: 'Sri Lakshmi Processing',
        input: { description: 'Cotton Dyed Blue' },
        output: [{ description: 'Cotton Combed Blue' }],
      },
    ];

    expect(filterCombingBatches(batches, 'Lakshmi', 'ALL')).toHaveLength(1);
    expect(filterCombingBatches(batches, 'Red', 'ALL')).toHaveLength(1);
    expect(filterCombingBatches(batches, '', COMBING_STATUS.IN_PROCESS)).toHaveLength(1);
    expect(filterCombingBatches(batches, '', COMBING_STATUS.COMPLETED)).toHaveLength(1);
  });

  it('suggests the next sequential batch ID', () => {
    expect(suggestNextCombingBatchId([])).toBe('CB-001');
    expect(suggestNextCombingBatchId([{ batchId: 'CB-001' }, { batchId: 'CB-004' }])).toBe('CB-005');
  });

  it('validates and filters processor directory records', () => {
    const valid = {
      processorName: 'Lakshmi Combing',
      ownerName: 'Narayanan',
      phone: '9876543210',
      address: 'Coimbatore',
    };
    expect(validateProcessor(valid)).toBeNull();

    expect(validateProcessor({ processorName: '', ownerName: 'A', phone: '9876543210' })).toEqual({
      title: 'Missing Information',
      message: 'Please enter the Mill / Processing Unit Name.',
    });

    expect(validateProcessor({ processorName: 'Mill', ownerName: '', phone: '9876543210' })).toEqual({
      title: 'Missing Information',
      message: 'Please enter the Owner / Contact Person Name.',
    });

    expect(validateProcessor({ processorName: 'Mill', ownerName: 'A', phone: '123' })).toEqual({
      title: 'Invalid Phone Number',
      message: 'Please enter a valid 10-digit mobile number.',
    });

    const list = [valid, { processorName: 'Kaveri Mills', ownerName: 'Ramu', phone: '9123456789' }];
    expect(filterProcessors(list, 'Lakshmi')).toHaveLength(1);
    expect(findProcessorByQuery(list, '9876543210')).toEqual(valid);
  });

  describe('End-to-End Business Scenarios (Stocks & Costing Integration)', () => {
    it('Scenario 1: Dyeing -> Combing & Processing -> Stock', () => {
      // 1. Purchase raw grey: 100 rolls of "Cotton Raw Grey" @ ₹20
      const purchaseBills = [
        {
          invoiceNo: 'PB-1',
          supplierName: 'Cotton Spun Mills',
          invoiceDate: '2026-10-01',
          grandTotal: 2000,
          products: [{ description: 'Cotton Raw Grey', qty: 100, rate: 20 }],
        },
      ];

      // 2. Dyeing batch: 100 rolls grey -> Dyeing charges ₹10/roll -> 5% loss -> 95 rolls "Cotton Dyed Blue" @ ₹31.58
      const dyeingBatches = [
        {
          batchId: 'B-001',
          batchDate: '2026-10-03',
          status: 'COMPLETED',
          processorName: 'Murugan Dyeing',
          input: {
            description: 'Cotton Raw Grey',
            qty: 100,
            avgGreyRate: 20,
            totalGreyCost: 2000,
            dyeingRate: 10,
          },
          dyeingRate: 10,
          totalBatchCost: 3000,
          weightLossPct: 5,
          totalOutputQty: 95,
          output: [{ description: 'Cotton Dyed Blue', qty: 95, unitCost: 31.58 }],
        },
      ];

      // 3. Combing batch: 95 rolls "Cotton Dyed Blue" sent for combing -> Combing charges ₹5/roll -> 2% loss -> 93.1 rolls "Cotton Combed Blue"
      // Total Fabric Value = 95 * 31.58 = 3000.10
      // Total Combing Cost = 95 * 5 = 475.00
      // Total Combing Batch Cost = 3475.10
      // Net Output = 93.1 rolls
      // Final Combed Unit Cost = 3475.10 / 93.1 = ₹37.33 / roll
      const combingBatches = [
        {
          batchId: 'CB-001',
          batchDate: '2026-10-07',
          status: 'COMPLETED',
          processorName: 'Lakshmi Combing',
          input: {
            description: 'Cotton Dyed Blue',
            qty: 95,
            avgRate: 31.58,
            totalCost: 3000.1,
            processingRate: 5,
            totalProcessingCost: 475,
          },
          processingRate: 5,
          totalProcessingCost: 475,
          totalBatchCost: 3475.1,
          weightLossPct: 2,
          totalOutputQty: 93.1,
          output: [{ description: 'Cotton Combed Blue', qty: 93.1, unitCost: 37.33 }],
        },
      ];

      // Check stock computation
      const { rows: stockRows } = computeStocks(
        purchaseBills,
        [], // no sales yet
        [], // opening stocks
        [], // metadata
        [], // sales returns
        [], // purchase returns
        dyeingBatches,
        combingBatches,
      );

      const greyStock = stockRows.find((s) => s.description === 'Cotton Raw Grey');
      const dyedStock = stockRows.find((s) => s.description === 'Cotton Dyed Blue');
      const combedStock = stockRows.find((s) => s.description === 'Cotton Combed Blue');

      // Cotton Raw Grey: purchased 100, issued to dyeing 100 => 0 available
      expect(greyStock.available).toBe(0);

      // Cotton Dyed Blue: produced 95 from dyeing, issued 95 to combing => 0 available
      expect(dyedStock.available).toBe(0);

      // Cotton Combed Blue: received 93.1 rolls in stock
      expect(combedStock.available).toBe(93.1);

      // Revenue cost lookup should have Cotton Combed Blue @ 37.33
      const costLookup = buildAvgCostLookup(purchaseBills, dyeingBatches, combingBatches);
      expect(costLookup('Cotton Combed Blue')).toBe(37.33);

      // 4. Now sell 50 rolls of "Cotton Combed Blue" at ₹60 on sales invoice
      const salesInvoices = [
        {
          invoiceNo: 'SI-101',
          customerName: 'Prabha Textiles',
          invoiceDate: '2026-10-10',
          grandTotal: 3000,
          products: [{ description: 'Cotton Combed Blue', qty: 50, rate: 60 }],
        },
      ];

      const revenueRows = computeRevenueRows(salesInvoices, costLookup);
      expect(revenueRows).toHaveLength(1);
      const row = revenueRows[0];
      expect(row.name).toBe('Prabha Textiles');
      expect(row.cost).toBe(1866.5); // 50 * 37.33
      expect(row.revenue).toBe(3000); // 50 * 60
      expect(row.profit).toBe(1133.5); // 3000 - 1866.5
      expect(row.lines[0].description).toBe('Cotton Combed Blue');
      expect(row.lines[0].costRate).toBe(37.33);
    });

    it('Scenario 2: Dyeing -> Directly to Stock (Without Combing)', () => {
      // User does NOT send to combing; dyed fabric directly enters stock for trading
      const purchaseBills = [
        {
          invoiceNo: 'PB-1',
          supplierName: 'Supplier A',
          invoiceDate: '2026-10-01',
          grandTotal: 1000,
          products: [{ description: 'Cotton Raw Grey', qty: 50, rate: 20 }],
        },
      ];

      const dyeingBatches = [
        {
          batchId: 'B-001',
          batchDate: '2026-10-03',
          status: 'COMPLETED',
          processorName: 'Murugan Dyeing',
          input: {
            description: 'Cotton Raw Grey',
            qty: 50,
            avgGreyRate: 20,
            totalGreyCost: 1000,
            dyeingRate: 10,
          },
          dyeingRate: 10,
          totalBatchCost: 1500,
          weightLossPct: 0,
          totalOutputQty: 50,
          output: [{ description: 'Cotton Dyed Yellow', qty: 50, unitCost: 30 }],
        },
      ];

      // No combing batches
      const combingBatches = [];

      const { rows: stockRows } = computeStocks(
        purchaseBills,
        [],
        [],
        [],
        [],
        [],
        dyeingBatches,
        combingBatches,
      );

      const greyStock = stockRows.find((s) => s.description === 'Cotton Raw Grey');
      const dyedStock = stockRows.find((s) => s.description === 'Cotton Dyed Yellow');

      expect(greyStock.available).toBe(0);
      expect(dyedStock.available).toBe(50); // Direct in stock ready for sale!

      const costLookup = buildAvgCostLookup(purchaseBills, dyeingBatches, combingBatches);
      expect(costLookup('Cotton Dyed Yellow')).toBe(30);

      // Sell directly
      const salesInvoices = [
        {
          invoiceNo: 'SI-201',
          customerName: 'Customer X',
          invoiceDate: '2026-10-08',
          grandTotal: 2500,
          products: [{ description: 'Cotton Dyed Yellow', qty: 50, rate: 50 }],
        },
      ];

      const revenueRows = computeRevenueRows(salesInvoices, costLookup);
      expect(revenueRows[0].profit).toBe(1000); // 2500 - (50 * 30) = 1000 profit
    });

    it('accurately calculates combing batch payment stats and balances', () => {
      // 1. Unpaid batch
      const unpaidBatch = {
        batchId: 'CB-001',
        processorName: 'Lakshmi Combing Mills',
        totalProcessingCost: 800,
        payments: [],
      };
      const stats1 = calcCombingBatchPaymentStats(unpaidBatch);
      expect(stats1.totalCharges).toBe(800);
      expect(stats1.totalPaid).toBe(0);
      expect(stats1.balanceDue).toBe(800);
      expect(stats1.isUnpaid).toBe(true);
      expect(stats1.status).toBe('UNPAID');

      // 2. Partial payment
      const partialBatch = {
        batchId: 'CB-002',
        processorName: 'Lakshmi Combing Mills',
        totalProcessingCost: 800,
        payments: [{ id: 'p1', date: '2026-10-14', amount: 300, mode: 'Cash' }],
      };
      const stats2 = calcCombingBatchPaymentStats(partialBatch);
      expect(stats2.totalCharges).toBe(800);
      expect(stats2.totalPaid).toBe(300);
      expect(stats2.balanceDue).toBe(500);
      expect(stats2.isPartial).toBe(true);
      expect(stats2.status).toBe('PARTIAL');

      // 3. Fully paid
      const paidBatch = {
        batchId: 'CB-003',
        processorName: 'Lakshmi Combing Mills',
        totalProcessingCost: 800,
        payments: [
          { id: 'p1', date: '2026-10-14', amount: 300, mode: 'Cash' },
          { id: 'p2', date: '2026-10-15', amount: 500, mode: 'UPI' },
        ],
      };
      const stats3 = calcCombingBatchPaymentStats(paidBatch);
      expect(stats3.totalCharges).toBe(800);
      expect(stats3.totalPaid).toBe(800);
      expect(stats3.balanceDue).toBe(0);
      expect(stats3.isPaid).toBe(true);
      expect(stats3.status).toBe('PAID');
    });

    it('aggregates processor balance summary across combing batches', () => {
      const batches = [
        {
          batchId: 'CB-001',
          processorName: 'Lakshmi Mills',
          totalProcessingCost: 500,
          payments: [{ amount: 500 }],
        },
        {
          batchId: 'CB-002',
          processorName: 'Lakshmi Mills',
          totalProcessingCost: 1000,
          payments: [{ amount: 200 }],
        },
        {
          batchId: 'CB-003',
          processorName: 'Other Mill',
          totalProcessingCost: 700,
          payments: [],
        },
      ];

      const lakshmiSummary = calcProcessorBalanceSummary(batches, 'Lakshmi Mills');
      expect(lakshmiSummary.batchCount).toBe(2);
      expect(lakshmiSummary.totalCharges).toBe(1500);
      expect(lakshmiSummary.totalPaid).toBe(700);
      expect(lakshmiSummary.balanceDue).toBe(800);
      expect(lakshmiSummary.unpaidCount).toBe(1);

      const allSummary = calcProcessorBalanceSummary(batches);
      expect(allSummary.batchCount).toBe(3);
      expect(allSummary.totalCharges).toBe(2200);
      expect(allSummary.totalPaid).toBe(700);
      expect(allSummary.balanceDue).toBe(1500);
      expect(allSummary.unpaidCount).toBe(2);
    });
  });
});
