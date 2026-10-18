import { describe, expect, test } from 'vitest';
import { computeAccountBalances, getAccountActivity } from '@/features/finance/accountsLogic';

describe('computeAccountBalances with additional amounts and manual deductions', () => {
  const bankAccounts = [
    { id: 'sbi', accountName: 'SBI Current', openingBalance: 10000 },
    { id: 'hdfc', accountName: 'HDFC Savings', openingBalance: 5000 },
  ];

  test('adds additional amount to cash in hand without debiting any bank', () => {
    const result = computeAccountBalances({
      bankAccounts,
      cashOpening: 2000,
      accountTransactions: [
        {
          id: 'tx_1',
          date: '2026-10-13',
          fromAccount: null,
          toAccount: 'cash',
          amount: 5000,
          type: 'Additional Amount',
          category: 'Owner Capital / Personal Funds',
        },
      ],
    });

    expect(result.cashBalance).toBe(7000);
    expect(result.cashAccount.inflows).toBe(5000);
    // Bank accounts must remain unaffected
    expect(result.bankAccounts.find((b) => b.id === 'sbi').currentBalance).toBe(10000);
    expect(result.totalBankBalance).toBe(15000);
    expect(result.totalAvailableFunds).toBe(22000);
  });

  test('adds additional amount to specific bank account without debiting cash', () => {
    const result = computeAccountBalances({
      bankAccounts,
      cashOpening: 2000,
      accountTransactions: [
        {
          id: 'tx_2',
          date: '2026-10-13',
          fromAccount: null,
          toAccount: 'sbi',
          amount: 15000,
          type: 'Additional Amount',
          category: 'Direct Cash Deposit',
        },
      ],
    });

    const sbi = result.bankAccounts.find((b) => b.id === 'sbi');
    expect(sbi.currentBalance).toBe(25000);
    expect(sbi.inflows).toBe(15000);
    expect(result.cashBalance).toBe(2000);
    expect(result.totalAvailableFunds).toBe(32000);
  });

  test('records manual deduction from cash without crediting any bank', () => {
    const result = computeAccountBalances({
      bankAccounts,
      cashOpening: 5000,
      accountTransactions: [
        {
          id: 'tx_3',
          date: '2026-10-13',
          fromAccount: 'cash',
          toAccount: null,
          amount: 1000,
          type: 'Manual Deduction',
          category: 'Owner Drawings / Personal Use',
        },
      ],
    });

    expect(result.cashBalance).toBe(4000);
    expect(result.cashAccount.outflows).toBe(1000);
    expect(result.totalAvailableFunds).toBe(19000);
  });

  test('records manual deduction from bank account', () => {
    const result = computeAccountBalances({
      bankAccounts,
      cashOpening: 2000,
      accountTransactions: [
        {
          id: 'tx_4',
          date: '2026-10-13',
          fromAccount: 'hdfc',
          toAccount: null,
          amount: 500,
          type: 'Manual Deduction',
          category: 'Bank Charges / Maintenance Fee',
        },
      ],
    });

    const hdfc = result.bankAccounts.find((b) => b.id === 'hdfc');
    expect(hdfc.currentBalance).toBe(4500);
    expect(hdfc.outflows).toBe(500);
    expect(result.totalAvailableFunds).toBe(16500);
  });
});

describe('getAccountActivity with manual additions and deductions', () => {
  const bankAccounts = [{ id: 'sbi', accountName: 'SBI Current', openingBalance: 10000 }];

  test('itemizes additional amount as an inflow with proper category and title', () => {
    const activity = getAccountActivity({
      account: { id: 'cash', openingBalance: 1000 },
      bankAccounts,
      accountTransactions: [
        {
          id: 'tx_add_1',
          date: '2026-10-13',
          fromAccount: null,
          toAccount: 'cash',
          amount: 3000,
          type: 'Additional Amount',
          category: 'Counter Cash Top-Up',
          notes: 'Added extra change in register',
        },
      ],
    });

    const item = activity.items.find((i) => i.id === 'tx-in-tx_add_1');
    expect(item).toBeDefined();
    expect(item.direction).toBe('in');
    expect(item.amount).toBe(3000);
    expect(item.title).toBe('Additional Amount: Counter Cash Top-Up');
    expect(item.subtitle).toBe('Added extra change in register');
    expect(activity.breakdown.additionalInflow).toBe(3000);
  });

  test('itemizes manual deduction as an outflow with proper title and direction', () => {
    const activity = getAccountActivity({
      account: { id: 'sbi', openingBalance: 10000 },
      bankAccounts,
      accountTransactions: [
        {
          id: 'tx_ded_1',
          date: '2026-10-13',
          fromAccount: 'sbi',
          toAccount: null,
          amount: 250,
          type: 'Manual Deduction',
          category: 'Bank Charges',
          notes: 'Annual debit card fee',
        },
      ],
    });

    const item = activity.items.find((i) => i.id === 'tx-out-tx_ded_1');
    expect(item).toBeDefined();
    expect(item.direction).toBe('out');
    expect(item.amount).toBe(250);
    expect(item.title).toBe('Deduction: Bank Charges');
    expect(item.subtitle).toBe('Annual debit card fee');
    expect(activity.breakdown.manualDeductionOutflow).toBe(250);
  });
});

describe('undo and reversal of transactions', () => {
  const bankAccounts = [
    { id: 'sbi', accountName: 'SBI Current', openingBalance: 10000 },
    { id: 'hdfc', accountName: 'HDFC Savings', openingBalance: 5000 },
  ];

  test('undoing an accidental additional amount restores original balance', () => {
    // 1. User unknowingly adds Rs. 5000 to SBI
    const accidentalTx = {
      id: 'tx_accidental',
      date: '2026-10-13',
      fromAccount: null,
      toAccount: 'sbi',
      amount: 5000,
      type: 'Additional Amount',
      category: 'Owner Capital / Personal Funds',
    };

    let result = computeAccountBalances({
      bankAccounts,
      cashOpening: 2000,
      accountTransactions: [accidentalTx],
    });
    expect(result.bankAccounts.find((b) => b.id === 'sbi').currentBalance).toBe(15000);

    // 2. User clicks Undo -> transaction removed
    result = computeAccountBalances({
      bankAccounts,
      cashOpening: 2000,
      accountTransactions: [], // undo removes it
    });
    expect(result.bankAccounts.find((b) => b.id === 'sbi').currentBalance).toBe(10000);
    expect(result.totalAvailableFunds).toBe(17000);
  });

  test('undoing an accidental manual deduction restores the balance', () => {
    // 1. Accidental deduction from cash
    const accidentalDeduction = {
      id: 'tx_deduct',
      date: '2026-10-13',
      fromAccount: 'cash',
      toAccount: null,
      amount: 1500,
      type: 'Manual Deduction',
      category: 'Owner Drawings',
    };

    let result = computeAccountBalances({
      bankAccounts,
      cashOpening: 5000,
      accountTransactions: [accidentalDeduction],
    });
    expect(result.cashBalance).toBe(3500);

    // 2. User clicks Undo
    result = computeAccountBalances({
      bankAccounts,
      cashOpening: 5000,
      accountTransactions: [],
    });
    expect(result.cashBalance).toBe(5000);
  });

  test('undoing a fund transfer restores both source and target balances', () => {
    // 1. Accidental transfer from Cash to HDFC of Rs. 2000
    const accidentalTransfer = {
      id: 'tx_transfer',
      date: '2026-10-13',
      fromAccount: 'cash',
      toAccount: 'hdfc',
      amount: 2000,
      type: 'Deposit',
      notes: 'Accidental transfer',
    };

    let result = computeAccountBalances({
      bankAccounts,
      cashOpening: 5000,
      accountTransactions: [accidentalTransfer],
    });
    expect(result.cashBalance).toBe(3000);
    expect(result.bankAccounts.find((b) => b.id === 'hdfc').currentBalance).toBe(7000);

    // 2. User clicks Undo
    result = computeAccountBalances({
      bankAccounts,
      cashOpening: 5000,
      accountTransactions: [],
    });
    expect(result.cashBalance).toBe(5000);
    expect(result.bankAccounts.find((b) => b.id === 'hdfc').currentBalance).toBe(5000);
  });
});
