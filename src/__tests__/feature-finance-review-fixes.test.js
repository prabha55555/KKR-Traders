/**
 * Finance review fixes: untracked first payment of older bills in the balances / activity (1), purchase activity
 * dated by invoiceDate (2), lot payments are not undone from Finance (3), a paid-off loan stays settled (4), a used
 * bank account cannot be deleted (5), one expense per double tap (6), id-less loan payments are removed one at a time (7).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createElement as h } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/core/db';
import * as accountsLogic from '@/features/finance/accountsLogic';
import {
  computeAccountBalances,
  countAccountReferences,
  getAccountActivity,
  isLotPaymentEntry,
  withUntrackedPurchaseInitial,
  withUntrackedSalesInitial,
} from '@/features/finance/accountsLogic';
import BankAccountDetailModal from '@/features/finance/BankAccountDetailModal';
import BankAccountsPage from '@/features/finance/BankAccountsPage';
import FinancePaymentHistoryModal from '@/features/finance/FinancePaymentHistoryModal';
import {
  addLoanPayment,
  calculateFinanceStats,
  findLoanPaymentIndex,
  removeLoanPayment,
} from '@/features/finance/financeLogic';
import ExpensesPage from '@/features/overview/expenses/ExpensesPage';
import { FeedbackProvider } from '@/ui/Feedback';

const renderWithFeedback = (ui) => render(h(MemoryRouter, null, h(FeedbackProvider, null, ui)));

const BANKS = [
  { id: 'acc_1', accountName: 'HDFC', bankName: 'HDFC', openingBalance: 0 },
  { id: 'acc_2', accountName: 'SBI', bankName: 'SBI', openingBalance: 0 },
];
const balances = (data) => computeAccountBalances({ bankAccounts: BANKS, cashOpening: 10000, ...data });
const bank = (result, id) => result.bankAccounts.find((b) => b.id === id).currentBalance;

// ------------------------------------------------------------------ 1. untracked first payment
describe('older bills: the first payment without a record still counts once later payments exist', () => {
  // paid ₹5,000 cash when written (nested split, no record), then ₹2,000 cash added from History
  const oldPurchase = {
    id: 'P1',
    invoiceNo: 'P1',
    invoiceDate: '2026-01-10',
    createdAt: '2026-06-01T10:00:00.000Z',
    supplierName: 'Ravi Mills',
    grandTotal: 10000,
    amountPaid: 7000,
    balanceDue: 3000,
    payment: { cash: 5000, account: 0, totalPaid: 7000, balanceDue: 3000 },
    paymentBreakdown: { cash: 2000, account: 0 },
  };
  const laterPurchasePayment = {
    id: 'pp_1',
    invoiceNo: 'P1',
    paymentDate: '2026-02-01',
    amount: 2000,
    paymentMethod: 'cash',
    paymentType: 'additional',
  };

  it('purchase: cash drops 7,000 (not 2,000)', () => {
    const result = balances({ purchaseBills: [oldPurchase], purchasePayments: [laterPurchasePayment] });
    expect(result.cashBalance).toBe(3000);
    expect(result.cashAccount.outflows).toBe(7000);
  });

  it('purchase: unchanged before the later payment (no records) and with an initial record (no double count)', () => {
    const noRecords = { ...oldPurchase, amountPaid: 5000, paymentBreakdown: undefined };
    expect(balances({ purchaseBills: [noRecords] }).cashBalance).toBe(5000);

    const initialRecord = { ...laterPurchasePayment, id: 'pp_0', amount: 5000, paymentType: 'initial' };
    const result = balances({
      purchaseBills: [oldPurchase],
      purchasePayments: [initialRecord, laterPurchasePayment],
    });
    expect(result.cashBalance).toBe(3000);
  });

  it('purchase: a nested cash + account split keeps each side; the bank is the bill bank', () => {
    const bill = {
      ...oldPurchase,
      bankAccountId: 'acc_1',
      amountPaid: 6000,
      payment: { cash: 3000, account: 2000, bankAccountId: 'acc_1' },
    };
    const later = { ...laterPurchasePayment, amount: 1000, paymentMethod: 'account', bankAccountId: 'acc_2' };
    const result = balances({ purchaseBills: [bill], purchasePayments: [later] });
    expect(result.cashBalance).toBe(7000);
    expect(bank(result, 'acc_1')).toBe(-2000);
    expect(bank(result, 'acc_2')).toBe(-1000);
  });

  it('purchase: an old bill without the nested split = paid total minus records, under its single method', () => {
    const bill = {
      invoiceNo: 'P9',
      invoiceDate: '2026-01-05',
      grandTotal: 9000,
      amountPaid: 7000,
      paymentMethod: 'upi',
      bankAccountId: 'acc_2',
    };
    const later = { ...laterPurchasePayment, invoiceNo: 'P9' };
    const result = balances({ purchaseBills: [bill], purchasePayments: [later] });
    expect(result.cashBalance).toBe(8000);
    expect(bank(result, 'acc_2')).toBe(-5000);
    expect(withUntrackedPurchaseInitial(bill, [later])).toHaveLength(2);
  });

  // sold for ₹10,000, ₹7,000 cash taken at the sale (no record), ₹2,000 cash received later (record)
  const oldSale = {
    id: '001',
    invoiceNo: '001',
    invoiceDate: '2026-01-12',
    customerName: 'Anand Tex',
    grandTotal: 10000,
    amountPaid: 9000,
    paymentMethod: 'cash',
    paymentBreakdown: { cash: 9000, account: 0 },
  };
  const laterSalePayment = {
    id: 'payment_1',
    invoiceNo: '001',
    paymentDate: '2026-02-03',
    amount: 2000,
    paymentMethod: 'cash',
    paymentType: 'additional',
  };

  it('sales: cash rises 9,000 (not 2,000)', () => {
    const result = balances({ salesInvoices: [oldSale], salesPayments: [laterSalePayment] });
    expect(result.cashBalance).toBe(19000);
  });

  it('sales: split by the stored breakdown minus the later payments, else by the single method', () => {
    const split = {
      ...oldSale,
      amountPaid: 9000,
      bankAccountId: 'acc_1',
      paymentBreakdown: { cash: 4000, account: 5000 },
    };
    const later = { ...laterSalePayment, amount: 3000, paymentMethod: 'account', bankAccountId: 'acc_2' };
    const result = balances({ salesInvoices: [split], salesPayments: [later] });
    expect(result.cashBalance).toBe(14000);
    expect(bank(result, 'acc_1')).toBe(2000);
    expect(bank(result, 'acc_2')).toBe(3000);

    // the breakdown does not add up: everything untracked under the invoice's method (legacy 'upi' = Account)
    const single = { ...oldSale, amountPaid: 7000, paymentMethod: 'upi', paymentBreakdown: { cash: 1000 } };
    const records = withUntrackedSalesInitial(single, [laterSalePayment]);
    expect(records[0]).toMatchObject({ amount: 5000, paymentMethod: 'account', paymentType: 'initial' });
    expect(withUntrackedSalesInitial(single, [{ ...laterSalePayment, paymentType: 'initial' }])).toHaveLength(
      1,
    );
  });

  it('the account activity lists the untracked first payment on the bill date and matches the balance', () => {
    const cash = { id: 'cash', openingBalance: 10000 };
    const purchase = getAccountActivity({
      account: cash,
      bankAccounts: BANKS,
      purchaseBills: [oldPurchase],
      purchasePayments: [laterPurchasePayment],
    });
    expect(purchase.totalOutflows).toBe(7000);
    expect(purchase.computedCurrentBalance).toBe(3000);
    const first = purchase.items.find((i) => i.amount === 5000);
    expect(first).toMatchObject({ date: '2026-01-10', type: 'Purchase (Cash)', direction: 'out' });
    expect(first.sourceRef).toBe(oldPurchase);

    const sales = getAccountActivity({
      account: cash,
      bankAccounts: BANKS,
      salesInvoices: [oldSale],
      salesPayments: [laterSalePayment],
    });
    expect(sales.totalInflows).toBe(9000);
    expect(sales.items.find((i) => i.amount === 7000)).toMatchObject({
      date: '2026-01-12',
      type: 'Sale (Cash)',
    });
  });
});

// ------------------------------------------------------------------ 2. purchase activity date
describe('purchase activity is dated by the bill invoiceDate', () => {
  it('uses invoiceDate, not the re-stamped createdAt', () => {
    const bill = {
      id: 'P2',
      invoiceNo: 'P2',
      invoiceDate: '2026-03-04',
      createdAt: '2026-09-30T12:00:00.000Z',
      payment: { cash: 1500, account: 0 },
    };
    const { items } = getAccountActivity({ account: { id: 'cash' }, purchaseBills: [bill] });
    expect(items).toHaveLength(1);
    expect(items[0].date).toBe('2026-03-04');
  });
});

// ------------------------------------------------------------------ 3. lot payments are undone from Dyeing & Combing
describe('lot / batch payment copies are not undone from Finance', () => {
  const lotTx = {
    id: 'lot_pay_1760000000000_ab12c',
    date: '2026-10-01',
    type: 'expense',
    category: 'Dyeing Payment',
    amount: 800,
    fromAccount: 'cash',
    notes: 'Lot DC-001 (Sri Dyers)',
  };
  const manualTx = {
    id: 'tx_1',
    date: '2026-10-02',
    type: 'Manual Deduction',
    amount: 50,
    fromAccount: 'cash',
  };

  it('recognises lot, old dyeing and old combing payment ids', () => {
    expect(isLotPaymentEntry(lotTx)).toBe(true);
    expect(isLotPaymentEntry({ id: 'dye_pay_1_x' })).toBe(true);
    expect(isLotPaymentEntry({ id: 'cb_pay_1_x' })).toBe(true);
    expect(isLotPaymentEntry(manualTx)).toBe(false);
    expect(isLotPaymentEntry(undefined)).toBe(false);
  });

  it('Entries tab: a note instead of Undo on the lot payment, Undo kept on other entries', async () => {
    vi.restoreAllMocks();
    mockBankPage({ getAllAccountTransactions: [lotTx, manualTx] });
    const deleteTx = vi.spyOn(db, 'deleteAccountTransaction').mockResolvedValue(undefined);
    renderWithFeedback(h(BankAccountsPage));
    fireEvent.click(await screen.findByText(/Entries \(2\)/));
    expect(await screen.findByText('Undo from Dyeing & Combing')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Undo$/ })).toHaveLength(1);
    expect(deleteTx).not.toHaveBeenCalled();
  });

  it('account detail: no Undo on the lot payment', () => {
    vi.restoreAllMocks();
    renderWithFeedback(
      h(BankAccountDetailModal, {
        account: { id: 'cash', openingBalance: 1000 },
        allData: { accountTransactions: [lotTx], bankAccounts: BANKS },
        onClose: vi.fn(),
      }),
    );
    expect(screen.getByText('Undo from Dyeing & Combing')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Undo$/ })).not.toBeInTheDocument();
  });
});

// ------------------------------------------------------------------ 4. a paid-off loan stays settled
describe('a loan paid off gets its end date and stays settled', () => {
  const loan = {
    id: 'f1',
    lenderName: 'Kumar',
    principal: 10000,
    rate: 2,
    startDate: '2026-01-01',
    payments: [],
  };

  it('the payment that clears the balance (interest up to its date) ends the loan on that date', () => {
    // 2 months at 2% = 400 interest
    const paid = addLoanPayment(loan, { id: 'p1', date: '2026-03-01', amount: 10400, mode: 'Cash' });
    expect(paid.endDate).toBe('2026-03-01');
    expect(paid.paidOffOn).toBe('2026-03-01');
    expect(calculateFinanceStats(paid).isSettled).toBe(true);
    // "Interest as of" a later day: no interest after the end date
    const later = calculateFinanceStats(paid, '2026-12-31');
    expect(later.totalInterestAccrued).toBe(400);
    expect(later.isSettled).toBe(true);
    // an earlier day still reads as of that day
    expect(calculateFinanceStats(paid, '2026-02-01').totalInterestAccrued).toBe(200);
  });

  it('a part payment or a loan that already has an end date is left alone', () => {
    const part = addLoanPayment(loan, { id: 'p1', date: '2026-03-01', amount: 5000, mode: 'Cash' });
    expect(part.endDate).toBeUndefined();
    expect(part.payments).toHaveLength(1);
    const fixed = { ...loan, endDate: '2026-12-31' };
    expect(addLoanPayment(fixed, { id: 'p1', date: '2026-03-01', amount: 99999 }).endDate).toBe('2026-12-31');
  });

  it('"Pay Full Due" rounded to the paisa settles the loan', () => {
    // 10 days at 1% on 10,000 = 33.333… interest; the button pays 10,033.33
    const small = { ...loan, rate: 1 };
    const paid = addLoanPayment(small, { id: 'p1', date: '2026-01-11', amount: 10033.33 });
    expect(paid.endDate).toBe('2026-01-11');
    expect(calculateFinanceStats(paid).isSettled).toBe(true);
  });

  it('removing the paying-off payment reopens the loan; a typed end date stays', () => {
    const paid = addLoanPayment(loan, { id: 'p1', date: '2026-03-01', amount: 10400 });
    const reopened = removeLoanPayment(paid, 0);
    expect(reopened.endDate).toBe('');
    expect(reopened).not.toHaveProperty('paidOffOn');
    const typed = { ...paid, endDate: '2026-04-01' };
    expect(removeLoanPayment(typed, 0).endDate).toBe('2026-04-01');
  });
});

// ------------------------------------------------------------------ 5. used bank accounts cannot be deleted
describe('countAccountReferences', () => {
  const acc2 = BANKS[1];

  it('an unused account has none', () => {
    expect(countAccountReferences(acc2, { bankAccounts: BANKS })).toBe(0);
    expect(countAccountReferences({ id: 'cash' }, { bankAccounts: BANKS })).toBe(0);
  });

  it('counts every record that names the account or moves its balance', () => {
    const data = {
      bankAccounts: BANKS,
      expenses: [{ id: 'e1', amount: 100, paymentSource: 'acc_2' }],
      financeRecords: [
        {
          id: 'f1',
          principal: 1000,
          depositAccount: 'acc_2',
          payments: [{ date: '2026-02-01', amount: 10, sourceAccount: 'acc_2' }],
        },
      ],
      purchaseBills: [{ invoiceNo: 'P1', payment: { cash: 100, account: 0, bankAccountId: 'acc_2' } }],
      salesReturns: [{ id: 'r1', returnAmount: 50, refundMethod: 'cash', bankAccountId: 'acc_2' }],
    };
    // expense, loan, loan repayment, bill, return
    expect(countAccountReferences(acc2, data)).toBe(5);
  });

  it('a lot payment and its finance copy are one; old records without a bank count for the first account', () => {
    const lotPay = { id: 'lot_pay_1', amount: 500, bankAccountId: 'acc_2', mode: 'Account' };
    const data = {
      bankAccounts: BANKS,
      accountTransactions: [{ id: 'lot_pay_1', amount: 500, fromAccount: 'acc_2', bankAccountId: 'acc_2' }],
      processingLots: [{ id: 'L1', dyeingPayments: [lotPay], combingPayments: [] }],
      combingBatches: [{ id: 'CB1', payments: [{ id: 'cb_pay_1', amount: 70, bankAccountId: 'acc_2' }] }],
      salesInvoices: [{ invoiceNo: '001', amountPaid: 300, paymentMethod: 'account' }],
    };
    expect(countAccountReferences(acc2, data)).toBe(2);
    expect(countAccountReferences(BANKS[0], data)).toBe(1);
  });
});

describe('BankAccountsPage: Delete', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('refuses an account that has transactions', async () => {
    mockBankPage({
      getAllBankAccounts: [BANKS[0]],
      getAllExpenses: [{ id: 'e1', date: '2026-10-01', amount: 100, paymentSource: 'acc_1' }],
    });
    const del = vi.spyOn(db, 'deleteBankAccount').mockResolvedValue(undefined);
    renderWithFeedback(h(BankAccountsPage));
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }));
    expect(
      await screen.findByText("This account has 1 transaction; it can't be deleted."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes an unused account after the confirm', async () => {
    mockBankPage({ getAllBankAccounts: [BANKS[0]] });
    const del = vi.spyOn(db, 'deleteBankAccount').mockResolvedValue(undefined);
    renderWithFeedback(h(BankAccountsPage));
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(del).toHaveBeenCalledWith('acc_1'));
  });

  it('does not delete when the check cannot read the data', async () => {
    mockBankPage({ getAllBankAccounts: [BANKS[0]] });
    vi.spyOn(db, 'getAllProcessingLots').mockRejectedValue(new Error('offline'));
    const del = vi.spyOn(db, 'deleteBankAccount').mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithFeedback(h(BankAccountsPage));
    fireEvent.click(await screen.findByRole('button', { name: /^Delete$/ }));
    expect(await screen.findByText(/Could not check this account/)).toBeInTheDocument();
    expect(del).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------ 6. one expense per double tap
describe('ExpensesPage: Save', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('a double tap saves one expense', async () => {
    vi.spyOn(db, 'getAllExpenses').mockResolvedValue([]);
    vi.spyOn(db, 'getAllBankAccounts').mockResolvedValue([]);
    vi.spyOn(accountsLogic, 'loadLiveAccountBalances').mockResolvedValue({
      cashBalance: 100000,
      bankAccounts: [],
    });
    const save = vi.spyOn(db, 'saveExpense').mockResolvedValue(undefined);
    renderWithFeedback(h(ExpensesPage));
    fireEvent.click(await screen.findByRole('button', { name: /Add Expense/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Amount/), { target: { value: '250' } });
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: 'Tea' } });
    const form = dialog.querySelector('form');
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(save).toHaveBeenCalled());
    await screen.findByText('Expense saved successfully!');
    expect(save).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------------ 7. loan payments without an id
describe('older loan payments without an id', () => {
  const record = {
    id: 'f1',
    lenderName: 'Kumar',
    principal: 10000,
    rate: 1,
    startDate: '2026-01-01',
    payments: [
      { date: '2026-02-01', amount: 100, mode: 'Cash' },
      { date: '2026-03-01', amount: 50, mode: 'Cash' },
      { date: '2026-03-01', amount: 50, mode: 'Cash' },
    ],
  };

  beforeEach(() => vi.restoreAllMocks());

  it('are found by position (or date + amount) and removed one at a time', () => {
    const [, second, third] = record.payments;
    expect(findLoanPaymentIndex(record, third)).toBe(2);
    expect(findLoanPaymentIndex(record, { ...second }, 2)).toBe(2);
    expect(findLoanPaymentIndex(record, { date: '2026-05-01', amount: 1 })).toBe(-1);
    expect(removeLoanPayment(record, 1).payments).toEqual([record.payments[0], record.payments[2]]);
    expect(removeLoanPayment(record, 5)).toBeNull();
  });

  it('Payment History deletes only the chosen one', async () => {
    vi.spyOn(db, 'getAllBankAccounts').mockResolvedValue([]);
    const save = vi.spyOn(db, 'saveFinanceRecord').mockResolvedValue('f1');
    const onUpdate = vi.fn();
    renderWithFeedback(h(FinancePaymentHistoryModal, { record, onClose: vi.fn(), onUpdate }));
    // newest first: the last listed is the 2026-02-01 payment of ₹100
    const buttons = screen.getAllByRole('button', { name: 'Delete Payment' });
    fireEvent.click(buttons[buttons.length - 1]);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].payments).toEqual([record.payments[1], record.payments[2]]);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('account detail Undo removes that one payment and reports success', async () => {
    const save = vi.spyOn(db, 'saveFinanceRecord').mockResolvedValue('f1');
    const onRefresh = vi.fn();
    const loan = { ...record, principal: 0, payments: [{ date: '2026-02-01', amount: 100, mode: 'Cash' }] };
    renderWithFeedback(
      h(BankAccountDetailModal, {
        account: { id: 'cash', openingBalance: 1000 },
        allData: { financeRecords: [loan], bankAccounts: BANKS },
        onClose: vi.fn(),
        onRefresh,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^Undo$/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo Entry' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0].payments).toEqual([]);
    expect(await screen.findByText('Undone!')).toBeInTheDocument();
    expect(onRefresh).toHaveBeenCalled();
  });
});

/** Every getter BankAccountsPage (and its Delete check) reads, empty unless given. */
function mockBankPage(overrides = {}) {
  const lists = {
    getAllBankAccounts: BANKS,
    getAllInvoices: [],
    getAllPurchaseBills: [],
    getAllExpenses: [],
    getAllFinanceRecords: [],
    getAllAccountTransactions: [],
    getAllPayments: [],
    getAllPurchasePayments: [],
    getAllReturns: [],
    getAllPurchaseReturns: [],
    getAllProcessingLots: [],
    getAllDyeingBatches: [],
    getAllCombingBatches: [],
    ...overrides,
  };
  vi.spyOn(db, 'getCashSettings').mockResolvedValue({ openingBalance: 0 });
  for (const [method, value] of Object.entries(lists)) vi.spyOn(db, method).mockResolvedValue(value);
}
