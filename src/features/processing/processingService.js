/**
 * Firestore side of Processing Lots (see lotLogic.js for the flow). Stock is never stored: it is derived from the
 * lots (grey out at Issue, finished in at Received) by the stock page, so every change here shows up in stock at once.
 * Payments to the dyeing / combing unit are mirrored into `account_transactions` so Cash in Hand and bank balances
 * follow, exactly like the payments of the old dyeing / combing batches.
 */
import { db } from '@/core/db';
import { todayISO, toNum } from '@/core/format';
import { getStockQuantityMap, invalidateStocksCache } from '@/features/overview/stocks/stocksService';
import { lookupStock } from '@/features/overview/stocks/stocksLogic';
import {
  LOT_STATUS,
  formatDcNo,
  lotReturns,
  lotTotals,
  stageCharge,
  unitName,
  validateDyed,
  validateIssue,
  validateReceived,
  validateReturn,
} from './lotLogic';

const err = (e) => new Error(`${e.title}: ${e.message}`);
const typedAmount = (v) => (v !== undefined && v !== null && String(v).trim() !== '' ? toNum(v) : null);
const unitRef = (unit) =>
  unit
    ? {
        id: unit.id,
        name: unitName(unit),
        phone: String(unit.phone ?? '').trim(),
        address: String(unit.address ?? '').trim(),
      }
    : null;

/** Everything the Processing screens need. */
export async function loadProcessingData() {
  const [lots, shortcuts, bankAccounts, stockMap, dyers, combingUnits] = await Promise.all([
    db.getAllProcessingLots(),
    db.getAllShortcuts(),
    db.getAllBankAccounts().catch(() => []),
    getStockQuantityMap(true),
    db.getAllDyers().catch(() => []),
    db.getAllProcessors().catch(() => []),
  ]);
  return {
    lots: lots || [],
    shortcuts: shortcuts || [],
    bankAccounts: bankAccounts || [],
    stockMap: stockMap || new Map(),
    dyers: dyers || [],
    combingUnits: combingUnits || [],
  };
}

/**
 * Grey kg that can be sent now: stock available (0 for a product that was never bought), plus what this lot already
 * took when it is being edited. `null` only when no product is chosen.
 */
export function availableGrey(stockMap, description, existingLot = null) {
  if (!String(description ?? '').trim()) return null;
  const stock = lookupStock(stockMap, description);
  let available = toNum(stock?.available);
  if (existingLot && String(existingLot.grey?.description ?? '').trim() === String(description).trim()) {
    available += toNum(existingLot.grey?.qty);
  }
  return Math.round(available * 1000) / 1000;
}

/**
 * Grey ROLLS in stock (same rules as availableGrey). null = not checked: no product chosen, or a product that has never
 * been counted in rolls (older stock is kg only — "0 rolls" would be a false warning).
 */
export function availableGreyRolls(stockMap, description, existingLot = null) {
  if (!String(description ?? '').trim()) return null;
  const stock = lookupStock(stockMap, description);
  if (stock && (stock.availableRolls === undefined || stock.hasRolls === false)) return null;
  let rolls = toNum(stock?.availableRolls);
  if (existingLot && String(existingLot.grey?.description ?? '').trim() === String(description).trim()) {
    rolls += toNum(existingLot.grey?.rolls);
  }
  return rolls;
}

/**
 * Stage 1 — create (or correct) my DC. `existing` = the stored lot when editing (later stages and payments are kept).
 * The grey value per kg is the product's average purchase cost at the time of issue.
 */
export async function saveIssue(
  form,
  { dyers, combingUnits, stockMap, catalogue, existing: given = null, lots = null },
) {
  // the stage fields are applied on the lot as stored NOW, so a payment / return added elsewhere is not lost
  const existing = given ? await freshLot(given) : null;
  let allLots = lots;
  if (!allLots) {
    try {
      allLots = await db.getAllProcessingLots();
    } catch {
      allLots = null; // cannot check the DC number offline: the other checks still run
    }
  }
  const problem = validateIssue(form, { catalogue, lots: allLots, existingId: existing?.id });
  if (problem) throw err(problem);
  const greyQty = toNum(form.greyQty);
  if (existing) {
    const t = lotTotals(existing);
    const needed = Math.round(((existing.dyeing ? t.dyedQty : 0) + t.dyeingReturnedQty) * 1000) / 1000;
    if (greyQty < needed) {
      throw err({
        title: 'Check the details',
        message: `The grey quantity cannot be less than ${needed} kg (already sent on to combing or returned by the dyeing unit).`,
      });
    }
  }
  const dyer = dyers.find((d) => d.id === form.dyerId);
  if (!dyer) throw err({ title: 'Missing Information', message: 'Please select the dyeing unit.' });
  const combingUnit = form.combingUnitId ? combingUnits.find((c) => c.id === form.combingUnitId) : null;
  // payments are tied to the unit they were made to: the unit cannot be swapped under them
  if (
    existing &&
    existing.dyer?.id &&
    existing.dyer.id !== dyer.id &&
    (existing.dyeingPayments ?? []).length
  ) {
    throw err({
      title: 'Cannot change the dyeing unit',
      message: `Payments have already been made to ${existing.dyer.name || 'the dyeing unit'} on this lot. Delete those payments first to change the unit.`,
    });
  }
  if (
    existing &&
    !existing.dyeing &&
    existing.combingUnit?.id &&
    (form.combingUnitId || '') !== existing.combingUnit.id &&
    (existing.combingPayments ?? []).length
  ) {
    throw err({
      title: 'Cannot change the combing unit',
      message: `Payments have already been made to ${existing.combingUnit.name || 'the combing unit'} on this lot. Delete those payments first to change the unit.`,
    });
  }
  const greyDescription = form.greyDescription.trim();
  const sameGrey = existing && String(existing.grey?.description ?? '').trim() === greyDescription;
  const stockRate = sameGrey
    ? toNum(existing.grey?.rate)
    : toNum(lookupStock(stockMap, greyDescription)?.avgPurchaseRate);
  // no priced purchase behind this grey: the rate typed on the form (if any) is the grey cost per kg
  const rate = stockRate > 0 ? stockRate : Math.max(0, toNum(form.greyRate));

  const lot = {
    ...(existing ?? {}),
    dcNo: formatDcNo(form.dcNo),
    dcDate: form.dcDate,
    status: existing?.status ?? LOT_STATUS.AT_DYEING,
    grey: { description: greyDescription, rolls: toNum(form.greyRolls), qty: greyQty, rate },
    finishedDescription: form.finishedDescription.trim(),
    dyer: unitRef(dyer),
    dyeingRate: toNum(form.dyeingRate),
    // a typed amount is kept as typed; otherwise the charge follows rate × kg processed (returns lower it)
    dyeingChargeTyped: typedAmount(form.dyeingCharge),
    dyeingCharge: stageCharge(form.dyeingRate, greyQty, form.dyeingCharge),
    // the combing unit can be named on my DC already; the dyeing unit's DC confirms it
    combingUnit: existing?.dyeing ? existing.combingUnit : unitRef(combingUnit),
    combingRate: existing?.dyeing ? existing.combingRate : toNum(form.combingRate),
    notes: String(form.notes ?? '').trim(),
    dyeing: existing?.dyeing ?? null,
    received: existing?.received ?? null,
    dyeingPayments: existing?.dyeingPayments ?? [],
    combingPayments: existing?.combingPayments ?? [],
    returns: existing?.returns ?? [],
  };
  const id = await db.saveProcessingLot(lot);
  invalidateStocksCache();
  return { ...lot, id };
}

/** Stage 2 — the dyeing unit's DC: dyed fabric sent on to the combing unit. */
export async function saveDyed(given, form, { combingUnits }) {
  const lot = await freshLot(given);
  const problem = validateDyed(form, lot);
  if (problem) throw err(problem);
  {
    const t = lotTotals(lot);
    const needed = Math.round(((lot.received ? t.finalQty : 0) + t.combingReturnedQty) * 1000) / 1000;
    if (toNum(form.qty) < needed) {
      throw err({
        title: 'Check the details',
        message: `The dyed quantity cannot be less than ${needed} kg (already received back or returned by the combing unit).`,
      });
    }
  }
  const combingUnit = combingUnits.find((c) => c.id === form.combingUnitId);
  if (!combingUnit) throw err({ title: 'Missing Information', message: 'Please select the combing unit.' });
  if (lot.combingUnit?.id && lot.combingUnit.id !== combingUnit.id && (lot.combingPayments ?? []).length) {
    throw err({
      title: 'Cannot change the combing unit',
      message: `Payments have already been made to ${lot.combingUnit.name || 'the combing unit'} on this lot. Delete those payments first to change the unit.`,
    });
  }
  const qty = toNum(form.qty);
  const updated = {
    ...lot,
    status: lot.status === LOT_STATUS.RECEIVED ? LOT_STATUS.RECEIVED : LOT_STATUS.AT_COMBING,
    dyeing: { dcNo: formatDcNo(form.dcNo), date: form.date, rolls: toNum(form.rolls), qty },
    combingUnit: unitRef(combingUnit),
    combingRate: toNum(form.combingRate),
    combingChargeTyped: typedAmount(form.combingCharge),
    combingCharge: stageCharge(form.combingRate, qty, form.combingCharge),
  };
  await db.saveProcessingLot(updated);
  invalidateStocksCache();
  return updated;
}

/** Stage 3 — the combing unit's DC: processed fabric received. The finished product enters stock now. */
export async function saveReceived(given, form) {
  const lot = await freshLot(given);
  const problem = validateReceived(form, lot);
  if (problem) throw err(problem);
  const updated = {
    ...lot,
    status: LOT_STATUS.RECEIVED,
    finishedDescription: String(form.finishedDescription ?? lot.finishedDescription).trim(),
    received: {
      dcNo: formatDcNo(form.dcNo),
      date: form.date,
      rolls: toNum(form.rolls),
      qty: toNum(form.qty),
    },
    receivedAt: lot.receivedAt ?? new Date().toISOString(),
  };
  await db.saveProcessingLot(updated);
  invalidateStocksCache();
  return updated;
}

/**
 * Step back one stage (a DC entered by mistake): Received -> At Combing (finished stock removed again), or
 * At Combing -> At Dyeing (the dyeing unit's DC cleared). Payments are kept.
 */
export async function undoLastStage(given) {
  const lot = await freshLot(given);
  let updated;
  if (lot.status === LOT_STATUS.RECEIVED) {
    updated = { ...lot, status: LOT_STATUS.AT_COMBING, received: null, receivedAt: null };
  } else if (lot.status === LOT_STATUS.AT_COMBING) {
    if (lotReturns(lot, 'combing').length) {
      throw new Error('Delete the returns from the combing unit first (Return History).');
    }
    updated = {
      ...lot,
      status: LOT_STATUS.AT_DYEING,
      dyeing: null,
      combingCharge: null,
      combingChargeTyped: null,
    };
  } else {
    return lot;
  }
  await db.saveProcessingLot(updated);
  invalidateStocksCache();
  return updated;
}

/** Deletes a lot (its grey goes back to stock) and the finance entries of its payments. */
export async function deleteLot(lot) {
  // Finance entries go FIRST and a failure stops here: Finance refuses to undo `lot_pay_*` entries, so deleting the lot
  // first and then failing on an entry would leave an orphan nobody can remove. This way a failure leaves the lot (and
  // its payments) intact and the delete can simply be retried.
  const fresh = await freshLot(lot);
  for (const p of [...(fresh.dyeingPayments ?? []), ...(fresh.combingPayments ?? [])]) {
    await db.deleteAccountTransaction(p.id);
  }
  db.invalidate('account_transactions');
  await db.deleteProcessingLot(lot.id);
  invalidateStocksCache();
  db.invalidate('account_transactions');
}

/**
 * A return: fabric the dyeing (`from: 'dyeing'`) or combing (`from: 'combing'`) unit sent back unprocessed. It goes
 * back into stock under `description` (grey fabric from the dyeing unit by default), and that unit's charge and the
 * lot's loss follow what it actually processed.
 */
/**
 * The lot as stored NOW: payments / returns are added to and removed from the latest version, never from the copy a
 * screen loaded earlier (that copy may predate another payment or delete and would bring it back). Falls back to the
 * given lot when it cannot be read (offline / not saved yet).
 */
async function freshLot(lot) {
  if (!lot?.id) return lot;
  try {
    const stored = await db.getProcessingLot(lot.id);
    return stored ? { ...stored, id: lot.id } : lot;
  } catch {
    return lot;
  }
}

export async function addLotReturn(given, form) {
  const lot = await freshLot(given);
  const problem = validateReturn(form, lot);
  if (problem) throw err(problem);
  const record = {
    id: `lot_ret_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    from: form.from,
    date: form.date || todayISO(),
    dcNo: formatDcNo(form.dcNo),
    rolls: toNum(form.rolls),
    qty: toNum(form.qty),
    description: String(form.description).trim(),
    notes: String(form.notes ?? '').trim(),
    createdAt: new Date().toISOString(),
  };
  const updated = { ...lot, returns: [...(lot.returns ?? []), record] };
  await db.saveProcessingLot(updated);
  invalidateStocksCache();
  return updated;
}

/**
 * Deletes a return (a wrong entry): that fabric leaves stock again and the unit is charged for it as processed.
 * Always possible — it only gives the unit more fabric than before.
 */
export async function deleteLotReturn(given, returnId) {
  const lot = await freshLot(given);
  if (!(lot.returns ?? []).some((r) => r.id === returnId)) return lot;
  const updated = { ...lot, returns: lot.returns.filter((r) => r.id !== returnId) };
  await db.saveProcessingLot(updated);
  invalidateStocksCache();
  return updated;
}

const PAYMENT_KEY = { dyeing: 'dyeingPayments', combing: 'combingPayments' };
const PAYMENT_CATEGORY = { dyeing: 'Dyeing Payment', combing: 'Combing Payment' };

/**
 * Pays the dyeing (`role: 'dyeing'`) or combing (`role: 'combing'`) unit of a lot. `payment` = { amount, date,
 * method: 'cash'|'account', bankAccountId, bankAccountName, reference }.
 */
export async function addLotPayment(given, role, payment) {
  const amount = Math.round(toNum(payment.amount) * 100) / 100;
  if (!(amount > 0)) throw new Error('Please enter a payment amount greater than zero.');
  const account = payment.method === 'account';
  if (account && !payment.bankAccountId)
    throw new Error('Please select the bank account the payment is made from.');
  const lot = await freshLot(given);
  const unit = role === 'dyeing' ? lot.dyer : lot.combingUnit;
  if (!unit) throw new Error('This lot has no combing unit yet.');
  const id = `lot_pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    id,
    date: payment.date || todayISO(),
    amount,
    mode: account ? 'Account' : 'Cash',
    bankAccountId: account ? payment.bankAccountId : null,
    bankAccountName: account ? payment.bankAccountName || '' : '',
    reference: String(payment.reference ?? '').trim(),
    createdAt: new Date().toISOString(),
  };
  const key = PAYMENT_KEY[role];
  const updated = { ...lot, [key]: [...(lot[key] ?? []), record] };
  await db.saveProcessingLot(updated);
  try {
    await db.saveAccountTransaction({
      id,
      date: record.date,
      type: 'expense',
      category: PAYMENT_CATEGORY[role],
      amount,
      fromAccount: account ? payment.bankAccountId : 'cash',
      bankAccountId: record.bankAccountId,
      notes: `Lot ${formatDcNo(lot.dcNo)} (${unit.name})${record.reference ? ` - Ref: ${record.reference}` : ''}`,
    });
  } catch (e) {
    // the finance entry failed: take the payment back off the lot so a retry does not add it twice
    try {
      await db.saveProcessingLot(lot);
    } catch (restoreError) {
      console.warn('Could not restore the lot after a failed payment:', restoreError);
    }
    throw e;
  }
  db.invalidate('account_transactions');
  return updated;
}

/** Removes a lot payment and its finance entry. */
export async function deleteLotPayment(given, role, paymentId) {
  const lot = await freshLot(given);
  const key = PAYMENT_KEY[role];
  const updated = { ...lot, [key]: (lot[key] ?? []).filter((p) => p.id !== paymentId) };
  // finance entry first: if it fails nothing changed and the delete can be retried; the other way round would leave a
  // finance entry no screen can remove (Finance blocks Undo on lot payments)
  await db.deleteAccountTransaction(paymentId);
  db.invalidate('account_transactions');
  await db.saveProcessingLot(updated);
  return updated;
}

/** Totals shown on the lists (re-exported for the screens). */
export { lotTotals };
