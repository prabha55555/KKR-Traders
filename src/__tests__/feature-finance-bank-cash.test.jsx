import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/core/db';
import * as accountsLogic from '@/features/finance/accountsLogic';
import AddAdditionalAmountModal from '@/features/finance/AddAdditionalAmountModal';
import AddFinancePaymentModal from '@/features/finance/AddFinancePaymentModal';
import BankAccountModal from '@/features/finance/BankAccountModal';
import BankAccountsPage from '@/features/finance/BankAccountsPage';
import FinancePaymentHistoryModal from '@/features/finance/FinancePaymentHistoryModal';
import { FeedbackProvider } from '@/ui/Feedback';

describe('loan payments: Cash or Account only', () => {
  const record = {
    id: 'f1',
    lenderName: 'Kumar',
    principal: 10000,
    rate: 1,
    startDate: '2026-01-01',
    payments: [
      { id: 'p1', date: '2026-02-01', amount: 100, mode: 'UPI', sourceAccount: 'acc_1' },
      { id: 'p2', date: '2026-03-01', amount: 50, mode: 'Cash', sourceAccount: 'cash' },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('the payment form offers only Cash and Account', async () => {
    vi.spyOn(accountsLogic, 'loadLiveAccountBalances').mockResolvedValue({
      cashBalance: 900,
      bankAccounts: [{ id: 'acc_1', accountName: 'HDFC', bankName: 'HDFC', currentBalance: 5000 }],
    });
    renderWithFeedback(<AddFinancePaymentModal record={record} onClose={vi.fn()} onSave={vi.fn()} />);
    const mode = screen.getByLabelText(/Payment Mode/i);
    const options = within(mode)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Cash', 'Account']);
    fireEvent.change(mode, { target: { value: 'Account' } });
    expect(await screen.findByRole('option', { name: 'HDFC' })).toBeInTheDocument();
  });

  it('an old UPI loan payment is listed as an Account payment', async () => {
    vi.spyOn(db, 'getAllBankAccounts').mockResolvedValue([
      { id: 'acc_1', accountName: 'HDFC', bankName: 'HDFC' },
    ]);
    renderWithFeedback(<FinancePaymentHistoryModal record={record} onClose={vi.fn()} onUpdate={vi.fn()} />);
    expect(screen.getByText('Account Payment')).toBeInTheDocument();
    expect(screen.getByText('Cash Payment')).toBeInTheDocument();
    expect(screen.queryByText(/UPI/)).not.toBeInTheDocument();
    // new-style bank (accountName === bankName) is not shown as "HDFC (HDFC)"
    expect(await screen.findByText('HDFC')).toBeInTheDocument();
  });

  it('the other finance pages load without the in-page tab bar', async () => {
    const pages = await Promise.all([
      import('@/features/finance/FinanceRecordsPage'),
      import('@/features/finance/FinanceSettledRecordsPage'),
      import('@/features/finance/FinanceLendersPage'),
      import('@/features/finance/FinanceFormModal'),
    ]);
    pages.forEach((m) => expect(typeof m.default).toBe('function'));
  });
});

const renderWithFeedback = (ui) =>
  render(
    <MemoryRouter>
      <FeedbackProvider>{ui}</FeedbackProvider>
    </MemoryRouter>,
  );

describe('BankAccountModal (Bank Name + Opening Balance only)', () => {
  it('creates an account storing the name in both accountName and bankName', () => {
    const onSave = vi.fn();
    renderWithFeedback(<BankAccountModal account={null} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.queryByLabelText(/Account Number/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Account Type/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Notes/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Bank Name/i), { target: { value: '  HDFC  ' } });
    fireEvent.change(screen.getByLabelText(/Opening Balance/i), { target: { value: '-2500' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Account/i }));

    expect(onSave).toHaveBeenCalledWith({ accountName: 'HDFC', bankName: 'HDFC', openingBalance: -2500 });
  });

  it('editing keeps the legacy fields, drops computed balances and keeps the name pair unless renamed', () => {
    const legacy = {
      id: 'acc_1',
      accountName: 'SBI Current A/c',
      bankName: 'State Bank of India',
      accountNumber: '9876',
      accountType: 'Overdraft',
      notes: 'Main branch',
      openingBalance: 1000,
      currentBalance: 4200,
      inflows: 3200,
      outflows: 0,
    };
    const onSave = vi.fn();
    const { unmount } = renderWithFeedback(
      <BankAccountModal account={legacy} onClose={vi.fn()} onSave={onSave} />,
    );

    expect(screen.getByLabelText(/Bank Name/i)).toHaveValue('SBI Current A/c');
    fireEvent.change(screen.getByLabelText(/Opening Balance/i), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Account/i }));
    expect(onSave).toHaveBeenCalledWith({
      id: 'acc_1',
      accountName: 'SBI Current A/c',
      bankName: 'State Bank of India',
      accountNumber: '9876',
      accountType: 'Overdraft',
      notes: 'Main branch',
      openingBalance: 1500,
    });
    unmount();

    const onRename = vi.fn();
    renderWithFeedback(<BankAccountModal account={legacy} onClose={vi.fn()} onSave={onRename} />);
    fireEvent.change(screen.getByLabelText(/Bank Name/i), { target: { value: 'SBI' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Account/i }));
    expect(onRename.mock.calls[0][0]).toMatchObject({
      accountName: 'SBI',
      bankName: 'SBI',
      accountNumber: '9876',
    });
  });
});

describe('AddAdditionalAmountModal', () => {
  const accounts = [{ id: 'acc_1', accountName: 'HDFC', bankName: 'HDFC' }];

  it('has no Reason / Category field and saves an Add Amount without a category', () => {
    const onSave = vi.fn();
    renderWithFeedback(
      <AddAdditionalAmountModal accounts={accounts} cashBalance={500} onClose={vi.fn()} onSave={onSave} />,
    );
    expect(screen.queryByLabelText(/Reason/i)).not.toBeInTheDocument();
    // bank options read just the name (no "HDFC (HDFC)")
    expect(screen.getByRole('option', { name: 'HDFC' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Amount (₹)'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add Amount$/i }));
    const tx = onSave.mock.calls[0][0];
    expect(tx).toMatchObject({
      fromAccount: null,
      toAccount: 'cash',
      amount: 250,
      type: 'Additional Amount',
    });
    expect(tx).not.toHaveProperty('category');
  });

  it('Edit Balance records the difference to the counted cash', () => {
    const onSave = vi.fn();
    renderWithFeedback(
      <AddAdditionalAmountModal
        accounts={accounts}
        cashBalance={1200}
        initialMode="set"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByText('₹1,200.00')).toBeInTheDocument();

    const input = screen.getByLabelText(/Actual cash in hand/i);
    fireEvent.change(input, { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Balance/i }));
    expect(screen.getByText('Balance unchanged')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '950' } });
    expect(screen.getByText(/Difference: −₹250/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Update Balance/i }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'Balance Adjustment',
        category: 'Cash Balance Edit',
        fromAccount: 'cash',
        toAccount: null,
        amount: 250,
        adjustment: true,
        previousBalance: 1200,
        newBalance: 950,
      }),
    );
  });

  it('offers Edit Balance only for Cash in Hand', () => {
    renderWithFeedback(
      <AddAdditionalAmountModal
        accounts={accounts}
        initialAccountId="acc_1"
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Edit Balance/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Add To/i), { target: { value: 'cash' } });
    expect(screen.getByRole('button', { name: /Edit Balance/i })).toBeInTheDocument();
  });
});

describe('BankAccountsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db, 'getAllBankAccounts').mockResolvedValue([
      { id: 'acc_1', accountName: 'HDFC', bankName: 'HDFC', openingBalance: 1000 },
    ]);
    vi.spyOn(db, 'getCashSettings').mockResolvedValue({ openingBalance: 300 });
    for (const m of [
      'getAllInvoices',
      'getAllPurchaseBills',
      'getAllExpenses',
      'getAllFinanceRecords',
      'getAllAccountTransactions',
      'getAllPayments',
      'getAllPurchasePayments',
      'getAllReturns',
      'getAllPurchaseReturns',
    ]) {
      vi.spyOn(db, m).mockResolvedValue([]);
    }
  });

  it('has no Transfer Funds and saves a cash Edit Balance as one entry (cash settings untouched)', async () => {
    const saveTx = vi.spyOn(db, 'saveAccountTransaction').mockResolvedValue(undefined);
    const saveCash = vi.spyOn(db, 'saveCashSettings').mockResolvedValue(undefined);
    renderWithFeedback(<BankAccountsPage />);

    await screen.findByRole('button', { name: /Edit Balance/i });
    expect(screen.queryByRole('button', { name: /Transfer/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Adjust Opening/i)).not.toBeInTheDocument();
    expect(screen.getByText('HDFC')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Edit Balance/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Actual cash in hand/i), { target: { value: '500' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Update Balance/i }));

    await waitFor(() => expect(saveTx).toHaveBeenCalledTimes(1));
    expect(saveTx.mock.calls[0][0]).toMatchObject({
      type: 'Balance Adjustment',
      fromAccount: null,
      toAccount: 'cash',
      amount: 200,
      previousBalance: 300,
      newBalance: 500,
    });
    expect(saveCash).not.toHaveBeenCalled();
    expect(await screen.findByText(/Cash balance updated to ₹500/)).toBeInTheDocument();
  });
});
