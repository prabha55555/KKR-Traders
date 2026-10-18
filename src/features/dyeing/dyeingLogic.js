/**
 * Dyeing & Processing Batch Logic (Workflow 2: Manufacturing & Processing)
 *
 * Pure business logic for:
 * - Raw grey roll consumption
 * - Additional processing expenses (dyeing charges, chemicals, labor, transport)
 * - Finished colored roll conversion
 * - Shrinkage & loss tracking (Rolls / Kgs / Meters)
 * - True unit cost allocation
 */
import { digitsOnly, toNum, todayISO } from '@/core/format';

export const DYEING_STATUS = {
  IN_PROCESS: 'IN_PROCESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Dyeing Charges',
  'Coloring Materials & Chemicals',
  'Labor & Handling',
  'Transport & Freight',
  'Other Processing Expenses',
];

export const UNITS = ['Rolls', 'Kgs', 'Meters'];

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Calculates weighted average purchase rate for a grey fabric roll
 * across all supplier purchase bills and opening stock.
 *
 * Formula:
 * Average Grey Purchase Rate = Total Purchase Cost ÷ Total Quantity
 *
 * Example:
 * Supplier 1: 10 @ ₹15 = ₹150
 * Supplier 2: 20 @ ₹10 = ₹200
 * Supplier 3: 25 @ ₹20 = ₹500
 * Total: 55 units, ₹850 cost -> Average = ₹15.45 / unit
 */
export function computeGreyPurchaseRate(
  description,
  purchaseBills = [],
  openingStocks = [],
  stockMap = null,
) {
  const desc = String(description || '')
    .trim()
    .toLowerCase();
  if (!desc) {
    return {
      avgRate: 0,
      totalQty: 0,
      totalCost: 0,
      suppliersCount: 0,
      suppliers: [],
      history: [],
    };
  }

  const history = [];
  const supplierSet = new Set();
  let totalCost = 0;
  let totalQty = 0;

  // 1. Scan all purchase bills
  if (Array.isArray(purchaseBills)) {
    purchaseBills.forEach((bill) => {
      if (!bill.products || !Array.isArray(bill.products)) return;
      bill.products.forEach((prod) => {
        if (
          String(prod.description || '')
            .trim()
            .toLowerCase() === desc
        ) {
          const qty = toNum(prod.qty);
          const rate = toNum(prod.rate);
          if (qty > 0) {
            const amount = round2(qty * rate);
            totalQty += qty;
            totalCost += amount;
            const supplier = bill.supplierName || 'Unknown Supplier';
            supplierSet.add(supplier);
            history.push({
              supplierName: supplier,
              date: bill.invoiceDate || bill.date || '',
              invoiceNo: String(bill.invoiceNo || ''),
              qty,
              rate,
              amount,
            });
          }
        }
      });
    });
  }

  // 2. Scan opening stock if any
  if (Array.isArray(openingStocks)) {
    openingStocks.forEach((os) => {
      if (
        String(os.description || '')
          .trim()
          .toLowerCase() === desc
      ) {
        const qty = toNum(os.qty);
        const rate = toNum(os.rate || os.purchaseRate);
        if (qty > 0 && rate > 0) {
          const amount = round2(qty * rate);
          totalQty += qty;
          totalCost += amount;
          supplierSet.add('Opening Stock');
          history.push({
            supplierName: 'Opening Stock',
            date: '',
            invoiceNo: 'Opening Stock',
            qty,
            rate,
            amount,
          });
        }
      }
    });
  }

  // 3. Fallback to stockMap if no direct purchase entries found
  if (totalQty === 0 && stockMap && typeof stockMap.get === 'function') {
    const info = stockMap.get(description.trim()) || stockMap.get(desc);
    if (info && (info.avgPurchaseRate > 0 || info.purchaseHistory?.length > 0)) {
      const avgRate = round2(toNum(info.avgPurchaseRate));
      const hist = info.purchaseHistory || [];
      const parties = Array.from(new Set(hist.map((h) => h.party).filter(Boolean)));
      return {
        avgRate,
        totalQty: round3(toNum(info.purchased || info.available)),
        totalCost: round2(avgRate * toNum(info.purchased || info.available)),
        suppliersCount: parties.length || 1,
        suppliers: parties,
        history: hist.map((h) => ({
          supplierName: h.party || 'Supplier',
          date: h.date || '',
          invoiceNo: h.invoiceNo || '',
          qty: h.qty,
          rate: h.rate,
          amount: h.amount,
        })),
      };
    }
  }

  const avgRate = totalQty > 0 ? round2(totalCost / totalQty) : 0;

  return {
    avgRate,
    totalQty: round3(totalQty),
    totalCost: round2(totalCost),
    suppliersCount: supplierSet.size,
    suppliers: Array.from(supplierSet),
    history,
  };
}

export function emptyDyeingBatch(today = todayISO()) {
  return {
    batchId: '',
    batchDate: today,
    status: DYEING_STATUS.IN_PROCESS,
    processorName: '',
    processorOwner: '',
    processorPhone: '',
    processorAddress: '',
    input: {
      description: '',
      unit: 'Rolls',
      qty: '',
      avgGreyRate: '',
      totalGreyCost: 0,
      dyeingRate: '',
      totalDyeingCost: 0,
      weightLossPct: '',
      weightLossQty: 0,
      expectedOutputQty: 0,
    },
    expenses: [],
    output: [
      {
        description: '',
        unit: 'Rolls',
        qty: '',
        allocatedCost: 0,
        unitCost: 0,
      },
    ],
    notes: '',
  };
}

/**
 * Calculates complete financial and quantity totals for a dyeing batch:
 *
 * 1. Raw Grey Cost:
 *    Total Grey Cost = input.qty * avgGreyRate
 *
 * 2. Processing / Dyeing Cost:
 *    Total Dyeing Cost = input.qty * dyeingRate
 *    Total Processing Expenses = Total Dyeing Cost + (optional legacy expenses)
 *
 * 3. Total Batch Cost:
 *    Total Batch Cost = Total Grey Cost + Total Processing Expenses
 *
 * 4. Weight Loss & Finished Goods Cost Adjustment:
 *    Cost per unit before weight loss = avgGreyRate + dyeingRate
 *    Weight Loss Qty = input.qty * (weightLossPct / 100)
 *    Expected Finished Qty = input.qty - Weight Loss Qty
 *    Adjusted Finished Fabric Cost = Total Batch Cost ÷ Expected Finished Qty
 *
 * Example:
 * - 55 grey rolls @ ₹15.45 = ₹849.75 (~₹850)
 * - Dyeing charges @ ₹20.00/unit = ₹1,100.00
 * - Total cost before loss = ₹1,950.00 (₹35.45/unit)
 * - 5% weight loss = 2.75 units loss -> Expected finished = 52.25 units
 * - Adjusted finished fabric cost = ₹1,950 ÷ 52.25 = ₹37.32 per finished unit
 */
export function calcBatchTotals(form) {
  const inputQty = toNum(form.input?.qty);
  const greyRate = toNum(form.input?.avgGreyRate);
  const totalGreyCost = round2(inputQty * greyRate);

  const dyeingRate = toNum(form.input?.dyeingRate ?? form.dyeingRate);
  const totalDyeingCost = round2(inputQty * dyeingRate);

  // Optional legacy itemized expenses support
  const legacyExpenses = Array.isArray(form.expenses)
    ? round2(form.expenses.reduce((sum, e) => sum + toNum(e.amount), 0))
    : 0;

  const totalExpenses = round2(totalDyeingCost + legacyExpenses);
  const totalBatchCost = round2(totalGreyCost + totalExpenses);

  const costPerUnitBeforeLoss = round2(greyRate + dyeingRate);

  // Weight loss calculations
  const weightLossPct = toNum(form.input?.weightLossPct ?? form.weightLossPct);
  const weightLossQty = round3(inputQty * (weightLossPct / 100));
  const expectedOutputQty = round3(Math.max(0, inputQty - weightLossQty));

  // Adjusted finished unit cost based on weight loss
  const adjustedUnitCost =
    expectedOutputQty > 0 ? round2(totalBatchCost / expectedOutputQty) : costPerUnitBeforeLoss;

  const outputs = Array.isArray(form.output) ? form.output : [];
  const totalOutputQty = round3(outputs.reduce((sum, o) => sum + toNum(o.qty), 0));

  // Actual shrinkage tracking if output goods are recorded
  const actualShrinkageQty =
    totalOutputQty > 0 ? round3(Math.max(0, inputQty - totalOutputQty)) : weightLossQty;
  const actualShrinkagePct = inputQty > 0 ? round2((actualShrinkageQty / inputQty) * 100) : weightLossPct;

  // Finished unit cost allocation
  const avgFinishedUnitCost = totalOutputQty > 0 ? round2(totalBatchCost / totalOutputQty) : adjustedUnitCost;

  // Allocate cost to output lines proportionally by quantity
  const enrichedOutput = outputs.map((out) => {
    const qty = toNum(out.qty);
    if (totalOutputQty > 0 && qty > 0) {
      const ratio = qty / totalOutputQty;
      const allocatedCost = round2(totalBatchCost * ratio);
      const unitCost = round2(allocatedCost / qty);
      return {
        ...out,
        qty: out.qty,
        allocatedCost,
        unitCost,
      };
    }
    // If output quantity not yet entered, show adjusted unit cost based on expected weight loss
    return {
      ...out,
      qty: out.qty,
      allocatedCost: round2(qty * adjustedUnitCost),
      unitCost: adjustedUnitCost,
    };
  });

  return {
    inputQty,
    greyRate,
    totalGreyCost,
    dyeingRate,
    totalDyeingCost,
    legacyExpenses,
    totalExpenses,
    totalBatchCost,
    costPerUnitBeforeLoss,
    weightLossPct,
    weightLossQty,
    expectedOutputQty,
    adjustedUnitCost,
    totalOutputQty,
    shrinkageQty: actualShrinkageQty,
    shrinkagePct: actualShrinkagePct,
    avgFinishedUnitCost,
    enrichedOutput,
  };
}

/**
 * Validates a dyeing batch form.
 * Returns null if valid, or an object { title, message } if invalid.
 */
export function validateDyeingBatch(form) {
  if (!form.batchId?.trim()) {
    return { title: 'Missing Information', message: 'Please enter a Batch Number.' };
  }
  if (!form.batchDate) {
    return { title: 'Missing Information', message: 'Please select a Batch Date.' };
  }
  if (!form.processorName?.trim()) {
    return { title: 'Missing Information', message: 'Please enter the Processor / Dye House Name.' };
  }
  if (!form.input?.description?.trim()) {
    return { title: 'Missing Input Material', message: 'Please select the raw grey fabric to process.' };
  }
  if (toNum(form.input?.qty) <= 0) {
    return { title: 'Invalid Quantity', message: 'Please enter a valid raw grey quantity greater than 0.' };
  }

  if (form.status === DYEING_STATUS.COMPLETED) {
    const validOutputs = (form.output || []).filter((o) => o.description?.trim() && toNum(o.qty) > 0);
    if (validOutputs.length === 0) {
      return {
        title: 'Missing Finished Goods',
        message:
          'To mark the batch as Completed, please specify at least one finished colored fabric with quantity.',
      };
    }
  }

  return null;
}

/**
 * Filter batches by search term (batchId, processor, grey item, or output colors) and status.
 */
export function filterBatches(batches = [], query = '', statusFilter = 'ALL') {
  const q = query.trim().toLowerCase();
  return batches.filter((b) => {
    if (statusFilter !== 'ALL' && b.status !== statusFilter) {
      return false;
    }
    if (!q) return true;

    const matchId = (b.batchId || '').toLowerCase().includes(q);
    const matchProcessor = (b.processorName || '').toLowerCase().includes(q);
    const matchInput = (b.input?.description || '').toLowerCase().includes(q);
    const matchOutput = (b.output || []).some((o) => (o.description || '').toLowerCase().includes(q));
    return matchId || matchProcessor || matchInput || matchOutput;
  });
}

/**
 * Suggests the next sequential batch ID, e.g. "B-001", "B-002".
 */
export function suggestNextBatchId(existingBatches = []) {
  if (!existingBatches || existingBatches.length === 0) {
    return 'B-001';
  }
  let maxNum = 0;
  existingBatches.forEach((b) => {
    const id = String(b.batchId || '').trim();
    const match = id.match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  const next = maxNum + 1;
  return `B-${String(next).padStart(3, '0')}`;
}

/**
 * Creates a blank Dyer / Dyeing unit record.
 */
export function emptyDyer() {
  return {
    dyeingName: '',
    ownerName: '',
    phone: '',
    address: '',
  };
}

/**
 * Validates a Dyer record (Dyeing Name, Owner Name, Phone >= 10 digits).
 */
export function validateDyer(dyer = {}) {
  const dyeingName = (dyer.dyeingName || '').trim();
  const ownerName = (dyer.ownerName || '').trim();
  const phone = (dyer.phone || '').trim();

  if (!dyeingName) {
    return { title: 'Missing Information', message: 'Please enter the Dyeing / Factory Name.' };
  }
  if (!ownerName) {
    return { title: 'Missing Information', message: 'Please enter the Dyeing Owner / Contact Person Name.' };
  }
  if (!phone || digitsOnly(phone).length < 10) {
    return { title: 'Invalid Phone Number', message: 'Please enter a valid 10-digit mobile number.' };
  }
  return null;
}

/**
 * Search/filter Dyers by dyeing name, owner name, phone, or address.
 */
export function filterDyers(dyers = [], query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return dyers;
  const qDigits = digitsOnly(q);
  return dyers.filter((d) => {
    const matchName = (d.dyeingName || '').toLowerCase().includes(q);
    const matchOwner = (d.ownerName || '').toLowerCase().includes(q);
    const matchAddress = (d.address || '').toLowerCase().includes(q);
    const matchPhone =
      (d.phone || '').toLowerCase().includes(q) || (qDigits && digitsOnly(d.phone || '').includes(qDigits));
    return matchName || matchOwner || matchAddress || matchPhone;
  });
}

/**
 * Finds a matching dyer by query (exact phone or dyeing name).
 */
export function findDyerByQuery(dyers = [], query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q || !Array.isArray(dyers)) return null;
  const qDigits = digitsOnly(q);

  // Exact phone match first
  if (qDigits && qDigits.length >= 10) {
    const byPhone = dyers.find((d) => digitsOnly(d.phone || '') === qDigits);
    if (byPhone) return byPhone;
  }

  // Exact name match
  const byExactName = dyers.find((d) => (d.dyeingName || '').trim().toLowerCase() === q);
  if (byExactName) return byExactName;

  // Substring match if unique
  const matches = filterDyers(dyers, q);
  if (matches.length === 1) return matches[0];

  return null;
}

/**
 * Calculates payment statistics for a dyeing batch:
 * - totalCharges: Processing charges payable to the dyer
 * - totalPaid: Sum of all recorded payments
 * - balanceDue: Remaining balance to be paid
 * - status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'NO_CHARGES'
 */
export function calcBatchPaymentStats(batch) {
  if (!batch) {
    return {
      totalCharges: 0,
      totalPaid: 0,
      balanceDue: 0,
      paymentsCount: 0,
      payments: [],
      isPaid: false,
      isPartial: false,
      isUnpaid: false,
      status: 'NO_CHARGES',
    };
  }

  const dyeingCost = toNum(batch.totalDyeingCost);
  const inputDyeingCost = toNum(batch.input?.totalDyeingCost);
  const rateTimesQty = toNum(batch.dyeingRate || batch.input?.dyeingRate) * toNum(batch.input?.qty);
  const legacyExpenses = toNum(batch.totalExpenses);

  // Determine total payable charges to the dyer
  const totalCharges = round2(dyeingCost || inputDyeingCost || rateTimesQty || legacyExpenses || 0);

  const payments = Array.isArray(batch.payments) ? batch.payments : [];
  const totalPaid = round2(payments.reduce((sum, p) => sum + toNum(p.amount), 0));
  const balanceDue = Math.max(0, round2(totalCharges - totalPaid));

  let status = 'NO_CHARGES';
  let isPaid = false;
  let isPartial = false;
  let isUnpaid = false;

  if (totalCharges > 0) {
    if (totalPaid >= totalCharges) {
      status = 'PAID';
      isPaid = true;
    } else if (totalPaid > 0) {
      status = 'PARTIAL';
      isPartial = true;
    } else {
      status = 'UNPAID';
      isUnpaid = true;
    }
  }

  return {
    totalCharges,
    totalPaid,
    balanceDue,
    paymentsCount: payments.length,
    payments,
    isPaid,
    isPartial,
    isUnpaid,
    hasBalanceDue: balanceDue > 0 && totalCharges > 0,
    status,
  };
}

/**
 * Aggregates batch financial balance statistics for a given Dyer (or all dyers).
 */
export function calcDyerBalanceSummary(batches = [], dyerName = '') {
  const target = (dyerName || '').trim().toLowerCase();
  const relevantBatches = target
    ? batches.filter((b) => (b.processorName || '').trim().toLowerCase() === target)
    : batches;

  let totalCharges = 0;
  let totalPaid = 0;
  let balanceDue = 0;
  let batchCount = relevantBatches.length;
  let unpaidCount = 0;

  relevantBatches.forEach((b) => {
    const stats = calcBatchPaymentStats(b);
    totalCharges += stats.totalCharges;
    totalPaid += stats.totalPaid;
    balanceDue += stats.balanceDue;
    if (stats.balanceDue > 0) unpaidCount++;
  });

  return {
    batchCount,
    unpaidCount,
    totalCharges: round2(totalCharges),
    totalPaid: round2(totalPaid),
    balanceDue: round2(balanceDue),
    isSettled: balanceDue <= 0 && totalCharges > 0,
  };
}
