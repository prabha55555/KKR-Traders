import {
  calcBatchPaymentStats,
  calcBatchTotals,
  calcDyerBalanceSummary,
  computeGreyPurchaseRate,
  emptyDyeingBatch,
  emptyDyer,
  filterBatches,
  filterDyers,
  findDyerByQuery,
  suggestNextBatchId,
  validateDyeingBatch,
  validateDyer,
  DYEING_STATUS,
} from '@/features/dyeing/dyeingLogic';

describe('Dyeing & Processing Batch Logic (Workflow 2: Manufacturing)', () => {
  it('creates an empty dyeing batch with default structure', () => {
    const batch = emptyDyeingBatch('2026-10-14');
    expect(batch.batchDate).toBe('2026-10-14');
    expect(batch.status).toBe(DYEING_STATUS.IN_PROCESS);
    expect(batch.input.unit).toBe('Rolls');
    expect(batch.input.dyeingRate).toBe('');
    expect(batch.input.weightLossPct).toBe('');
    expect(batch.expenses).toEqual([]);
    expect(batch.output.length).toBe(1);
  });

  it('accurately computes weighted average grey purchase rate across multiple suppliers', () => {
    // User's exact example:
    // Supplier 1: 10 units @ ₹15 = ₹150
    // Supplier 2: 20 units @ ₹10 = ₹200
    // Supplier 3: 25 units @ ₹20 = ₹500
    // Total: 55 units, Total Cost = ₹850
    // Average Grey Purchase Rate = 850 / 55 = ₹15.45 per unit
    const purchaseBills = [
      {
        supplierName: 'Supplier 1',
        invoiceNo: 'INV-101',
        invoiceDate: '2026-10-01',
        products: [
          { description: 'Cotton Grey 40s', qty: 10, rate: 15 },
          { description: 'Other Product', qty: 5, rate: 50 },
        ],
      },
      {
        supplierName: 'Supplier 2',
        invoiceNo: 'INV-102',
        invoiceDate: '2026-10-05',
        products: [
          { description: 'Cotton Grey 40s', qty: 20, rate: 10 },
        ],
      },
      {
        supplierName: 'Supplier 3',
        invoiceNo: 'INV-103',
        invoiceDate: '2026-10-10',
        products: [
          { description: 'Cotton Grey 40s', qty: 25, rate: 20 },
        ],
      },
    ];

    const result = computeGreyPurchaseRate('Cotton Grey 40s', purchaseBills);
    expect(result.totalQty).toBe(55);
    expect(result.totalCost).toBe(850);
    expect(result.avgRate).toBe(15.45);
    expect(result.suppliersCount).toBe(3);
    expect(result.suppliers).toContain('Supplier 1');
    expect(result.suppliers).toContain('Supplier 2');
    expect(result.suppliers).toContain('Supplier 3');
    expect(result.history).toHaveLength(3);
  });

  it('calculates finished fabric cost considering dyeing charges and weight loss accurately', () => {
    // User's exact example:
    // - Average grey purchase rate: ₹15.45 / unit
    // - Issued quantity: 55 units -> Total grey cost = ₹849.75 (or ₹850)
    // - Dyeing cost: ₹20 / unit -> Total dyeing cost = 55 * 20 = ₹1,100
    // - Total cost before loss = 849.75 + 1100 = 1949.75 (~₹1,950)
    // - Cost per unit before loss = 15.45 + 20 = ₹35.45
    // - Weight loss: 5% -> Loss qty = 55 * 0.05 = 2.75 units
    // - Expected finished qty = 55 - 2.75 = 52.25 units
    // - Adjusted finished fabric cost = 1949.75 / 52.25 = ₹37.32 per finished unit
    const form = {
      input: {
        description: 'Cotton Grey 40s',
        qty: '55',
        avgGreyRate: '15.45',
        dyeingRate: '20',
        weightLossPct: '5',
      },
      output: [
        { description: 'Cotton Dyed Navy Blue', qty: '52.25' },
      ],
    };

    const totals = calcBatchTotals(form);
    expect(totals.inputQty).toBe(55);
    expect(totals.greyRate).toBe(15.45);
    expect(totals.totalGreyCost).toBe(849.75);
    expect(totals.dyeingRate).toBe(20);
    expect(totals.totalDyeingCost).toBe(1100);
    expect(totals.totalBatchCost).toBe(1949.75);
    expect(totals.costPerUnitBeforeLoss).toBe(35.45);
    expect(totals.weightLossPct).toBe(5);
    expect(totals.weightLossQty).toBe(2.75);
    expect(totals.expectedOutputQty).toBe(52.25);
    expect(totals.adjustedUnitCost).toBe(37.32);
    expect(totals.totalOutputQty).toBe(52.25);
    expect(totals.avgFinishedUnitCost).toBe(37.32);
    expect(totals.enrichedOutput[0].unitCost).toBe(37.32);
  });

  it('allocates adjusted unit cost when multiple colored rolls are produced from 1 batch', () => {
    const form = {
      input: {
        description: 'Cotton Grey 40s',
        qty: '55',
        avgGreyRate: '15.45',
        dyeingRate: '20',
        weightLossPct: '5',
      },
      output: [
        { description: 'Cotton Dyed Navy Blue', qty: '30' },
        { description: 'Cotton Dyed Jet Black', qty: '22.25' },
      ],
    };

    const totals = calcBatchTotals(form);
    expect(totals.totalOutputQty).toBe(52.25);
    expect(totals.avgFinishedUnitCost).toBe(37.32);
    expect(totals.enrichedOutput[0].unitCost).toBe(37.32);
    expect(totals.enrichedOutput[1].unitCost).toBe(37.32);
    expect(totals.enrichedOutput[0].allocatedCost).toBe(1119.47);
    expect(totals.enrichedOutput[1].allocatedCost).toBe(830.28);
  });

  it('calculates pre-dyeing batch cost during approval when weight loss is not yet entered, and updates when completed', () => {
    // 1. Initial Approval: 55 units grey fabric @ ₹15.45, dyeing rate ₹20, NO weight loss yet
    const approvalBatch = {
      status: DYEING_STATUS.IN_PROCESS,
      input: {
        description: 'Cotton Grey 40s',
        qty: '55',
        avgGreyRate: '15.45',
        dyeingRate: '20',
      },
      output: [{ description: 'Cotton Dyed Navy Blue', qty: '' }],
    };

    const approvalTotals = calcBatchTotals(approvalBatch);
    expect(approvalTotals.inputQty).toBe(55);
    expect(approvalTotals.totalGreyCost).toBe(849.75);
    expect(approvalTotals.totalDyeingCost).toBe(1100);
    expect(approvalTotals.totalBatchCost).toBe(1949.75);
    expect(approvalTotals.costPerUnitBeforeLoss).toBe(35.45);
    expect(approvalTotals.weightLossPct).toBe(0);
    expect(approvalTotals.weightLossQty).toBe(0);
    expect(approvalTotals.expectedOutputQty).toBe(55);
    expect(approvalTotals.avgFinishedUnitCost).toBe(35.45);

    // 2. Completion on Return: actual finished fabric weighed = 52.25 units (5% actual loss)
    const completedBatch = {
      ...approvalBatch,
      status: DYEING_STATUS.COMPLETED,
      weightLossPct: '5',
      output: [{ description: 'Cotton Dyed Navy Blue', qty: '52.25' }],
    };

    const completedTotals = calcBatchTotals(completedBatch);
    expect(completedTotals.totalOutputQty).toBe(52.25);
    expect(completedTotals.shrinkageQty).toBe(2.75);
    expect(completedTotals.shrinkagePct).toBe(5);
    expect(completedTotals.avgFinishedUnitCost).toBe(37.32);
    expect(completedTotals.enrichedOutput[0].unitCost).toBe(37.32);
  });

  it('supports legacy batches with itemized expenses gracefully', () => {
    const form = {
      input: { qty: '10', avgGreyRate: '100' },
      expenses: [
        { category: 'Dyeing Charges', amount: '200' },
        { category: 'Coloring Materials & Chemicals', amount: '50' },
        { category: 'Labor & Handling', amount: '30' },
        { category: 'Transport & Freight', amount: '20' },
      ],
      output: [
        { description: 'Cotton 30s Navy Blue', qty: '6' },
        { description: 'Cotton 30s Maroon', qty: '4' },
      ],
    };

    const totals = calcBatchTotals(form);
    expect(totals.inputQty).toBe(10);
    expect(totals.greyRate).toBe(100);
    expect(totals.totalGreyCost).toBe(1000);
    expect(totals.totalExpenses).toBe(300);
    expect(totals.totalBatchCost).toBe(1300);
    expect(totals.totalOutputQty).toBe(10);
    expect(totals.avgFinishedUnitCost).toBe(130);
  });

  it('validates required fields for draft and completed batches', () => {
    // Missing batchId
    expect(validateDyeingBatch({ batchId: '', batchDate: '2026-10-14' })).toEqual({
      title: 'Missing Information',
      message: 'Please enter a Batch Number.',
    });

    // Missing processor
    expect(validateDyeingBatch({ batchId: 'B-001', batchDate: '2026-10-14', processorName: '' })).toEqual({
      title: 'Missing Information',
      message: 'Please enter the Processor / Dye House Name.',
    });

    // Missing input raw material
    expect(
      validateDyeingBatch({
        batchId: 'B-001',
        batchDate: '2026-10-14',
        processorName: 'Murugan Mills',
        input: { description: '', qty: '10' },
      }),
    ).toEqual({
      title: 'Missing Input Material',
      message: 'Please select the raw grey fabric to process.',
    });

    // Completed batch requires finished output
    expect(
      validateDyeingBatch({
        batchId: 'B-001',
        batchDate: '2026-10-14',
        processorName: 'Murugan Mills',
        status: DYEING_STATUS.COMPLETED,
        input: { description: 'Grey Cotton', qty: '10' },
        output: [],
      }),
    ).toEqual({
      title: 'Missing Finished Goods',
      message:
        'To mark the batch as Completed, please specify at least one finished colored fabric with quantity.',
    });

    // Valid completed batch
    expect(
      validateDyeingBatch({
        batchId: 'B-001',
        batchDate: '2026-10-14',
        processorName: 'Murugan Mills',
        status: DYEING_STATUS.COMPLETED,
        input: { description: 'Grey Cotton', qty: '10' },
        output: [{ description: 'Red Cotton', qty: '10' }],
      }),
    ).toBeNull();
  });

  it('filters batches by text and status', () => {
    const sample = [
      {
        batchId: 'B-001',
        processorName: 'Murugan Mills',
        status: DYEING_STATUS.IN_PROCESS,
        input: { description: 'Cotton 30s Grey' },
        output: [{ description: 'Navy Blue' }],
      },
      {
        batchId: 'B-002',
        processorName: 'Royal Dyers',
        status: DYEING_STATUS.COMPLETED,
        input: { description: 'Lycra Grey 20s' },
        output: [{ description: 'Maroon' }],
      },
    ];

    expect(filterBatches(sample, 'murugan', 'ALL')).toHaveLength(1);
    expect(filterBatches(sample, '', DYEING_STATUS.COMPLETED)).toHaveLength(1);
    expect(filterBatches(sample, 'maroon', 'ALL')).toHaveLength(1);
    expect(filterBatches(sample, 'xyz', 'ALL')).toHaveLength(0);
  });

  it('suggests the next sequential batch ID', () => {
    expect(suggestNextBatchId([])).toBe('B-001');
    expect(suggestNextBatchId([{ batchId: 'B-001' }, { batchId: 'B-002' }])).toBe('B-003');
    expect(suggestNextBatchId([{ batchId: 'BATCH-009' }])).toBe('B-010');
  });

  describe('Dyers Directory & Autocomplete Logic', () => {
    it('creates an empty dyer record with required fields', () => {
      const dyer = emptyDyer();
      expect(dyer).toEqual({
        dyeingName: '',
        ownerName: '',
        phone: '',
        address: '',
      });
    });

    it('validates dyer inputs correctly', () => {
      expect(validateDyer({ dyeingName: '', ownerName: 'Murugan', phone: '9842100000' })).toEqual({
        title: 'Missing Information',
        message: 'Please enter the Dyeing / Factory Name.',
      });

      expect(validateDyer({ dyeingName: 'Murugan Dyeing', ownerName: '', phone: '9842100000' })).toEqual({
        title: 'Missing Information',
        message: 'Please enter the Dyeing Owner / Contact Person Name.',
      });

      expect(validateDyer({ dyeingName: 'Murugan Dyeing', ownerName: 'Murugan', phone: '123' })).toEqual({
        title: 'Invalid Phone Number',
        message: 'Please enter a valid 10-digit mobile number.',
      });

      expect(
        validateDyer({
          dyeingName: 'Sri Murugan Dyeing Works',
          ownerName: 'Murugan',
          phone: '9842100000',
          address: 'Tirupur',
        }),
      ).toBeNull();
    });

    it('filters and matches dyers by name, owner, phone or address', () => {
      const dyersList = [
        {
          dyeingName: 'Sri Murugan Dyeing Works',
          ownerName: 'Murugan',
          phone: '9842100001',
          address: 'Veerapandi, Tirupur',
        },
        {
          dyeingName: 'Royal Fabric Processors',
          ownerName: 'Rajesh',
          phone: '9842100002',
          address: 'Palladam Road',
        },
      ];

      expect(filterDyers(dyersList, 'murugan')).toHaveLength(1);
      expect(filterDyers(dyersList, 'royal')).toHaveLength(1);
      expect(filterDyers(dyersList, 'rajesh')).toHaveLength(1);
      expect(filterDyers(dyersList, '0001')).toHaveLength(1);
      expect(filterDyers(dyersList, 'palladam')).toHaveLength(1);

      const foundByPhone = findDyerByQuery(dyersList, '9842100001');
      expect(foundByPhone?.dyeingName).toBe('Sri Murugan Dyeing Works');

      const foundByName = findDyerByQuery(dyersList, 'Sri Murugan Dyeing Works');
      expect(foundByName?.ownerName).toBe('Murugan');
    });
  });

  describe('Dyeing Payment Tracking and Balance Statistics', () => {
    it('accurately calculates batch payment stats for unpaid, partial, and fully paid batches', () => {
      // 1. Unpaid batch
      const unpaidBatch = {
        batchId: 'B-001',
        processorName: 'Sri Murugan Dyeing',
        totalDyeingCost: 1100,
        payments: [],
      };
      const unpaidStats = calcBatchPaymentStats(unpaidBatch);
      expect(unpaidStats.totalCharges).toBe(1100);
      expect(unpaidStats.totalPaid).toBe(0);
      expect(unpaidStats.balanceDue).toBe(1100);
      expect(unpaidStats.isUnpaid).toBe(true);
      expect(unpaidStats.isPartial).toBe(false);
      expect(unpaidStats.isPaid).toBe(false);
      expect(unpaidStats.status).toBe('UNPAID');

      // 2. Partially paid batch
      const partialBatch = {
        batchId: 'B-002',
        processorName: 'Sri Murugan Dyeing',
        totalDyeingCost: 1100,
        payments: [
          { id: 'p1', date: '2026-10-14', amount: 500, mode: 'Cash' },
        ],
      };
      const partialStats = calcBatchPaymentStats(partialBatch);
      expect(partialStats.totalCharges).toBe(1100);
      expect(partialStats.totalPaid).toBe(500);
      expect(partialStats.balanceDue).toBe(600);
      expect(partialStats.isPartial).toBe(true);
      expect(partialStats.isUnpaid).toBe(false);
      expect(partialStats.isPaid).toBe(false);
      expect(partialStats.status).toBe('PARTIAL');

      // 3. Fully paid batch
      const paidBatch = {
        batchId: 'B-003',
        processorName: 'Sri Murugan Dyeing',
        totalDyeingCost: 1100,
        payments: [
          { id: 'p1', date: '2026-10-14', amount: 500, mode: 'Cash' },
          { id: 'p2', date: '2026-10-15', amount: 600, mode: 'Bank', bankAccountId: 'bank-1' },
        ],
      };
      const paidStats = calcBatchPaymentStats(paidBatch);
      expect(paidStats.totalCharges).toBe(1100);
      expect(paidStats.totalPaid).toBe(1100);
      expect(paidStats.balanceDue).toBe(0);
      expect(paidStats.isPaid).toBe(true);
      expect(paidStats.isPartial).toBe(false);
      expect(paidStats.status).toBe('PAID');
    });

    it('aggregates dyer balance summary across multiple batches for a dyer and overall', () => {
      const batches = [
        {
          batchId: 'B-001',
          processorName: 'Murugan Dyeing',
          totalDyeingCost: 1000,
          payments: [{ amount: 400 }],
        },
        {
          batchId: 'B-002',
          processorName: 'Murugan Dyeing',
          totalDyeingCost: 1500,
          payments: [{ amount: 1500 }],
        },
        {
          batchId: 'B-003',
          processorName: 'Other Dyeing',
          totalDyeingCost: 2000,
          payments: [],
        },
      ];

      // Specific dyer summary
      const muruganSummary = calcDyerBalanceSummary(batches, 'Murugan Dyeing');
      expect(muruganSummary.batchCount).toBe(2);
      expect(muruganSummary.totalCharges).toBe(2500);
      expect(muruganSummary.totalPaid).toBe(1900);
      expect(muruganSummary.balanceDue).toBe(600);
      expect(muruganSummary.unpaidCount).toBe(1);

      // Overall summary across all dyers
      const allSummary = calcDyerBalanceSummary(batches);
      expect(allSummary.batchCount).toBe(3);
      expect(allSummary.totalCharges).toBe(4500);
      expect(allSummary.totalPaid).toBe(1900);
      expect(allSummary.balanceDue).toBe(2600);
      expect(allSummary.unpaidCount).toBe(2);
    });
  });
});
