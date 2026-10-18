import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { AddPaymentSheet } from '@/features/history/components/AddPaymentSheet';
import { ReturnSheet } from '@/features/history/components/ReturnSheet';
import { ReturnStatusSheet } from '@/features/history/components/ReturnStatusSheet';
import { DeleteInvoiceSheet } from '@/features/history/components/DeleteInvoiceSheet';
import { HistoryFilterBar } from '@/features/history/components/HistoryFilterBar';
import { HistoryInvoiceCard } from '@/features/history/components/HistoryInvoiceCard';
import { HistoryInvoiceTable } from '@/features/history/components/HistoryInvoiceTable';
import { EMPTY_FILTERS, SALES_LABELS } from '@/features/history/lib/types';

vi.mock('@/features/finance/accountsLogic', () => ({ loadLiveAccountBalances: vi.fn() }));
const HDFC = { id: 'b1', accountName: 'HDFC', bankName: 'HDFC', currentBalance: 5000 };
const SBI = { id: 'b2', accountName: 'Current A/c', bankName: 'SBI', currentBalance: 9000 };
const balances = (bankAccounts) =>
  vi.mocked(loadLiveAccountBalances).mockResolvedValue({ cashBalance: 10000, bankAccounts });
beforeEach(() => balances([]));

const invoice = (over = {}) => ({
  invoiceNo: '101',
  invoiceDate: '2026-09-30',
  partyName: 'Ravi Stores',
  partyPhone: '9876543210',
  partyAddress: '',
  products: [{ description: 'Cotton saree', qty: 2, rate: 500 }],
  subtotal: 1000,
  previousBalance: 0,
  discountAmount: 0,
  grandTotal: 1000,
  amountPaid: 400,
  balanceDue: 600,
  payments: [
    { id: 'p1', paymentDate: '2026-09-30', amount: 400, paymentMethod: 'cash', paymentType: 'initial' },
  ],
  returns: [],
  totalReturns: 0,
  adjustedBalanceDue: 600,
  canAddPayment: true,
  ...over,
});

const makeActions = () => ({
  edit: vi.fn(),
  remove: vi.fn(),
  addPayment: vi.fn(),
  addReturn: vi.fn(),
  downloadStatement: vi.fn(),
  shareStatement: vi.fn(),
  viewPayments: vi.fn(),
  viewReturns: vi.fn(),
  open: vi.fn(),
});

describe('HistoryInvoiceCard', () => {
  it('shows the invoice figures and fires the actions with the invoice number', () => {
    const actions = makeActions();
    render(<HistoryInvoiceCard invoice={invoice()} labels={SALES_LABELS} actions={actions} />);
    expect(screen.getByText('Invoice No 101')).toBeInTheDocument();
    expect(screen.getByText('Ravi Stores')).toBeInTheDocument();
    expect(screen.getByText('Balance Due:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Payment' }));
    fireEvent.click(screen.getByRole('button', { name: /Payment History/ }));
    expect(actions.edit).toHaveBeenCalledWith('101');
    expect(actions.addPayment).toHaveBeenCalledWith('101');
    expect(actions.viewPayments).toHaveBeenCalledWith('101');
  });

  it('offers Add Payment only on the latest invoice of the party', () => {
    render(
      <HistoryInvoiceCard
        invoice={invoice({ canAddPayment: false })}
        labels={SALES_LABELS}
        actions={makeActions()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Add Payment' })).toBeNull();
  });
});

describe('HistoryInvoiceTable', () => {
  it('opens the detail on row click but not when an icon action is used', () => {
    const actions = makeActions();
    render(<HistoryInvoiceTable invoices={[invoice()]} labels={SALES_LABELS} actions={actions} />);
    fireEvent.click(screen.getByLabelText('Delete Invoice No 101'));
    expect(actions.remove).toHaveBeenCalledWith('101');
    expect(actions.open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Ravi Stores'));
    expect(actions.open).toHaveBeenCalledWith('101');
  });
});

describe('DeleteInvoiceSheet', () => {
  it('enables the delete button only after the invoice number is typed', () => {
    const onConfirm = vi.fn();
    render(<DeleteInvoiceSheet open invoiceNo="101" onClose={() => {}} onConfirm={onConfirm} />);
    const button = screen.getByRole('button', { name: /Move to Recycle Bin/ });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type the Invoice No/), { target: { value: '102' } });
    expect(button).toBeDisabled();
    expect(screen.getByText('Invoice No does not match')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Type the Invoice No/), { target: { value: '101' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('AddPaymentSheet', () => {
  it('rejects an empty amount inline and submits the Cash / Account split (no UPI field)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<AddPaymentSheet open invoiceNo="101" balanceDue={600} onClose={() => {}} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText('UPI amount')).toBeNull();
    expect(screen.queryByText(/UPI/i)).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Payment' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a valid payment amount');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Cash amount'), { target: { value: '250' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Payment' })[0]);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    // a cash-only payment carries no bank account
    expect(onSubmit.mock.calls[0][0]).toEqual({
      cash: 250,
      account: 0,
      bankAccountId: null,
      paymentDate: expect.any(String),
    });
  });

  it('an Account amount goes to the picked bank account', async () => {
    balances([HDFC, SBI]);
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<AddPaymentSheet open invoiceNo="101" balanceDue={600} onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Account amount'), { target: { value: '100' } });
    const select = await screen.findByLabelText('Deposit received payment to Account');
    fireEvent.change(select, { target: { value: 'b2' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Payment' })[0]);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ cash: 0, account: 100, bankAccountId: 'b2' });
  });
});

describe('ReturnSheet (refund only)', () => {
  const sheet = (onSubmit, over = {}) =>
    render(
      <ReturnSheet
        open
        invoiceNo="101"
        labels={SALES_LABELS}
        partyName="Ravi Stores"
        invoiceDate="2026-09-30"
        products={[{ description: 'Cotton saree', qty: 2, rate: 500 }]}
        balanceDue={600}
        returns={[]}
        onClose={() => {}}
        onSubmit={onSubmit}
        {...over}
      />,
    );

  it('Cash is the default; the summary shows the refund and that the bill balance stays; no balance adjustment', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    sheet(onSubmit);
    expect(screen.getByRole('radio', { name: 'Cash' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Return Amount:')).toBeInTheDocument();
    expect(screen.getByText('Refund (Cash):')).toBeInTheDocument();
    expect(screen.getByText('Bill balance due stays ₹600.00')).toBeInTheDocument();
    expect(screen.queryByText(/Adjust/i)).toBeNull();
    expect(screen.queryByText(/UPI/i)).toBeNull();
    // no bank account at all: Account cannot be chosen, with a hint
    expect(await screen.findByText(/No bank account yet/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Account' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Save Return/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      settlementType: 'refund',
      refundMethod: 'cash',
      bankAccountId: null,
    });
  });

  it('Account with a single bank account: no picker, the refund goes to that account', async () => {
    balances([HDFC]);
    const onSubmit = vi.fn().mockResolvedValue(null);
    sheet(onSubmit);
    const account = screen.getByRole('radio', { name: 'Account' });
    await waitFor(() => expect(account).toBeEnabled());
    fireEvent.click(account);
    expect(await screen.findByText('HDFC available:')).toBeInTheDocument();
    expect(screen.queryByLabelText('Refund from Account')).toBeNull();
    expect(screen.getByText('Refund (Account):')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save Return/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ refundMethod: 'bank', bankAccountId: 'b1' });
  });

  it('Account with several bank accounts: pick one', async () => {
    balances([HDFC, SBI]);
    const onSubmit = vi.fn().mockResolvedValue(null);
    sheet(onSubmit);
    const account = screen.getByRole('radio', { name: 'Account' });
    await waitFor(() => expect(account).toBeEnabled());
    fireEvent.click(account);
    fireEvent.change(await screen.findByLabelText('Refund from Account'), { target: { value: 'b2' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Return/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ refundMethod: 'bank', bankAccountId: 'b2' });
  });
});

describe('ReturnStatusSheet', () => {
  it('shows Cash / Account refunds with the account name and keeps the badge of older balance adjustments', async () => {
    vi.spyOn(db, 'getAllBankAccounts').mockResolvedValue([HDFC, SBI]);
    const base = { qty: 1, rate: 100, returnAmount: 100, description: 'Saree', returnDate: '2026-10-01' };
    render(
      <ReturnStatusSheet
        open
        invoiceNo="101"
        partyName="Ravi Stores"
        returns={[
          { ...base, id: 'old' },
          { ...base, id: 'cash', settlementType: 'refund', refundMethod: 'cash' },
          { ...base, id: 'bank', settlementType: 'refund', refundMethod: 'bank', bankAccountId: 'b2' },
          { ...base, id: 'noType', refundMethod: 'bank', bankAccountId: 'b1' },
        ]}
        onClose={() => {}}
        onUndo={() => {}}
        onUndoAll={() => {}}
      />,
    );
    expect(screen.getByText('Bill Balance Adjustment')).toBeInTheDocument();
    expect(screen.getByText('Cash Refund')).toBeInTheDocument();
    expect(await screen.findByText('Account Refund: Current A/c')).toBeInTheDocument();
    expect(screen.getByText('Account Refund: HDFC')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe('HistoryFilterBar', () => {
  it('edits the draft and applies it on Search / clears on Clear Filters', () => {
    const onChange = vi.fn();
    const onSearch = vi.fn();
    const onClear = vi.fn();
    render(
      <HistoryFilterBar
        value={EMPTY_FILTERS}
        onChange={onChange}
        onSearch={onSearch}
        onClear={onClear}
        labels={SALES_LABELS}
      />,
    );
    fireEvent.change(screen.getByLabelText('Search invoices'), { target: { value: 'ravi' } });
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTERS, search: 'ravi' });
    fireEvent.change(screen.getByLabelText('From Invoice No'), { target: { value: '1a2' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, fromInvoiceNo: '12' });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(onClear).toHaveBeenCalled();
  });
});
