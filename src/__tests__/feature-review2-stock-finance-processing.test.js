import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db';
import { calculateFinanceStats } from '@/features/finance/financeLogic';
import { billOwnAmount } from '@/features/overview/billOwnAmount';
import { computeStocks } from '@/features/overview/stocks/stocksLogic';
import { salesBillValue, purchaseBillValue } from '@/features/overview/revenue/dashboardAnalytics';
import { PURCHASE_LEDGER, SALES_LEDGER } from '@/core/ledger';
import { LOT_STATUS, validateIssue } from '@/features/processing/lotLogic';
import {
  addLotPayment,
  deleteLot,
  deleteLotPayment,
  saveDyed,
  saveIssue,
  saveReceived,
  undoLastStage,
} from '@/features/processing/processingService';
import { getStockQuantityMap } from '@/features/overview/stocks/stocksService';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';

afterEach(() => vi.restoreAllMocks());

const dyer = { id: 'd1', dyeingName: 'Sri Dyes' };
const dyer2 = { id: 'd2', dyeingName: 'Other Dyes' };
const comber = { id: 'c1', processorName: 'Kumar' };
const comber2 = { id: 'c2', processorName: 'Ravi' };
const catalogue = [{ fullDescription: 'Grey 30s' }, { fullDescription: 'Navy 30s' }];
const form = {
  dcNo: 'DC-001',
  dcDate: '2026-10-01',
  greyDescription: 'Grey 30s',
  greyRolls: '10',
  greyQty: '50',
  finishedDescription: 'Navy 30s',
  dyerId: 'd1',
  dyeingRate: '20',
  combingUnitId: '',
  combingRate: '',
  notes: '',
};
const ctx = {
  dyers: [dyer, dyer2],
  combingUnits: [comber, comber2],
  stockMap: new Map(),
  catalogue,
  lots: [],
};
const lot = (over = {}) => ({
  id: 'lot_1',
  dcNo: 'DC-001',
  dcDate: '2026-10-01',
  status: LOT_STATUS.AT_DYEING,
  grey: { description: 'Grey 30s', rolls: 10, qty: 50, rate: 100 },
  finishedDescription: 'Navy 30s',
  dyer: { id: 'd1', name: 'Sri Dyes' },
  dyeingRate: 20,
  dyeingCharge: 1000,
  combingUnit: null,
  dyeing: null,
  received: null,
  dyeingPayments: [],
  combingPayments: [],
  returns: [],
  ...over,
});

describe('1. opening balance is not a sale / purchase', () => {
  const bill = { subtotal: 1000, manualPreviousBalance: 400, discountAmount: 50, grandTotal: 1350 };
  it('billOwnAmount = subtotal - discount', () => {
    expect(billOwnAmount(bill, SALES_LEDGER)).toBe(950);
    expect(salesBillValue(bill)).toBe(950);
    expect(purchaseBillValue({ subtotal: 1000, manualPreviousBalance: 400, discount: 50 })).toBe(950);
    expect(billOwnAmount({ subtotal: 1000, manualPreviousBalance: 400 }, PURCHASE_LEDGER)).toBe(1000);
  });
  it('legacy bill without subtotal falls back to its lines', () => {
    expect(
      billOwnAmount({ products: [{ qty: 2, rate: 100 }], manualPreviousBalance: 300 }, SALES_LEDGER),
    ).toBe(200);
  });
  it('Stocks totals leave the carried balance out', () => {
    const { summary } = computeStocks(
      [{ invoiceNo: 'P1', subtotal: 500, manualPreviousBalance: 200, products: [] }],
      [{ invoiceNo: 'S1', subtotal: 900, manualPreviousBalance: 300, products: [] }],
      [],
    );
    expect(summary.totalSales).toBe(900);
    expect(summary.totalPurchases).toBe(500);
  });
});

describe('2. grey rate typed when there is no priced purchase', () => {
  it('uses the typed rate only when stock has none', async () => {
    vi.spyOn(db, 'saveProcessingLot').mockImplementation(async (l) => l.id || 'new');
    const noStock = await saveIssue({ ...form, greyRate: '80' }, ctx);
    expect(noStock.grey.rate).toBe(80);
    const withStock = new Map([['Grey 30s', { avgPurchaseRate: 120 }]]);
    const priced = await saveIssue({ ...form, greyRate: '80' }, { ...ctx, stockMap: withStock });
    expect(priced.grey.rate).toBe(120);
    const none = await saveIssue(form, ctx);
    expect(none.grey.rate).toBe(0);
  });
});

describe('3. stage saves apply on the fresh lot', () => {
  it('keeps a payment added elsewhere', async () => {
    const stale = lot();
    const fresh = lot({ dyeingPayments: [{ id: 'lot_pay_1', amount: 100 }] });
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue(fresh);
    const save = vi.spyOn(db, 'saveProcessingLot').mockResolvedValue('lot_1');
    const edited = await saveIssue({ ...form, greyRolls: '11' }, { ...ctx, existing: stale });
    expect(edited.dyeingPayments).toHaveLength(1);
    const dyed = await saveDyed(
      stale,
      { dcNo: 'DC-9', date: '2026-10-02', rolls: '1', qty: '40', combingUnitId: 'c1', combingRate: '5' },
      ctx,
    );
    expect(dyed.dyeingPayments).toHaveLength(1);
    const atCombing = lot({ ...fresh, status: LOT_STATUS.AT_COMBING, dyeing: { qty: 40 } });
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue(atCombing);
    const received = await saveReceived(
      lot({ ...fresh, status: LOT_STATUS.AT_COMBING, dyeing: { qty: 40 } }),
      {
        dcNo: 'DC-5',
        date: '2026-10-03',
        rolls: '1',
        qty: '38',
      },
    );
    expect(received.dyeingPayments).toHaveLength(1);
    expect(save).toHaveBeenCalled();
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue({
      ...fresh,
      status: LOT_STATUS.AT_COMBING,
      dyeing: { qty: 40 },
    });
    const undone = await undoLastStage(stale);
    expect(undone.status).toBe(LOT_STATUS.AT_DYEING);
    expect(undone.dyeingPayments).toHaveLength(1);
  });
});

describe('4. lot payment vs finance entry', () => {
  it('addLotPayment restores the lot when the finance write fails', async () => {
    const original = lot({ combingUnit: null });
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue(original);
    const save = vi.spyOn(db, 'saveProcessingLot').mockResolvedValue('lot_1');
    vi.spyOn(db, 'saveAccountTransaction').mockRejectedValue(new Error('offline'));
    await expect(addLotPayment(original, 'dyeing', { amount: 100, method: 'cash' })).rejects.toThrow(
      'offline',
    );
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].dyeingPayments).toHaveLength(0);
  });
  it('deleteLotPayment deletes the finance entry first and rethrows', async () => {
    const withPay = lot({ dyeingPayments: [{ id: 'lot_pay_1', amount: 100 }] });
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue(withPay);
    const save = vi.spyOn(db, 'saveProcessingLot').mockResolvedValue('lot_1');
    vi.spyOn(db, 'deleteAccountTransaction').mockRejectedValue(new Error('offline'));
    await expect(deleteLotPayment(withPay, 'dyeing', 'lot_pay_1')).rejects.toThrow('offline');
    expect(save).not.toHaveBeenCalled();
  });
  it('deleteLot stops (lot kept) when a finance entry cannot be deleted', async () => {
    const withPay = lot({ dyeingPayments: [{ id: 'lot_pay_1', amount: 100 }] });
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue(withPay);
    vi.spyOn(db, 'deleteAccountTransaction').mockRejectedValue(new Error('offline'));
    const del = vi.spyOn(db, 'deleteProcessingLot').mockResolvedValue();
    await expect(deleteLot(withPay)).rejects.toThrow('offline');
    expect(del).not.toHaveBeenCalled();
  });
});

describe('5. unit cannot change under payments', () => {
  it('refuses a new dyeing unit while payments exist, allows without', async () => {
    const paid = lot({ dyeingPayments: [{ id: 'lot_pay_1', amount: 100 }] });
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue(paid);
    vi.spyOn(db, 'saveProcessingLot').mockResolvedValue('lot_1');
    await expect(saveIssue({ ...form, dyerId: 'd2' }, { ...ctx, existing: paid })).rejects.toThrow(
      /Payments have already been made/,
    );
    const unpaid = lot();
    db.getProcessingLot.mockResolvedValue(unpaid);
    const changed = await saveIssue({ ...form, dyerId: 'd2' }, { ...ctx, existing: unpaid });
    expect(changed.dyer.id).toBe('d2');
  });
  it('refuses a new combing unit on the dyed DC while combing payments exist', async () => {
    const paid = lot({
      status: LOT_STATUS.AT_COMBING,
      dyeing: { qty: 40 },
      combingUnit: { id: 'c1', name: 'Kumar' },
      combingPayments: [{ id: 'lot_pay_2', amount: 10 }],
    });
    vi.spyOn(db, 'getProcessingLot').mockResolvedValue(paid);
    vi.spyOn(db, 'saveProcessingLot').mockResolvedValue('lot_1');
    await expect(
      saveDyed(paid, { dcNo: 'DC-9', date: '2026-10-02', rolls: '1', qty: '40', combingUnitId: 'c2' }, ctx),
    ).rejects.toThrow(/Payments have already been made/);
  });
});

describe('8. duplicate DC number', () => {
  it('rejects a number used by another lot, keeps its own', () => {
    const lots = [lot({ id: 'a', dcNo: 'DC-007' }), lot({ id: 'b', dcNo: 'DC-008' })];
    expect(validateIssue({ ...form, dcNo: 'dc 007' }, { lots })?.message).toMatch(/already used/);
    expect(validateIssue({ ...form, dcNo: 'DC-007' }, { lots, existingId: 'a' })).toBeNull();
  });
});

describe('9. strict reads', () => {
  it('stock map and live balances throw instead of showing partial data', async () => {
    vi.spyOn(db, 'getAllPurchaseBills').mockRejectedValue(new Error('read failed'));
    await expect(getStockQuantityMap(true)).rejects.toThrow('read failed');
    vi.spyOn(db, 'getAllBankAccounts').mockRejectedValue(new Error('read failed'));
    await expect(loadLiveAccountBalances()).rejects.toThrow('read failed');
  });
});

describe('10. loan interest as of a past date', () => {
  it('ignores payments made after that date', () => {
    const record = {
      principal: 1000,
      rate: 2,
      startDate: '2026-01-01',
      payments: [
        { date: '2026-02-01', amount: 100 },
        { date: '2026-06-01', amount: 500 },
      ],
    };
    expect(calculateFinanceStats(record, '2026-03-01').totalPaid).toBe(100);
    expect(calculateFinanceStats(record, '2026-06-01').totalPaid).toBe(600);
    expect(calculateFinanceStats(record).totalPaid).toBe(600);
  });
});
