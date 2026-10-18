import { db } from '@/core/db';
import { todayISO } from '@/core/format';
import { getStockQuantityMap, invalidateStocksCache } from '@/features/overview/stocks/stocksService';
import { calcBatchTotals, validateDyeingBatch, validateDyer } from './dyeingLogic';

/**
 * Loads all data needed for the Dyeing & Processing section:
 * - Batches
 * - Product Shortcuts (catalogue)
 * - Bank Accounts (for expense payments)
 * - Live Stock Map (for checking available grey roll quantities)
 * - Dyers Directory
 */
export async function loadDyeingData() {
  const [batches, shortcuts, bankAccounts, stockMap, purchaseBills, dyers] = await Promise.all([
    db.getAllDyeingBatches ? db.getAllDyeingBatches() : Promise.resolve([]),
    db.getAllShortcuts ? db.getAllShortcuts() : Promise.resolve([]),
    db.getAllBankAccounts ? db.getAllBankAccounts() : Promise.resolve([]),
    getStockQuantityMap(true),
    db.getAllPurchaseBills ? db.getAllPurchaseBills() : Promise.resolve([]),
    db.getAllDyers ? db.getAllDyers() : Promise.resolve([]),
  ]);

  return {
    batches: batches || [],
    shortcuts: shortcuts || [],
    bankAccounts: bankAccounts || [],
    stockMap: stockMap || new Map(),
    purchaseBills: purchaseBills || [],
    dyers: dyers || [],
  };
}

/**
 * Saves a dyeing batch and handles live financial tracking if expenses were paid
 * via Bank Account or Cash in Hand.
 */
export async function saveDyeingBatchRecord(form) {
  const validationError = validateDyeingBatch(form);
  if (validationError) {
    throw new Error(`${validationError.title}: ${validationError.message}`);
  }

  const totals = calcBatchTotals(form);

  const batchDoc = {
    batchId: form.batchId.trim(),
    batchDate: form.batchDate,
    status: form.status,
    processorName: form.processorName.trim(),
    processorOwner: (form.processorOwner || '').trim(),
    processorPhone: (form.processorPhone || '').trim(),
    processorAddress: (form.processorAddress || '').trim(),
    input: {
      description: form.input.description.trim(),
      unit: form.input.unit || 'Rolls',
      qty: totals.inputQty,
      avgGreyRate: totals.greyRate,
      totalGreyCost: totals.totalGreyCost,
      dyeingRate: totals.dyeingRate,
      totalDyeingCost: totals.totalDyeingCost,
      weightLossPct: totals.weightLossPct,
      weightLossQty: totals.weightLossQty,
      expectedOutputQty: totals.expectedOutputQty,
    },
    dyeingRate: totals.dyeingRate,
    totalDyeingCost: totals.totalDyeingCost,
    weightLossPct: totals.weightLossPct,
    weightLossQty: totals.weightLossQty,
    expectedOutputQty: totals.expectedOutputQty,
    costPerUnitBeforeLoss: totals.costPerUnitBeforeLoss,
    adjustedUnitCost: totals.adjustedUnitCost,
    expenses: (form.expenses || []).map((e) => ({
      category: e.category,
      amount: parseFloat(e.amount) || 0,
      paidVia: e.paidVia || 'cash',
      bankAccountId: e.bankAccountId || null,
    })),
    totalExpenses: totals.totalExpenses,
    totalBatchCost: totals.totalBatchCost,
    output: totals.enrichedOutput.map((o) => ({
      description: (o.description || '').trim(),
      unit: o.unit || form.input.unit || 'Rolls',
      qty: parseFloat(o.qty) || 0,
      allocatedCost: o.allocatedCost || 0,
      unitCost: o.unitCost || 0,
    })),
    totalOutputQty: totals.totalOutputQty,
    shrinkageQty: totals.shrinkageQty,
    shrinkagePct: totals.shrinkagePct,
    avgFinishedUnitCost: totals.avgFinishedUnitCost,
    notes: (form.notes || '').trim(),
    completedAt: form.status === 'COMPLETED' ? form.completedAt || new Date().toISOString() : null,
  };

  await db.saveDyeingBatch(batchDoc);

  // Sync paid expenses with Finance bank & cash accounts
  if (Array.isArray(batchDoc.expenses) && db.saveAccountTransaction) {
    for (const exp of batchDoc.expenses) {
      if (exp.amount > 0 && (exp.paidVia === 'bank' || exp.paidVia === 'cash')) {
        try {
          await db.saveAccountTransaction({
            id: `dye_exp_${batchDoc.batchId}_${exp.category.replace(/\s+/g, '_').toLowerCase()}`,
            date: batchDoc.batchDate,
            type: 'expense',
            category: 'Dyeing & Processing',
            amount: exp.amount,
            bankAccountId: exp.paidVia === 'bank' ? exp.bankAccountId : null,
            notes: `Batch ${batchDoc.batchId}: ${exp.category} (${batchDoc.processorName})`,
          });
        } catch (err) {
          console.warn('Failed to post account transaction for dyeing expense:', err);
        }
      }
    }
  }

  invalidateStocksCache();
  if (db.invalidate) db.invalidate('dyeing_batches');
  return batchDoc;
}

/**
 * Deletes a dyeing batch and frees allocated stock.
 */
export async function deleteDyeingBatchRecord(batchId) {
  try {
    let batch = await db.getDyeingBatch(batchId);
    if (!batch && db.getAllDyeingBatches) {
      const all = await db.getAllDyeingBatches();
      batch = all.find((b) => b.batchId === batchId || b.id === batchId);
    }
    if (batch && Array.isArray(batch.payments) && db.deleteAccountTransaction) {
      for (const p of batch.payments) {
        try {
          await db.deleteAccountTransaction(p.id);
        } catch (err) {
          console.warn('Failed to delete transaction for payment:', p.id, err);
        }
      }
    }
  } catch (e) {
    console.warn('Error reading batch before deletion:', e);
  }

  await db.deleteDyeingBatch(batchId);
  invalidateStocksCache();
  if (db.invalidate) db.invalidate('dyeing_batches');
}

/**
 * Saves or updates a Dyer directory entry.
 */
export async function saveDyerRecord(dyer) {
  const error = validateDyer(dyer);
  if (error) {
    throw new Error(`${error.title}: ${error.message}`);
  }
  const clean = {
    id: dyer.id || (dyer.phone ? `dyer_${dyer.phone.trim()}` : undefined),
    dyeingName: dyer.dyeingName.trim(),
    ownerName: dyer.ownerName.trim(),
    phone: dyer.phone.trim(),
    address: (dyer.address || '').trim(),
  };
  // a NEW unit with the phone of an existing one would overwrite it (the id is built from the phone)
  if (!dyer.id) {
    const taken = (await db.getAllDyers()).find((d) => String(d.phone ?? '').trim() === clean.phone);
    if (taken) {
      throw new Error(
        `Duplicate: ${taken.dyeingName || 'Another dyeing unit'} already uses this phone number. Edit that unit instead.`,
      );
    }
  }
  const id = await db.saveDyer(clean);
  db.invalidate('dyers');
  return { ...clean, id };
}

/**
 * Deletes a Dyer record from the directory.
 */
export async function deleteDyerRecord(id) {
  await db.deleteDyer(id);
  db.invalidate('dyers');
}

/**
 * Fetches all saved Dyers from the database.
 */
export async function getAllDyersList() {
  if (!db.getAllDyers) return [];
  return (await db.getAllDyers()) || [];
}

/**
 * Records a payment against a dyeing batch and syncs with finance account transactions.
 */
export async function addDyeingBatchPayment(batchId, paymentData) {
  const amt = parseFloat(paymentData.amount);
  if (!amt || amt <= 0) {
    throw new Error('Please enter a valid payment amount greater than zero.');
  }

  const batch = await db.getDyeingBatch(batchId);
  if (!batch) {
    throw new Error(`Dyeing batch ${batchId} was not found.`);
  }

  const paymentId = `dye_pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const paymentRecord = {
    id: paymentId,
    date: paymentData.date || todayISO(),
    amount: Math.round(amt * 100) / 100,
    mode: paymentData.mode || 'Cash', // 'Cash' | 'Bank' (Account; legacy 'UPI' is also Account)
    bankAccountId: paymentData.mode === 'Cash' ? null : paymentData.bankAccountId || null,
    bankAccountName: paymentData.bankAccountName || '',
    reference: (paymentData.reference || '').trim(),
    notes: (paymentData.notes || '').trim(),
    createdAt: new Date().toISOString(),
  };

  const payments = Array.isArray(batch.payments) ? [...batch.payments, paymentRecord] : [paymentRecord];
  const updatedBatch = {
    ...batch,
    payments,
    updatedAt: new Date().toISOString(),
  };

  await db.saveDyeingBatch(updatedBatch);

  // Sync with live financial accounts
  if (db.saveAccountTransaction) {
    try {
      const source = paymentRecord.mode === 'Cash' ? 'cash' : paymentRecord.bankAccountId || 'cash';
      await db.saveAccountTransaction({
        id: paymentId,
        date: paymentRecord.date,
        type: 'expense',
        category: 'Dyeing Payment',
        amount: paymentRecord.amount,
        fromAccount: source,
        bankAccountId: paymentRecord.mode !== 'Cash' ? paymentRecord.bankAccountId : null,
        notes: `Dyeing Batch ${batch.batchId} (${batch.processorName || 'Dyer'})${
          paymentRecord.reference ? ` - Ref: ${paymentRecord.reference}` : ''
        }`,
      });
    } catch (err) {
      console.warn('Failed to record account transaction for dyeing payment:', err);
    }
  }

  if (db.invalidate) {
    db.invalidate('dyeing_batches', 'account_transactions');
  }

  return { batch: updatedBatch, payment: paymentRecord };
}

/**
 * Removes a payment from a dyeing batch and removes the corresponding finance account transaction.
 */
export async function deleteDyeingBatchPayment(batchId, paymentId) {
  let batch = await db.getDyeingBatch(batchId);
  if (!batch && db.getAllDyeingBatches) {
    const all = await db.getAllDyeingBatches();
    batch = all.find((b) => b.batchId === batchId || b.id === batchId);
  }
  if (!batch) {
    throw new Error(`Dyeing batch ${batchId} was not found.`);
  }

  const updatedPayments = (batch.payments || []).filter((p) => p.id !== paymentId);
  const updatedBatch = {
    ...batch,
    payments: updatedPayments,
    updatedAt: new Date().toISOString(),
  };

  await db.saveDyeingBatch(updatedBatch);

  if (db.deleteAccountTransaction) {
    try {
      await db.deleteAccountTransaction(paymentId);
    } catch (err) {
      console.warn('Failed to delete account transaction for dyeing payment:', err);
    }
  }

  if (db.invalidate) {
    db.invalidate('dyeing_batches', 'account_transactions');
  }

  return updatedBatch;
}
