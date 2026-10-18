import { accountLabel, accountLabelWithBank } from '@/core/accountLabel';
import {
  SALES_LEDGER,
  balanceReturnsTotal,
  billAmount,
  groupParties,
  partySummary,
  returnsTotalsByInvoice,
} from '@/core/ledger';
import {
  foldBreakdown,
  foldPurchasePayment,
  methodLabel,
  modeLabel,
  normalizeMethod,
  sumByMethod,
} from '@/core/paymentMethods';

describe('payment methods: only Cash and Account (legacy UPI reads as Account)', () => {
  test('normalizeMethod', () => {
    expect(['upi', 'UPI', 'GPay', 'bank', 'BANK', 'account'].map(normalizeMethod)).toEqual(
      Array(6).fill('account'),
    );
    expect(['cash', 'CASH', '', undefined, 'other'].map(normalizeMethod)).toEqual(Array(5).fill('cash'));
  });
  test('folding stored splits', () => {
    expect(foldBreakdown({ cash: 10, upi: 5, account: 2 })).toEqual({ cash: 10, account: 7 });
    expect(foldBreakdown(null)).toBeNull();
    expect(foldPurchasePayment({ cash: 1, upi: 2, account: 3, totalPaid: 6, balanceDue: 4 })).toEqual({
      cash: 1,
      account: 5,
      totalPaid: 6,
      balanceDue: 4,
    });
  });
  test('labels and sums', () => {
    expect(methodLabel('upi')).toBe('Account');
    expect(methodLabel('cash')).toBe('Cash');
    expect(['UPI', 'Bank', 'Account'].map(modeLabel)).toEqual(['Account', 'Account', 'Account']);
    expect(modeLabel('Cash')).toBe('Cash');
    expect(
      sumByMethod([
        { paymentMethod: 'cash', amount: 100 },
        { paymentMethod: 'upi', amount: 50 },
        { paymentMethod: 'account', amount: 25 },
      ]),
    ).toEqual({ cash: 100, account: 75 });
  });
});

describe('account labels', () => {
  test('new accounts (name = bank) never read "HDFC (HDFC)"; older ones keep their bank in brackets', () => {
    expect(accountLabel({ accountName: 'HDFC', bankName: 'HDFC' })).toBe('HDFC');
    expect(accountLabelWithBank({ accountName: 'HDFC', bankName: 'hdfc' })).toBe('HDFC');
    expect(accountLabelWithBank({ accountName: 'Current A/c', bankName: 'SBI' })).toBe('Current A/c (SBI)');
    expect(accountLabel({ bankName: 'Canara' })).toBe('Canara');
    expect(accountLabel({})).toBe('Bank Account');
  });
});

describe('party summaries', () => {
  const inv = (no, phone, name, subtotal, paid, previousBalance, over = {}) => ({
    invoiceNo: no,
    invoiceDate: '2026-05-10',
    customerName: name,
    customerPhone: phone,
    subtotal,
    previousBalance,
    grandTotal: subtotal + previousBalance,
    amountPaid: paid,
    balanceDue: subtotal + previousBalance - paid,
    ...over,
  });
  test('groups like the ledger: by phone, namesakes apart, phone-less bills to the only phone of their name', () => {
    const bills = [
      inv('1', '1111111111', 'Ravi', 100, 0, 0),
      inv('2', '2222222222', 'Ravi', 100, 0, 0),
      inv('3', '', 'Ravi', 100, 0, 0),
      inv('4', '3333333333', 'Kumar', 100, 0, 0),
      inv('5', '', 'kumar ', 100, 0, 100),
    ];
    const groups = groupParties(SALES_LEDGER, bills);
    expect(groups.map((g) => [g.key, g.bills.map((b) => b.invoiceNo)])).toEqual([
      ['p:1111111111', ['1']],
      ['p:2222222222', ['2']],
      ['n:ravi', ['3']],
      ['p:3333333333', ['4', '5']],
    ]);
  });
  test('balance = closing of the latest bill (carried balances and returns counted once); billed excludes carry', () => {
    const bills = [
      inv('1', '1', 'A', 500, 0, 1000, { invoiceDate: '2026-05-01', ledgerOpening: 1000 }),
      inv('2', '1', 'A', 100, 0, 1300, { invoiceDate: '2026-05-02', discountAmount: 0 }),
    ];
    const returns = [
      { invoiceNo: '1', returnAmount: 200 },
      { invoiceNo: '2', returnAmount: 50, settlementType: 'refund', refundMethod: 'cash' },
    ];
    const s = partySummary(SALES_LEDGER, bills, { returnsByInvoice: returnsTotalsByInvoice(returns) });
    expect(s).toMatchObject({ opening: 1000, balance: 1400, billed: 600, returns: 250, balanceReturns: 200 });
    expect(balanceReturnsTotal(returns)).toBe(200);
    expect(billAmount({ subtotal: 100, manualPreviousBalance: 20, discountAmount: 5 }, SALES_LEDGER)).toBe(
      115,
    );
  });
});
