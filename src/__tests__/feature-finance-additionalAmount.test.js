import { describe, expect, test } from 'vitest';
import {
  buildCashBalanceEdit,
  computeAccountBalances,
  getAccountActivity,
  txDirection,
} from '@/features/finance/accountsLogic';

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

describe('entries without a Reason / Category (new Add Amount form)', () => {
  const bankAccounts = [{ id: 'sbi', accountName: 'SBI', bankName: 'SBI', openingBalance: 10000 }];

  test('a category-less Additional Amount reads "Additional Amount" and counts as an added amount', () => {
    const tx = {
      id: 'tx_new_in',
      date: '2026-10-14',
      fromAccount: null,
      toAccount: 'cash',
      amount: 700,
      type: 'Additional Amount',
      notes: '',
    };
    const activity = getAccountActivity({
      account: { id: 'cash', openingBalance: 0 },
      bankAccounts,
      accountTransactions: [tx],
    });
    const item = activity.items.find((i) => i.id === 'tx-in-tx_new_in');
    expect(item.title).toBe('Additional Amount');
    expect(item.category).toBe('Adjustment');
    expect(activity.breakdown.additionalInflow).toBe(700);
    expect(activity.breakdown.transferInflow).toBe(0);
    expect(
      computeAccountBalances({ bankAccounts, cashOpening: 100, accountTransactions: [tx] }).cashBalance,
    ).toBe(800);
  });

  test('a category-less Manual Deduction reads "Deduction"', () => {
    const tx = {
      id: 'tx_new_out',
      date: '2026-10-14',
      fromAccount: 'sbi',
      toAccount: null,
      amount: 40,
      type: 'Manual Deduction',
      notes: '',
    };
    const activity = getAccountActivity({
      account: { id: 'sbi', openingBalance: 10000 },
      bankAccounts,
      accountTransactions: [tx],
    });
    const item = activity.items.find((i) => i.id === 'tx-out-tx_new_out');
    expect(item.title).toBe('Deduction');
    expect(activity.breakdown.manualDeductionOutflow).toBe(40);
    expect(activity.breakdown.transferOutflow).toBe(0);
  });
});

describe('cash Edit Balance (records only the difference)', () => {
  const bankAccounts = [{ id: 'sbi', accountName: 'SBI', bankName: 'SBI', openingBalance: 10000 }];

  test('raising the balance writes one null -> cash entry and cash becomes the counted amount', () => {
    const tx = buildCashBalanceEdit({
      cashBalance: 1250.5,
      target: 2000,
      date: '2026-10-15',
      notes: ' counted ',
    });
    expect(tx).toEqual({
      date: '2026-10-15',
      type: 'Balance Adjustment',
      category: 'Cash Balance Edit',
      fromAccount: null,
      toAccount: 'cash',
      amount: 749.5,
      adjustment: true,
      previousBalance: 1250.5,
      newBalance: 2000,
      notes: 'counted',
    });
    const after = computeAccountBalances({
      bankAccounts,
      cashOpening: 1250.5,
      accountTransactions: [{ id: 'atx_1', ...tx }],
    });
    expect(after.cashBalance).toBe(2000);
    // banks are untouched and the cash opening is not rewritten
    expect(after.totalBankBalance).toBe(10000);
    expect(after.cashAccount.openingBalance).toBe(1250.5);
  });

  test('lowering the balance writes one cash -> null entry; undo (deleting it) restores the old balance', () => {
    const salesInvoices = [{ invoiceNo: 'S1', paymentBreakdown: { cash: 3000 }, amountPaid: 3000 }];
    const base = computeAccountBalances({ bankAccounts, cashOpening: 500, salesInvoices });
    expect(base.cashBalance).toBe(3500);

    const tx = buildCashBalanceEdit({ cashBalance: base.cashBalance, target: 3200, date: '2026-10-15' });
    expect(tx.fromAccount).toBe('cash');
    expect(tx.toAccount).toBeNull();
    expect(tx.amount).toBe(300);

    const after = computeAccountBalances({
      bankAccounts,
      cashOpening: 500,
      salesInvoices,
      accountTransactions: [{ id: 'atx_2', ...tx }],
    });
    expect(after.cashBalance).toBe(3200);

    const undone = computeAccountBalances({
      bankAccounts,
      cashOpening: 500,
      salesInvoices,
      accountTransactions: [],
    });
    expect(undone.cashBalance).toBe(3500);
  });

  test('no entry when the counted cash equals the system balance', () => {
    expect(buildCashBalanceEdit({ cashBalance: 1000, target: 1000.004, date: '2026-10-15' })).toBeNull();
  });

  test('the cash ledger shows the edit with its previous and new balance', () => {
    const tx = {
      id: 'atx_3',
      ...buildCashBalanceEdit({ cashBalance: 900, target: 1000, date: '2026-10-15', notes: 'Drawer count' }),
    };
    const activity = getAccountActivity({
      account: { id: 'cash', openingBalance: 900 },
      bankAccounts,
      accountTransactions: [tx],
    });
    const item = activity.items.find((i) => i.id === 'tx-in-atx_3');
    expect(item.title).toBe('Cash Balance Edited');
    expect(item.type).toBe('Balance Adjustment');
    expect(item.subtitle).toBe('₹900 → ₹1000 • Drawer count');
    expect(activity.computedCurrentBalance).toBe(1000);
  });

  test('txDirection: in / out / legacy transfer', () => {
    expect(txDirection({ fromAccount: null, toAccount: 'cash' })).toBe('in');
    expect(txDirection({ fromAccount: 'cash', toAccount: null })).toBe('out');
    expect(txDirection({ fromAccount: 'sbi', toAccount: 'external' })).toBe('out');
    expect(txDirection({ fromAccount: 'cash', toAccount: 'sbi' })).toBe('transfer');
    // dyeing / combing payments: type 'expense', only fromAccount
    expect(txDirection({ type: 'expense', category: 'Dyeing Payment', fromAccount: 'sbi' })).toBe('out');
  });
});

describe('legacy data keeps working after Transfer Funds and UPI left the UI', () => {
  const bankAccounts = [
    {
      id: 'sbi',
      accountName: 'SBI Current',
      bankName: 'State Bank of India',
      accountType: 'Current',
      openingBalance: 10000,
    },
  ];

  test('an old "Deposit to Bank" transfer still moves cash into the bank and stays a transfer', () => {
    const tx = {
      id: 'tx_dep',
      date: '2026-09-01',
      fromAccount: 'cash',
      toAccount: 'sbi',
      amount: 2500,
      type: 'Deposit to Bank',
    };
    const result = computeAccountBalances({ bankAccounts, cashOpening: 5000, accountTransactions: [tx] });
    expect(result.cashBalance).toBe(2500);
    expect(result.bankAccounts[0].currentBalance).toBe(12500);

    const bank = getAccountActivity({
      account: { id: 'sbi', openingBalance: 10000 },
      bankAccounts,
      accountTransactions: [tx],
    });
    const item = bank.items.find((i) => i.id === 'tx-in-tx_dep');
    expect(item.title).toBe('Received from Cash in Hand');
    expect(item.category).toBe('Transfer');
    expect(bank.breakdown.transferInflow).toBe(2500);
    expect(bank.breakdown.additionalInflow).toBe(0);

    const cash = getAccountActivity({
      account: { id: 'cash', openingBalance: 5000 },
      bankAccounts,
      accountTransactions: [tx],
    });
    expect(cash.items[0].title).toBe('Transferred to SBI Current');
    expect(cash.breakdown.transferOutflow).toBe(2500);
  });

  test('legacy UPI money is Account money: same balance, labelled "(Account)"', () => {
    const salesInvoices = [
      {
        id: 'i1',
        invoiceNo: 'S9',
        invoiceDate: '2026-09-02',
        paymentBreakdown: { cash: 100, upi: 400, account: 500 },
        amountPaid: 1000,
      },
    ];
    const result = computeAccountBalances({ bankAccounts, cashOpening: 0, salesInvoices });
    expect(result.bankAccounts[0].currentBalance).toBe(10900);
    expect(result.cashBalance).toBe(100);

    const activity = getAccountActivity({
      account: { id: 'sbi', openingBalance: 10000 },
      bankAccounts,
      salesInvoices,
    });
    expect(activity.items).toHaveLength(1);
    expect(activity.items[0].type).toBe('Sale (Account)');
    expect(activity.items[0].amount).toBe(900);

    const purchasePayments = [
      { id: 'pp1', invoiceNo: 'P1', amount: 300, paymentMethod: 'upi', bankAccountId: 'sbi' },
    ];
    const purchaseBills = [{ id: 'b1', billNumber: 'P1', billDate: '2026-09-03', supplierName: 'Ravi' }];
    const purchase = getAccountActivity({
      account: { id: 'sbi', openingBalance: 10000 },
      bankAccounts,
      purchaseBills,
      purchasePayments,
    });
    expect(purchase.items[0].type).toBe('Purchase (Account)');
    expect(purchase.items[0].subtitle).toBe('Supplier: Ravi • Account');
    expect(purchase.computedCurrentBalance).toBe(9700);
  });

  test('an old loan repayment stored with mode "UPI" reads as Account', () => {
    const financeRecords = [
      {
        id: 'f1',
        principal: 0,
        depositAccount: 'cash',
        startDate: '2026-01-01',
        payments: [{ id: 'lp1', date: '2026-02-01', amount: 200, mode: 'UPI', sourceAccount: 'sbi' }],
      },
    ];
    const result = computeAccountBalances({ bankAccounts, financeRecords });
    expect(result.bankAccounts[0].currentBalance).toBe(9800);
    const activity = getAccountActivity({
      account: { id: 'sbi', openingBalance: 10000 },
      bankAccounts,
      financeRecords,
    });
    expect(activity.items.find((i) => i.id === 'fin-pay-f1-0').subtitle).toBe('Mode: Account');
  });
});
