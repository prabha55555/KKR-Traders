import { db } from '@/core/db';
import { buildAvgCostLookup } from '@/features/overview/revenue/revenueLogic';
import { computeStocks } from '@/features/overview/stocks/stocksLogic';
import {
  LOT_STATUS,
  filterLots,
  lotStockMovements,
  lotTotals,
  returnableQty,
  stageCharge,
  suggestNextDcNo,
  dcNumberPart,
  formatDcNo,
  unitLotAccount,
  validateDyed,
  validateIssue,
  validateReceived,
  validateReturn,
} from '@/features/processing/lotLogic';
import {
  addLotPayment,
  addLotReturn,
  deleteLotReturn,
  availableGrey,
  availableGreyRolls,
  deleteLot,
  deleteLotPayment,
  saveDyed,
  saveIssue,
  saveReceived,
  undoLastStage,
} from '@/features/processing/processingService';

/**
 * Processing lot: 100 kg grey bought; 50 kg sent for dyeing on my DC; the dyer sends 47 kg on to combing; 45 kg
 * comes back. Stock: grey −50 at issue; the finished product +45 only when received, at the lot's cost per kg.
 */
const dyer = { id: 'dyer_1', dyeingName: 'Sri Dyes', phone: '9000000001', address: 'Tirupur' };
const comber = { id: 'proc_1', processorName: 'Kumar Combing', phone: '9000000002', address: 'Palladam' };
const catalogue = [{ fullDescription: 'Grey 30s' }, { fullDescription: 'Navy Combed 30s' }];
const issueForm = {
  dcNo: 'DC-001',
  dcDate: '2026-10-01',
  greyDescription: 'Grey 30s',
  greyRolls: '10',
  greyQty: '50',
  finishedDescription: 'Navy Combed 30s',
  dyerId: 'dyer_1',
  dyeingRate: '20',
  combingUnitId: '',
  combingRate: '',
  notes: '',
};
const lotAt = (stage) => {
  const lot = {
    id: 'lot_1',
    dcNo: 'DC-001',
    dcDate: '2026-10-01',
    status: LOT_STATUS.AT_DYEING,
    grey: { description: 'Grey 30s', rolls: 10, qty: 50, rate: 100 },
    finishedDescription: 'Navy Combed 30s',
    dyer: { id: 'dyer_1', name: 'Sri Dyes' },
    dyeingRate: 20,
    dyeingCharge: 1000,
    combingUnit: null,
    dyeing: null,
    received: null,
    dyeingPayments: [],
    combingPayments: [],
  };
  if (stage === 'dyed' || stage === 'received') {
    Object.assign(lot, {
      status: LOT_STATUS.AT_COMBING,
      dyeing: { dcNo: 'SD-77', date: '2026-10-05', rolls: 10, qty: 47 },
      combingUnit: { id: 'proc_1', name: 'Kumar Combing' },
      combingRate: 10,
      combingCharge: 470,
    });
  }
  if (stage === 'received') {
    Object.assign(lot, {
      status: LOT_STATUS.RECEIVED,
      received: { dcNo: 'KC-12', date: '2026-10-09', rolls: 9, qty: 45 },
    });
  }
  return lot;
};
afterEach(() => jest.restoreAllMocks());

describe('lot totals: weight loss, charges, cost per kg, dues', () => {
  test('received lot', () => {
    const t = lotTotals({
      ...lotAt('received'),
      dyeingPayments: [{ amount: 600 }],
      combingPayments: [{ amount: 470 }],
    });
    expect(t).toMatchObject({
      greyQty: 50,
      dyedQty: 47,
      finalQty: 45,
      dyeingLossQty: 3,
      dyeingLossPct: 6,
      combingLossQty: 2,
      combingLossPct: 4.26,
      totalLossQty: 5,
      totalLossPct: 10,
      greyValue: 5000,
      dyeingCharge: 1000,
      combingCharge: 470,
      totalCost: 6470,
      unitCost: 143.78,
      dyeingDue: 400,
      combingDue: 0,
    });
  });
  test('charges: rate × kg the unit received, unless an amount was typed', () => {
    expect(stageCharge(20, 50)).toBe(1000);
    expect(stageCharge(20, 50, '950')).toBe(950);
    expect(stageCharge(20, 50, '')).toBe(1000);
  });
  test('a lot still at dyeing has no loss or combing charge yet', () => {
    expect(lotTotals(lotAt('issued'))).toMatchObject({ totalLossQty: 0, combingCharge: 0, finalQty: 0 });
  });
});

describe('stock movements', () => {
  test('grey leaves stock at issue; finished enters only once received, at cost per kg', () => {
    expect(lotStockMovements(lotAt('dyed')).map((m) => [m.kind, m.description, m.qty])).toEqual([
      ['issue', 'Grey 30s', 50],
    ]);
    const moves = lotStockMovements(lotAt('received'));
    expect(moves.map((m) => [m.kind, m.description, m.qty, m.rate])).toEqual([
      ['issue', 'Grey 30s', 50, 100],
      ['receipt', 'Navy Combed 30s', 45, 143.78],
    ]);
  });
  test('stock page: 100 kg bought, 50 sent -> 50 grey left; finished 45 only after receipt', () => {
    const purchase = {
      invoiceNo: 'P1',
      invoiceDate: '2026-09-20',
      supplierName: 'Mill',
      products: [{ description: 'Grey 30s', qty: 100, rate: 100, amount: 10000 }],
    };
    const atCombing = computeStocks([purchase], [], [], [], [], [], [], [], [lotAt('dyed')]);
    const row = (out, d) => out.rows.find((r) => r.description === d);
    expect(row(atCombing, 'Grey 30s').available).toBe(50);
    expect(row(atCombing, 'Navy Combed 30s')).toBeUndefined();

    const done = computeStocks([purchase], [], [], [], [], [], [], [], [lotAt('received')]);
    expect(row(done, 'Grey 30s').available).toBe(50);
    expect(row(done, 'Navy Combed 30s')).toMatchObject({ available: 45, avgPurchaseRate: 143.78 });
  });
  test('revenue profit uses the finished cost per kg', () => {
    const cost = buildAvgCostLookup([], [], [], [lotAt('received')]);
    expect(cost('NAVY COMBED 30S')).toBeCloseTo(143.78, 2);
  });
});

describe('validation', () => {
  test('issue', () => {
    expect(validateIssue(issueForm, { catalogue })).toBeNull();
    expect(validateIssue({ ...issueForm, greyQty: '0' })?.message).toMatch(/quantity/);
    expect(validateIssue({ ...issueForm, finishedDescription: '' })?.message).toMatch(/finished product/);
    expect(validateIssue({ ...issueForm, dyerId: '' })?.message).toMatch(/dyeing unit/);
    expect(validateIssue({ ...issueForm, finishedDescription: 'Unknown' }, { catalogue })?.message).toMatch(
      /Product Shortcuts/,
    );
  });
  test('dyed and received cannot exceed what came in', () => {
    const dyed = { dcNo: 'SD-1', date: '2026-10-05', rolls: '10', qty: '51', combingUnitId: 'proc_1' };
    expect(validateDyed(dyed, lotAt('issued'))?.message).toMatch(/more than the grey/);
    expect(validateDyed({ ...dyed, qty: '47' }, lotAt('issued'))).toBeNull();
    expect(validateDyed({ ...dyed, qty: '47', combingUnitId: '' }, lotAt('issued'))?.message).toMatch(
      /combing unit/,
    );
    const rec = { dcNo: 'KC-1', date: '2026-10-09', rolls: '9', qty: '48' };
    expect(validateReceived(rec, lotAt('dyed'))?.message).toMatch(/more than the quantity sent/);
    expect(validateReceived({ ...rec, qty: '45' }, lotAt('dyed'))).toBeNull();
  });
});

describe('returns (fabric a unit sends back unprocessed)', () => {
  const withReturns = (stage, returns) => ({ ...lotAt(stage), returns });
  test('a dyeing-unit return lowers its charge and is not counted as loss', () => {
    const lot = withReturns('received', [
      { id: 'r1', from: 'dyeing', qty: 5, description: 'Grey 30s', date: '2026-10-04' },
    ]);
    const t = lotTotals(lot);
    // dyer processed 45 kg -> 47 cannot be dyed from it, so use a consistent lot below
    expect(t).toMatchObject({ dyeingReturnedQty: 5, dyerProcessedQty: 45, dyeingCharge: 900 });
  });
  test('numbers of a lot with returns from both units', () => {
    // 50 kg grey issued; dyer returns 5 kg grey, dyes 43 kg (loss 2); comber returns 3 kg dyed, gives back 38 kg
    const lot = {
      ...lotAt('received'),
      dyeing: { dcNo: 'SD-77', date: '2026-10-05', rolls: 9, qty: 43 },
      received: { dcNo: 'KC-12', date: '2026-10-09', rolls: 8, qty: 38 },
      returns: [
        { id: 'r1', from: 'dyeing', qty: 5, description: 'Grey 30s', date: '2026-10-04' },
        { id: 'r2', from: 'combing', qty: 3, description: 'Navy Dyed 30s', date: '2026-10-07' },
      ],
    };
    const t = lotTotals(lot);
    expect(t).toMatchObject({
      dyerProcessedQty: 45,
      comberProcessedQty: 40,
      dyeingLossQty: 2,
      combingLossQty: 2,
      totalLossQty: 4,
      totalLossPct: 9.52,
      dyeingCharge: 900, // 20 × 45
      combingCharge: 400, // 10 × 40
    });
    // grey value 5000 + 900 + 400 − returned (5 kg × 100 + 3 kg × dyed cost (4500 + 900) / 43 = 125.58)
    expect(t.dyedUnitCost).toBe(125.58);
    expect(t.returnedValue).toBe(876.74);
    expect(t.totalCost).toBe(5423.26);
    expect(t.unitCost).toBe(142.72);
    const moves = lotStockMovements(lot).map((m) => [m.kind, m.description, m.qty]);
    expect(moves).toEqual([
      ['issue', 'Grey 30s', 50],
      ['return', 'Grey 30s', 5],
      ['return', 'Navy Dyed 30s', 3],
      ['receipt', 'Navy Combed 30s', 38],
    ]);
  });
  test('a typed charge stays as typed', () => {
    const lot = withReturns('issued', [{ id: 'r1', from: 'dyeing', qty: 5, description: 'Grey 30s' }]);
    expect(lotTotals({ ...lot, dyeingChargeTyped: 950 }).dyeingCharge).toBe(950);
  });
  test('validation: only what the unit still holds can be returned; combing only after the dyeing DC', () => {
    const base = { from: 'dyeing', date: '2026-10-04', rolls: '', qty: '5', description: 'Grey 30s' };
    expect(validateReturn(base, lotAt('issued'))).toBeNull();
    expect(validateReturn({ ...base, qty: '51' }, lotAt('issued'))?.message).toMatch(/holds only 50 kg/);
    expect(validateReturn({ ...base, from: 'combing' }, lotAt('issued'))?.message).toMatch(
      /not reached the combing/,
    );
    expect(validateReturn({ ...base, from: 'combing', qty: '47' }, lotAt('dyed'))).toBeNull();
    expect(validateReturn({ ...base, description: '' }, lotAt('issued'))?.message).toMatch(/product/);
    expect(returnableQty(lotAt('dyed'), 'dyeing')).toBe(3);
  });
  test('dyed / received quantities respect what was returned', () => {
    const lot = withReturns('issued', [{ id: 'r1', from: 'dyeing', qty: 5, description: 'Grey 30s' }]);
    const dyed = { dcNo: 'SD-1', date: '2026-10-05', rolls: '10', qty: '46', combingUnitId: 'proc_1' };
    expect(validateDyed(dyed, lot)?.message).toMatch(/less what the dyeing unit returned/);
    expect(validateDyed({ ...dyed, qty: '45' }, lot)).toBeNull();
  });
});

describe('return service', () => {
  test('add and delete a return', async () => {
    jest.spyOn(db, 'saveProcessingLot').mockImplementation(async (l) => l.id);
    const lot = await addLotReturn(lotAt('issued'), {
      from: 'dyeing',
      date: '2026-10-04',
      qty: '5',
      rolls: '1',
      description: 'Grey 30s',
    });
    expect(lot.returns).toHaveLength(1);
    expect((await deleteLotReturn(lot, lot.returns[0].id)).returns).toEqual([]);
  });
  test('undoing the dyeing DC is refused while the combing unit has returns', async () => {
    jest.spyOn(db, 'saveProcessingLot').mockResolvedValue('x');
    const lot = { ...lotAt('dyed'), returns: [{ id: 'r', from: 'combing', qty: 2, description: 'X' }] };
    await expect(undoLastStage(lot)).rejects.toThrow(/returns from the combing unit/);
  });
});

describe('helpers', () => {
  test('next DC number, search, unit accounts', () => {
    expect(suggestNextDcNo([])).toBe('DC-001');
    expect(suggestNextDcNo([{ dcNo: 'DC-009' }, { dcNo: 'X' }])).toBe('DC-010');
    // every DC (mine and the units') is "DC-<number>"; the box holds only the number
    expect(formatDcNo('77')).toBe('DC-77');
    expect(formatDcNo('DC-001')).toBe('DC-001');
    expect(formatDcNo(' dc 12 ')).toBe('DC-12');
    expect(formatDcNo('DC-')).toBe('');
    expect(formatDcNo(undefined)).toBe('');
    expect(dcNumberPart('DC-001')).toBe('001');
    const lots = [
      lotAt('received'),
      { ...lotAt('issued'), id: 'lot_2', dcNo: 'DC-002', dyeingPayments: [{ amount: 300 }] },
    ];
    expect(filterLots(lots, 'kc-12').map((l) => l.dcNo)).toEqual(['DC-001']);
    expect(filterLots(lots, 'sri dyes')).toHaveLength(2);
    expect(unitLotAccount(lots, 'dyer_1', 'dyeing')).toMatchObject({ charges: 2000, paid: 300, due: 1700 });
    expect(unitLotAccount(lots, 'proc_1', 'combing')).toMatchObject({ charges: 470, paid: 0, due: 470 });
  });
});

describe('processing service (db mocked)', () => {
  const stockMap = new Map([['Grey 30s', { available: 100, avgPurchaseRate: 100 }]]);
  const ctx = { dyers: [dyer], combingUnits: [comber], stockMap, catalogue };
  const capture = () => {
    const saved = [];
    jest.spyOn(db, 'saveProcessingLot').mockImplementation(async (lot) => {
      saved.push(lot);
      return lot.id || 'lot_new';
    });
    return saved;
  };

  test('issue -> dyed -> received keeps one lot and fills each stage', async () => {
    const saved = capture();
    const issued = await saveIssue(issueForm, ctx);
    expect(issued).toMatchObject({
      id: 'lot_new',
      status: LOT_STATUS.AT_DYEING,
      grey: { description: 'Grey 30s', rolls: 10, qty: 50, rate: 100 },
      dyer: { id: 'dyer_1', name: 'Sri Dyes' },
      dyeingCharge: 1000,
    });
    const dyed = await saveDyed(
      issued,
      {
        dcNo: 'SD-77',
        date: '2026-10-05',
        rolls: '10',
        qty: '47',
        combingUnitId: 'proc_1',
        combingRate: '10',
      },
      ctx,
    );
    expect(dyed).toMatchObject({
      status: LOT_STATUS.AT_COMBING,
      combingCharge: 470,
      combingUnit: { name: 'Kumar Combing' },
    });
    const received = await saveReceived(dyed, { dcNo: 'KC-12', date: '2026-10-09', rolls: '9', qty: '45' });
    expect(received.status).toBe(LOT_STATUS.RECEIVED);
    expect(lotTotals(received).unitCost).toBe(143.78);
    expect(saved).toHaveLength(3);

    const back = await undoLastStage(received);
    expect(back).toMatchObject({ status: LOT_STATUS.AT_COMBING, received: null });
  });

  test('editing an issued lot keeps later stages and payments; grey cannot drop below what was dyed', async () => {
    capture();
    const existing = { ...lotAt('dyed'), dyeingPayments: [{ id: 'p1', amount: 100 }] };
    const edited = await saveIssue({ ...issueForm, greyRolls: '11' }, { ...ctx, existing });
    expect(edited).toMatchObject({
      dyeing: existing.dyeing,
      dyeingPayments: existing.dyeingPayments,
      grey: { rolls: 11 },
    });
    await expect(saveIssue({ ...issueForm, greyQty: '40' }, { ...ctx, existing })).rejects.toThrow(
      /cannot be less/,
    );
  });

  test('available grey rolls (stock map rolls; plus what the edited lot already took)', () => {
    const map = new Map([['Grey 30s', { available: 50, availableRolls: 4 }]]);
    expect(availableGreyRolls(map, 'Grey 30s')).toBe(4);
    expect(availableGreyRolls(map, 'Grey 30s', lotAt('issued'))).toBe(14);
    expect(availableGreyRolls(new Map([['Grey 30s', { available: 50 }]]), 'Grey 30s')).toBeNull();
    // a product never counted in rolls is not roll-checked
    const kgOnly = new Map([['Grey 30s', { available: 50, availableRolls: 0, hasRolls: false }]]);
    expect(availableGreyRolls(kgOnly, 'Grey 30s')).toBeNull();
    expect(availableGreyRolls(map, 'Unknown')).toBe(0);
  });
  test('stock movements carry the roll counts', () => {
    expect(lotStockMovements(lotAt('received')).map((m) => [m.kind, m.rolls])).toEqual([
      ['issue', 10],
      ['receipt', 9],
    ]);
  });
  test('available grey counts what the edited lot already took', () => {
    expect(availableGrey(stockMap, 'Grey 30s')).toBe(100);
    expect(availableGrey(new Map([['Grey 30s', { available: 50 }]]), 'Grey 30s', lotAt('issued'))).toBe(100);
    expect(availableGrey(stockMap, 'Unknown')).toBe(0);
    expect(availableGrey(stockMap, '')).toBeNull();
  });

  test('payments post to finance (cash or account) and are removed with the lot', async () => {
    capture();
    const tx = jest.spyOn(db, 'saveAccountTransaction').mockResolvedValue('x');
    const del = jest.spyOn(db, 'deleteAccountTransaction').mockResolvedValue();
    jest.spyOn(db, 'deleteProcessingLot').mockResolvedValue();
    const paid = await addLotPayment(lotAt('dyed'), 'combing', {
      amount: '470',
      method: 'account',
      bankAccountId: 'acc_1',
      date: '2026-10-10',
    });
    expect(paid.combingPayments[0]).toMatchObject({ amount: 470, mode: 'Account', bankAccountId: 'acc_1' });
    expect(tx.mock.calls[0][0]).toMatchObject({
      fromAccount: 'acc_1',
      category: 'Combing Payment',
      amount: 470,
    });
    await expect(addLotPayment(lotAt('dyed'), 'dyeing', { amount: '5', method: 'account' })).rejects.toThrow(
      /bank account/,
    );
    const cash = await addLotPayment(lotAt('issued'), 'dyeing', { amount: '100', method: 'cash' });
    expect(tx.mock.calls[1][0]).toMatchObject({ fromAccount: 'cash', category: 'Dyeing Payment' });
    const removed = await deleteLotPayment(cash, 'dyeing', cash.dyeingPayments[0].id);
    expect(removed.dyeingPayments).toEqual([]);
    await deleteLot(paid);
    expect(del).toHaveBeenCalledWith(paid.combingPayments[0].id);
  });
});
