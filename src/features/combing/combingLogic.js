/**
 * Combing & Processing Batch Logic (Workflow: Dyeing -> Combing & Processing -> Stock)
 *
 * Handles:
 * - Dyed fabric consumption from stock
 * - Combing and processing job work charges
 * - Weight loss calculation measured upon return
 * - Finished combed fabric stock conversion and true unit costing
 */
import { digitsOnly, toNum, todayISO } from '@/core/format';

export const COMBING_STATUS = {
  IN_PROCESS: 'IN_PROCESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const UNITS = ['Rolls', 'Kgs', 'Meters'];

const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

export function emptyCombingBatch(today = todayISO()) {
  return {
    batchId: '',
    batchDate: today,
    status: COMBING_STATUS.IN_PROCESS,
    processorName: '',
    processorOwner: '',
    processorPhone: '',
    processorAddress: '',
    input: {
      description: '',
      unit: 'Rolls',
      qty: '',
      avgRate: '',
      totalCost: 0,
      processingRate: '',
      totalProcessingCost: 0,
      weightLossPct: '',
      weightLossQty: 0,
      expectedOutputQty: 0,
    },
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
 * Derives the weighted average cost and available quantity of the input dyed fabric.
 * Checks completed dyeing batch output receipts, direct purchases, and live stockMap.
 */
export function computeInputFabricRate(
  description = '',
  dyeingBatches = [],
  purchaseBills = [],
  stockMap = new Map(),
) {
  const desc = (description || '').trim().toLowerCase();
  if (!desc) {
    return {
      avgRate: 0,
      availableQty: 0,
      totalQty: 0,
      totalCost: 0,
      sourcesCount: 0,
      sources: [],
      history: [],
    };
  }

  // 1. Check stockMap for current available quantity
  let availableQty = 0;
  if (stockMap && typeof stockMap.get === 'function') {
    const rawMatch = stockMap.get(description.trim());
    if (rawMatch) {
      availableQty = toNum(rawMatch.available);
    } else {
      for (const [k, v] of stockMap.entries()) {
        if (k.trim().toLowerCase() === desc) {
          availableQty = toNum(v.available);
          break;
        }
      }
    }
  }

  let totalQty = 0;
  let totalCost = 0;
  const sourceSet = new Set();
  const history = [];

  // 2. Check completed dyeing batches where output fabric was manufactured
  if (Array.isArray(dyeingBatches)) {
    dyeingBatches.forEach((batch) => {
      if (batch.status === 'COMPLETED' && Array.isArray(batch.output)) {
        batch.output.forEach((out) => {
          if (
            String(out.description || '')
              .trim()
              .toLowerCase() === desc
          ) {
            const qty = toNum(out.qty);
            const rate = toNum(out.unitCost);
            if (qty > 0 && rate > 0) {
              const amount = round2(qty * rate);
              totalQty += qty;
              totalCost += amount;
              const source = `${batch.processorName || 'Dye House'} (Batch #${batch.batchId})`;
              sourceSet.add(source);
              history.push({
                sourceName: source,
                date: batch.completedAt || batch.batchDate || '',
                ref: `Batch #${batch.batchId}`,
                qty,
                rate,
                amount,
              });
            }
          }
        });
      }
    });
  }

  // 3. Check purchase bills (in case dyed fabric was purchased directly)
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
          if (qty > 0 && rate > 0) {
            const amount = round2(qty * rate);
            totalQty += qty;
            totalCost += amount;
            const supplier = bill.supplierName || 'Unknown Supplier';
            sourceSet.add(supplier);
            history.push({
              sourceName: supplier,
              date: bill.invoiceDate || bill.date || '',
              ref: bill.invoiceNo ? `Bill #${bill.invoiceNo}` : 'Purchase',
              qty,
              rate,
              amount,
            });
          }
        }
      });
    });
  }

  // 4. Fallback to stockMap avgPurchaseRate if direct history had no records
  if (totalQty === 0 && stockMap && typeof stockMap.get === 'function') {
    const info = stockMap.get(description.trim());
    if (info && (info.avgPurchaseRate > 0 || info.purchaseHistory?.length > 0)) {
      const avgRate = round2(toNum(info.avgPurchaseRate));
      const hist = info.purchaseHistory || [];
      const parties = Array.from(new Set(hist.map((h) => h.party).filter(Boolean)));
      return {
        avgRate,
        availableQty: toNum(info.available),
        totalQty: round3(toNum(info.purchased || info.available)),
        totalCost: round2(avgRate * toNum(info.purchased || info.available)),
        sourcesCount: parties.length || 1,
        sources: parties,
        history: hist.map((h) => ({
          sourceName: h.party || 'Supplier/Dyer',
          date: h.date || '',
          ref: h.invoiceNo || '',
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
    availableQty,
    totalQty: round3(totalQty),
    totalCost: round2(totalCost),
    sourcesCount: sourceSet.size,
    sources: Array.from(sourceSet),
    history: history.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
  };
}

/**
 * Calculates complete financial and quantity totals for a combing & processing batch:
 *
 * 1. Dispatched Material Cost:
 *    Total Fabric Cost = input.qty * input.avgRate
 *
 * 2. Combing & Processing Charges:
 *    Total Processing Cost = input.qty * input.processingRate
 *
 * 3. Total Batch Cost:
 *    Total Batch Cost = Total Fabric Cost + Total Processing Cost
 *
 * 4. Weight Loss & Finished Yield Adjustment:
 *    Cost per unit before weight loss = input.avgRate + input.processingRate
 *    Weight Loss Qty = input.qty * (weightLossPct / 100)
 *    Expected Finished Qty = input.qty - Weight Loss Qty
 *    Adjusted Finished Fabric Cost = Total Batch Cost ÷ Expected Finished Qty
 */
export function calcCombingBatchTotals(form) {
  const inputQty = toNum(form.input?.qty);
  const fabricRate = toNum(form.input?.avgRate);
  const totalFabricCost = round2(inputQty * fabricRate);

  const processingRate = toNum(form.input?.processingRate ?? form.processingRate);
  const totalProcessingCost = round2(inputQty * processingRate);

  const totalBatchCost = round2(totalFabricCost + totalProcessingCost);
  const costPerUnitBeforeLoss = round2(fabricRate + processingRate);

  // Weight loss calculations
  const weightLossPct = toNum(form.input?.weightLossPct ?? form.weightLossPct);
  const weightLossQty = round3(inputQty * (weightLossPct / 100));
  const expectedOutputQty = round3(Math.max(0, inputQty - weightLossQty));

  // Adjusted finished unit cost based on expected weight loss
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
    return {
      ...out,
      qty: out.qty,
      allocatedCost: round2(qty * adjustedUnitCost),
      unitCost: adjustedUnitCost,
    };
  });

  return {
    inputQty,
    fabricRate,
    totalFabricCost,
    processingRate,
    totalProcessingCost,
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
 * Validates a combing batch form.
 */
export function validateCombingBatch(form) {
  if (!form.batchId?.trim()) {
    return { title: 'Missing Information', message: 'Please enter a Batch Number.' };
  }
  if (!form.batchDate) {
    return { title: 'Missing Information', message: 'Please select a Batch Date.' };
  }
  if (!form.processorName?.trim()) {
    return { title: 'Missing Information', message: 'Please enter the Combing / Processing Mill Name.' };
  }
  if (!form.input?.description?.trim()) {
    return { title: 'Missing Input Material', message: 'Please select the dyed fabric to process.' };
  }
  if (toNum(form.input?.qty) <= 0) {
    return { title: 'Invalid Quantity', message: 'Please enter a valid fabric quantity greater than 0.' };
  }

  if (form.status === COMBING_STATUS.COMPLETED) {
    const validOutputs = (form.output || []).filter((o) => o.description?.trim() && toNum(o.qty) > 0);
    if (validOutputs.length === 0) {
      return {
        title: 'Missing Finished Goods',
        message:
          'To mark the batch as Completed, please specify at least one finished combed product with quantity.',
      };
    }
  }

  return null;
}

/**
 * Filter combing batches by search term and status.
 */
export function filterCombingBatches(batches = [], query = '', statusFilter = 'ALL') {
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
 * Suggests the next sequential combing batch ID, e.g. "CB-001", "CB-002".
 */
export function suggestNextCombingBatchId(existingBatches = []) {
  if (!existingBatches || existingBatches.length === 0) {
    return 'CB-001';
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
  return `CB-${String(next).padStart(3, '0')}`;
}

/**
 * Creates a blank Processor record.
 */
export function emptyProcessor() {
  return {
    processorName: '',
    ownerName: '',
    phone: '',
    address: '',
  };
}

/**
 * Validates a Processor record.
 */
export function validateProcessor(processor = {}) {
  const name = (processor.processorName || processor.name || '').trim();
  const ownerName = (processor.ownerName || '').trim();
  const phone = (processor.phone || '').trim();

  if (!name) {
    return { title: 'Missing Information', message: 'Please enter the Mill / Processing Unit Name.' };
  }
  if (!ownerName) {
    return { title: 'Missing Information', message: 'Please enter the Owner / Contact Person Name.' };
  }
  if (!phone || digitsOnly(phone).length < 10) {
    return { title: 'Invalid Phone Number', message: 'Please enter a valid 10-digit mobile number.' };
  }
  return null;
}

/**
 * Filter Processors by query.
 */
export function filterProcessors(processors = [], query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return processors;
  const qDigits = digitsOnly(q);
  return processors.filter((p) => {
    const matchName = (p.processorName || p.name || '').toLowerCase().includes(q);
    const matchOwner = (p.ownerName || '').toLowerCase().includes(q);
    const matchAddress = (p.address || '').toLowerCase().includes(q);
    const matchPhone = qDigits && digitsOnly(p.phone || '').includes(qDigits);
    return matchName || matchOwner || matchAddress || matchPhone;
  });
}

/**
 * Match a processor by exact phone or name.
 */
export function findProcessorByQuery(processors = [], query = '') {
  const q = (query || '').trim().toLowerCase();
  if (!q) return null;
  const qDigits = digitsOnly(q);

  return (
    processors.find((p) => {
      if (qDigits && qDigits.length >= 10 && digitsOnly(p.phone || '') === qDigits) {
        return true;
      }
      return (p.processorName || p.name || '').trim().toLowerCase() === q;
    }) || null
  );
}

/**
 * Calculates payment statistics for a combing & processing batch:
 * - totalCharges: Processing charges payable to the mill/processor
 * - totalPaid: Sum of all recorded payments
 * - balanceDue: Remaining balance to be paid
 * - status: 'PAID' | 'PARTIAL' | 'UNPAID' | 'NO_CHARGES'
 */
export function calcCombingBatchPaymentStats(batch) {
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

  const processingCost = toNum(batch.totalProcessingCost);
  const inputProcessingCost = toNum(batch.input?.totalProcessingCost);
  const rateTimesQty = toNum(batch.processingRate || batch.input?.processingRate) * toNum(batch.input?.qty);

  const totalCharges = round2(processingCost || inputProcessingCost || rateTimesQty || 0);

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
 * Aggregates batch financial balance statistics for a given Processor (or all processors).
 */
export function calcProcessorBalanceSummary(batches = [], processorName = '') {
  const target = (processorName || '').trim().toLowerCase();
  const relevantBatches = target
    ? batches.filter(
        (b) =>
          (b.processorName || '').trim().toLowerCase() === target ||
          (b.name || '').trim().toLowerCase() === target,
      )
    : batches;

  let totalCharges = 0;
  let totalPaid = 0;
  let balanceDue = 0;
  let batchCount = relevantBatches.length;
  let unpaidCount = 0;

  relevantBatches.forEach((b) => {
    const stats = calcCombingBatchPaymentStats(b);
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
