/**
 * In-house processing (job work): one PROCESSING LOT follows the fabric through every stage, so nothing is typed twice.
 *
 *   1. ISSUE      — my DC: grey fabric leaves my stock (rolls + kg) for the dyeing unit; the finished product name is
 *                   fixed here. Grey stock goes down on the DC date.
 *   2. DYED       — the dyeing unit's DC: what it dyed and sent straight on to the combing unit (rolls + kg).
 *   3. RECEIVED   — the combing unit's DC: the processed fabric back with me (final rolls + kg). Only now does the
 *                   finished product enter stock, at its real cost per kg.
 *
 * RETURNS: a unit can send back fabric it did not process (rejected / excess). It goes back into my stock (grey
 * fabric from the dyeing unit; the dyed fabric from the combing unit under the product I pick), and the unit is only
 * charged for — and loss is only counted on — what it actually processed.
 *
 * Weight loss = kg processed − kg passed on at each stage (dyeing, combing) and overall.
 * Charges: rate per kg on the kg each unit PROCESSED (dyeing: kg issued − its returns, combing: kg the dyer sent on −
 * its returns); the amount can be typed by hand instead. Cost of the finished fabric = grey value + dyeing charge +
 * combing charge − value of the fabric returned to stock.
 *
 * Pure functions only (no Firestore, no React).
 */
import { toNum } from '@/core/format';

export const LOT_STATUS = {
  AT_DYEING: 'AT_DYEING',
  AT_COMBING: 'AT_COMBING',
  RECEIVED: 'RECEIVED',
};

export const LOT_STAGE_LABEL = {
  AT_DYEING: 'At Dyeing',
  AT_COMBING: 'At Combing',
  RECEIVED: 'Received',
};

const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100 || 0;
const round3 = (n) => Math.round((toNum(n) + Number.EPSILON) * 1000) / 1000 || 0;
const pct = (part, whole) => (whole > 0 ? round2((part / whole) * 100) : 0);

/** Name of a dyeing unit / combing unit record (both directories use slightly different field names). */
export const unitName = (unit) => String(unit?.dyeingName ?? unit?.processorName ?? unit?.name ?? '').trim();

/** A blank lot for the Issue form. */
export function emptyLot(today) {
  return {
    dcNo: '',
    dcDate: today,
    greyDescription: '',
    greyRolls: '',
    greyQty: '',
    finishedDescription: '',
    dyerId: '',
    dyeingRate: '',
    combingUnitId: '',
    combingRate: '',
    notes: '',
  };
}

/** Next DC number of my own DCs: "DC-001", "DC-002", … (highest existing + 1; other formats are ignored). */
export function suggestNextDcNo(lots = []) {
  let max = 0;
  lots.forEach((l) => {
    const m = String(l.dcNo ?? '').match(/(\d+)\s*$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `DC-${String(max + 1).padStart(3, '0')}`;
}

/** The number typed after the fixed "DC-" ("DC-012" / "dc 12" / "12" -> "012" / "12" / "12"). */
export function dcNumberPart(dcNo) {
  return String(dcNo ?? '')
    .trim()
    .replace(/^dc\s*[-.:#/]?\s*/i, '');
}

/** Every DC number (mine and the units') is shown and saved as "DC-<number>"; '' when no number. */
export function formatDcNo(dcNo) {
  const part = dcNumberPart(dcNo);
  return part ? `DC-${part}` : '';
}

/** Charge for a stage: the typed amount when one was entered, else rate × kg. */
export function stageCharge(rate, qty, typedAmount) {
  if (typedAmount !== undefined && typedAmount !== null && String(typedAmount).trim() !== '')
    return round2(typedAmount);
  return round2(toNum(rate) * toNum(qty));
}

const sumPayments = (payments) => round2((payments || []).reduce((s, p) => s + toNum(p.amount), 0));
const typed = (v) => v !== undefined && v !== null && String(v).trim() !== '';

/** Returns of a lot from one unit ('dyeing' | 'combing'). */
export const lotReturns = (lot, from) => (lot?.returns ?? []).filter((r) => r.from === from);
const sumQty = (list) => round3(list.reduce((s, r) => s + toNum(r.qty), 0));

/**
 * A unit's charge: the amount typed by hand when there is one, else rate × kg the unit processed. Lots saved before
 * charges followed returns only stored `dyeingCharge` / `combingCharge`; without a rate that stored amount is used.
 */
function unitCharge(typedAmount, rate, processedQty, stored) {
  if (typed(typedAmount)) return round2(typedAmount);
  if (toNum(rate) > 0) return round2(toNum(rate) * processedQty);
  return round2(stored);
}

/**
 * Everything derived from a lot: quantities at each stage, returns, weight loss, charges, cost and what is owed to
 * each unit.
 */
export function lotTotals(lot) {
  const greyQty = round3(lot.grey?.qty);
  const greyRolls = toNum(lot.grey?.rolls);
  const dyed = lot.dyeing ?? null;
  const received = lot.received ?? null;
  const dyedQty = dyed ? round3(dyed.qty) : 0;
  const finalQty = received ? round3(received.qty) : 0;

  const dyeingReturnedQty = sumQty(lotReturns(lot, 'dyeing'));
  const combingReturnedQty = sumQty(lotReturns(lot, 'combing'));
  const dyerProcessedQty = round3(greyQty - dyeingReturnedQty);
  const comberProcessedQty = dyed ? round3(dyedQty - combingReturnedQty) : 0;

  const dyeingLossQty = dyed ? round3(dyerProcessedQty - dyedQty) : 0;
  const combingLossQty = dyed && received ? round3(comberProcessedQty - finalQty) : 0;
  const totalLossQty = received ? round3(dyeingLossQty + combingLossQty) : 0;

  const greyRate = toNum(lot.grey?.rate);
  const greyValue = round2(greyQty * greyRate);
  const dyeingCharge = unitCharge(lot.dyeingChargeTyped, lot.dyeingRate, dyerProcessedQty, lot.dyeingCharge);
  const combingCharge = dyed
    ? unitCharge(lot.combingChargeTyped, lot.combingRate, comberProcessedQty, lot.combingCharge)
    : 0;
  // what returned fabric is worth when it goes back to stock: grey at the grey rate, dyed fabric at its cost so far
  const dyedUnitCost =
    dyedQty > 0 ? round2((greyRate * dyerProcessedQty + dyeingCharge) / dyedQty) : greyRate;
  const returnedValue = round2(dyeingReturnedQty * greyRate + combingReturnedQty * dyedUnitCost);
  const totalCost = round2(greyValue + dyeingCharge + combingCharge - returnedValue);
  const unitCost = finalQty > 0 ? round2(totalCost / finalQty) : 0;

  const dyeingPaid = sumPayments(lot.dyeingPayments);
  const combingPaid = sumPayments(lot.combingPayments);
  return {
    greyQty,
    greyRolls,
    dyedQty,
    dyedRolls: dyed ? toNum(dyed.rolls) : 0,
    finalQty,
    finalRolls: received ? toNum(received.rolls) : 0,
    dyeingReturnedQty,
    combingReturnedQty,
    dyerProcessedQty,
    comberProcessedQty,
    dyeingLossQty,
    dyeingLossPct: dyed ? pct(dyeingLossQty, dyerProcessedQty) : 0,
    combingLossQty,
    combingLossPct: dyed && received ? pct(combingLossQty, comberProcessedQty) : 0,
    totalLossQty,
    totalLossPct: received ? pct(totalLossQty, round3(totalLossQty + finalQty)) : 0,
    greyValue,
    dyeingCharge,
    combingCharge,
    dyedUnitCost,
    returnedValue,
    totalCost,
    unitCost,
    dyeingPaid,
    combingPaid,
    dyeingDue: round2(dyeingCharge - dyeingPaid),
    combingDue: dyed ? round2(combingCharge - combingPaid) : round2(-combingPaid),
  };
}

/** Kg of a lot that can still be returned by a unit (what it holds and has not passed on yet). */
export function returnableQty(lot, from) {
  const t = lotTotals(lot);
  if (from === 'dyeing') return round3(t.dyerProcessedQty - (lot.dyeing ? t.dyedQty : 0));
  if (!lot.dyeing) return 0;
  return round3(t.comberProcessedQty - (lot.received ? t.finalQty : 0));
}

const missing = (message) => ({ title: 'Missing Information', message });
const invalid = (message) => ({ title: 'Check the details', message });

/**
 * Stage 1 (my DC). `catalogue` = product shortcuts (products must come from it so they can be sold / stocked under
 * the same name); `availableGrey` = kg of that grey product in stock (null = unknown, not checked here).
 */
export function validateIssue(form, { catalogue = null } = {}) {
  if (!String(form.dcNo ?? '').trim()) return missing('Please enter the DC number.');
  if (!form.dcDate) return missing('Please select the DC date.');
  if (!String(form.greyDescription ?? '').trim()) return missing('Please select the grey fabric being sent.');
  if (!(toNum(form.greyQty) > 0)) return missing('Please enter the quantity (kg) being sent for dyeing.');
  if (toNum(form.greyRolls) < 0) return invalid('Roll count cannot be negative.');
  if (!String(form.finishedDescription ?? '').trim())
    return missing('Please enter the finished product name (what this fabric becomes).');
  if (!form.dyerId) return missing('Please select the dyeing unit.');
  if (toNum(form.dyeingRate) < 0) return invalid('Dyeing rate cannot be negative.');
  if (catalogue) {
    const known = new Set(
      catalogue.map((s) =>
        String(s.fullDescription ?? '')
          .trim()
          .toLowerCase(),
      ),
    );
    if (!known.has(form.greyDescription.trim().toLowerCase()))
      return invalid('Choose the grey fabric from the product list (Product Shortcuts).');
    if (!known.has(form.finishedDescription.trim().toLowerCase()))
      return invalid(
        'Choose the finished product from the product list, or add it in Product Shortcuts first.',
      );
  }
  return null;
}

/** Stage 2 (dyeing unit's DC, fabric sent on to combing). */
export function validateDyed(form, lot) {
  if (!String(form.dcNo ?? '').trim()) return missing("Please enter the dyeing unit's DC number.");
  if (!form.date) return missing("Please select the dyeing unit's DC date.");
  if (!(toNum(form.qty) > 0)) return missing('Please enter the quantity (kg) sent to combing.');
  if (toNum(form.qty) > lotTotals(lot).dyerProcessedQty)
    return invalid(
      'The dyed quantity cannot be more than the grey quantity issued (less what the dyeing unit returned).',
    );
  if (toNum(form.rolls) < 0) return invalid('Roll count cannot be negative.');
  if (!form.combingUnitId) return missing('Please select the combing unit the fabric went to.');
  if (toNum(form.combingRate) < 0) return invalid('Combing rate cannot be negative.');
  return null;
}

/** Stage 3 (combing unit's DC, processed fabric received by me). */
export function validateReceived(form, lot) {
  if (!String(form.dcNo ?? '').trim()) return missing("Please enter the combing unit's DC number.");
  if (!form.date) return missing('Please select the date the fabric was received.');
  if (!(toNum(form.qty) > 0)) return missing('Please enter the final quantity (kg) received.');
  if (toNum(form.qty) > (lot?.dyeing ? lotTotals(lot).comberProcessedQty : 0))
    return invalid(
      'The received quantity cannot be more than the quantity sent to combing (less what the combing unit returned).',
    );
  if (toNum(form.rolls) < 0) return invalid('Roll count cannot be negative.');
  if (!String(form.finishedDescription ?? lot?.finishedDescription ?? '').trim())
    return missing('Please enter the finished product name.');
  return null;
}

/** A return: fabric a unit sends back unprocessed. `form` = { from, date, dcNo, rolls, qty, description }. */
export function validateReturn(form, lot) {
  if (form.from !== 'dyeing' && form.from !== 'combing')
    return missing('Please choose which unit returned the fabric.');
  if (form.from === 'combing' && !lot?.dyeing)
    return invalid("The fabric has not reached the combing unit yet (enter the dyeing unit's DC first).");
  if (!form.date) return missing('Please select the return date.');
  if (!(toNum(form.qty) > 0)) return missing('Please enter the quantity (kg) returned.');
  if (toNum(form.rolls) < 0) return invalid('Roll count cannot be negative.');
  const limit = returnableQty(lot, form.from);
  if (toNum(form.qty) > limit)
    return invalid(
      `The ${form.from === 'dyeing' ? 'dyeing' : 'combing'} unit holds only ${limit} kg of this lot that it has not passed on.`,
    );
  if (!String(form.description ?? '').trim())
    return missing('Please choose the product the returned fabric goes into stock as.');
  return null;
}

/** Search across DC numbers, products and unit names. */
export function filterLots(lots = [], query = '') {
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!q) return lots;
  return lots.filter((l) =>
    [
      formatDcNo(l.dcNo),
      formatDcNo(l.dyeing?.dcNo),
      formatDcNo(l.received?.dcNo),
      l.grey?.description,
      l.finishedDescription,
      l.dyer?.name,
      l.combingUnit?.name,
    ].some((v) =>
      String(v ?? '')
        .toLowerCase()
        .includes(q),
    ),
  );
}

/** Newest DC first. */
export const sortLotsNewestFirst = (lots) =>
  [...lots].sort(
    (a, b) =>
      String(b.dcDate ?? '').localeCompare(String(a.dcDate ?? '')) ||
      String(b.dcNo ?? '').localeCompare(String(a.dcNo ?? ''), 'en', { numeric: true }),
  );

/**
 * Stock movements of a lot: the grey issue (out, on the DC date, at the grey rate), every return (in, on its date, at
 * the value of what came back) and — only once RECEIVED — the finished fabric (in, at the lot's cost per kg).
 */
export function lotStockMovements(lot) {
  const moves = [];
  const t = lotTotals(lot);
  const grey = String(lot.grey?.description ?? '').trim();
  if (grey && t.greyQty > 0) {
    moves.push({
      kind: 'issue',
      description: grey,
      qty: t.greyQty,
      rolls: t.greyRolls,
      rate: toNum(lot.grey?.rate),
      date: lot.dcDate ?? '',
      party: `${lot.dyer?.name || 'Dyeing unit'} (Processing issue)`,
      ref: formatDcNo(lot.dcNo) || 'DC',
      rawRef: String(lot.dcNo ?? ''),
    });
  }
  (lot.returns ?? []).forEach((r) => {
    const description = String(r.description ?? '').trim();
    const qty = round3(r.qty);
    if (!description || !(qty > 0)) return;
    const unit = r.from === 'combing' ? lot.combingUnit : lot.dyer;
    moves.push({
      kind: 'return',
      description,
      qty,
      rolls: toNum(r.rolls),
      rate: r.from === 'combing' ? t.dyedUnitCost : toNum(lot.grey?.rate),
      date: r.date ?? '',
      party: `${unit?.name || (r.from === 'combing' ? 'Combing unit' : 'Dyeing unit')} (Processing return)`,
      ref: formatDcNo(lot.dcNo) || 'DC',
      rawRef: String(lot.dcNo ?? ''),
    });
  });
  const finished = String(lot.finishedDescription ?? '').trim();
  if (lot.status === LOT_STATUS.RECEIVED && finished && t.finalQty > 0) {
    moves.push({
      kind: 'receipt',
      description: finished,
      qty: t.finalQty,
      rolls: t.finalRolls,
      rate: t.unitCost,
      date: lot.received?.date ?? lot.dcDate ?? '',
      party: `${lot.combingUnit?.name || 'Combing unit'} (Processed receipt)`,
      ref: formatDcNo(lot.dcNo) || 'DC',
      rawRef: String(lot.dcNo ?? ''),
    });
  }
  return moves;
}

/**
 * What I owe a dyeing / combing unit across all lots: charges, paid, due, and the lots involved.
 * `role` = 'dyeing' | 'combing'; the unit is matched by its id.
 */
export function unitLotAccount(lots = [], unitId, role) {
  let charges = 0;
  let paid = 0;
  const involved = [];
  lots.forEach((lot) => {
    const ref = role === 'dyeing' ? lot.dyer : lot.combingUnit;
    if (!ref || ref.id !== unitId) return;
    const t = lotTotals(lot);
    if (role === 'dyeing') {
      charges += t.dyeingCharge;
      paid += t.dyeingPaid;
    } else {
      charges += t.combingCharge;
      paid += t.combingPaid;
    }
    involved.push(lot);
  });
  return { charges: round2(charges), paid: round2(paid), due: round2(charges - paid), lots: involved };
}

/**
 * Where a lot stands for ONE unit ('dyeing' | 'combing'), so each unit's page shows its own process only:
 * `active` = the fabric is at this unit now. `tone` is display-only and follows the app-wide status colours
 * (ui/status.js: in dyeing / in combing = info, coming = warning, done = success).
 */
export function unitLotStatus(lot, role) {
  if (role === 'dyeing') {
    if (lot.status === LOT_STATUS.AT_DYEING) return { label: 'In dyeing', tone: 'info', active: true };
    return {
      label: lot.status === LOT_STATUS.RECEIVED ? 'Done · lot received' : 'Done · sent to combing',
      tone: 'success',
      active: false,
    };
  }
  if (lot.status === LOT_STATUS.AT_DYEING)
    return { label: 'Coming from dyeing', tone: 'warning', active: false };
  if (lot.status === LOT_STATUS.AT_COMBING) return { label: 'In combing', tone: 'info', active: true };
  return { label: 'Done · received back', tone: 'success', active: false };
}
