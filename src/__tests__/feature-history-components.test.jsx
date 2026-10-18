import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddPaymentSheet } from '@/features/history/components/AddPaymentSheet';
import { DeleteInvoiceSheet } from '@/features/history/components/DeleteInvoiceSheet';
import { HistoryFilterBar } from '@/features/history/components/HistoryFilterBar';
import { HistoryInvoiceCard } from '@/features/history/components/HistoryInvoiceCard';
import { HistoryInvoiceTable } from '@/features/history/components/HistoryInvoiceTable';
import { EMPTY_FILTERS, SALES_LABELS } from '@/features/history/lib/types';

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
    expect(screen.getByText('Invoice #101')).toBeInTheDocument();
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
    fireEvent.click(screen.getByLabelText('Delete invoice 101'));
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
    fireEvent.change(screen.getByLabelText(/Type the invoice number/), { target: { value: '102' } });
    expect(button).toBeDisabled();
    expect(screen.getByText('Invoice number does not match')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Type the invoice number/), { target: { value: '101' } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('AddPaymentSheet', () => {
  it('rejects an empty amount inline and submits the split amounts', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
    render(<AddPaymentSheet open invoiceNo="101" balanceDue={600} onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Payment' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a valid payment amount');
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Cash amount'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('UPI amount'), { target: { value: '50' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Add Payment' })[0]);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ cash: 250, upi: 50, account: 0 });
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
    fireEvent.change(screen.getByLabelText('From invoice number'), { target: { value: '1a2' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY_FILTERS, fromInvoiceNo: '12' });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters' }));
    expect(onClear).toHaveBeenCalled();
  });
});
