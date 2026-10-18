import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductRowsEditor } from '@/components/bill';
import { db } from '@/core/db';
import { invalidateStocksCache } from '@/features/overview/stocks/stocksService';
import { InvoiceProducts } from '@/features/history/components/InvoiceParts';
import { ReturnSheet } from '@/features/history/components/ReturnSheet';
import { ReturnStatusSheet } from '@/features/history/components/ReturnStatusSheet';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { SALES_LABELS } from '@/features/history/lib/types';

vi.mock('@/features/finance/accountsLogic', () => ({ loadLiveAccountBalances: vi.fn() }));

/** stock: 80 kg / 12 rolls of "Cotton Grey" (bought), "Yarn" never counted in rolls */
const mockStock = () => {
  vi.spyOn(db, 'getAllPurchaseBills').mockResolvedValue([
    {
      invoiceNo: 'P-1',
      invoiceDate: '2026-10-01',
      products: [
        { description: 'Cotton Grey', qty: 80, rolls: 12, rate: 100, amount: 8000 },
        { description: 'Yarn', qty: 5, rate: 10, amount: 50 },
      ],
    },
  ]);
  vi.spyOn(db, 'getAllInvoices').mockResolvedValue([]);
  vi.spyOn(db, 'getAllOpeningStocks').mockResolvedValue([]);
  vi.spyOn(db, 'getAllProductMetadata').mockResolvedValue([]);
  vi.spyOn(db, 'getAllReturns').mockResolvedValue([]);
  vi.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue([]);
};

const setWidth = (width) =>
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
  });

beforeEach(() => {
  invalidateStocksCache();
  vi.mocked(loadLiveAccountBalances).mockResolvedValue({ cashBalance: 10000, bankAccounts: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  invalidateStocksCache();
  setWidth(1024);
});

describe('ProductRowsEditor rolls', () => {
  const rows = [
    { description: 'Cotton Grey', rolls: '4', qty: '30', rate: '100' },
    { description: 'Yarn', rolls: '', qty: '2', rate: '10' },
  ];

  it('desktop: a Rolls column (digits only) with the rolls in stock; totals of qty and rolls underneath', async () => {
    mockStock();
    const onChange = vi.fn();
    render(<ProductRowsEditor rows={rows} onChange={onChange} shortcuts={null} />);
    expect(screen.getByRole('columnheader', { name: 'Rolls' })).toBeInTheDocument();
    const rolls = screen.getByLabelText('Rolls of item 1');
    expect(rolls).toHaveValue('4');
    expect(rolls).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText('Rolls of item 2')).toHaveValue('');
    fireEvent.change(rolls, { target: { value: '12.5' } });
    expect(onChange).toHaveBeenLastCalledWith([{ ...rows[0], rolls: '125' }, rows[1]]);
    // stock hints: the roll product shows kg + rolls, the other one only its quantity, as before
    expect(await screen.findByText('12 rolls')).toBeInTheDocument();
    expect(screen.getByText('Stock: 80 kg')).toBeInTheDocument();
    expect(screen.getByText('Stock: 5')).toBeInTheDocument();
    expect(screen.getByText(/In Stock: 80 kg · 12 rolls/)).toBeInTheDocument();
    // the amount is still qty x rate
    expect(screen.getByText('₹3,000.00')).toBeInTheDocument();
    expect(screen.getByText(/Total Rolls:/).parentElement).toHaveTextContent('Total Qty: 32·Total Rolls: 4');
  });

  it('phone: Rolls / Qty / Rate inputs and one stock line "Stock: 80 kg · 12 rolls"', async () => {
    mockStock();
    setWidth(375);
    render(<ProductRowsEditor rows={rows} onChange={() => {}} shortcuts={null} />);
    expect(screen.getByLabelText('Rolls of item 1')).toHaveValue('4');
    expect(screen.getByLabelText('Quantity of item 1')).toHaveValue('30');
    expect(await screen.findByText('Stock: 80 kg · 12 rolls')).toBeInTheDocument();
  });

  it('no total line when no row has rolls', () => {
    mockStock();
    render(<ProductRowsEditor rows={[rows[1]]} onChange={() => {}} shortcuts={null} />);
    expect(screen.queryByText(/Total Rolls/)).toBeNull();
  });
});

describe('returns and invoice details show rolls', () => {
  it('ReturnSheet: each return line has an optional Rolls box that is submitted with the line', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null);
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
      />,
    );
    fireEvent.change(screen.getByLabelText('Rolls'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Return/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].items[0]).toMatchObject({ rolls: '3' });
  });

  it('ReturnStatusSheet: "Rolls" only for a return that has them', () => {
    vi.spyOn(db, 'getAllBankAccounts').mockResolvedValue([]);
    const base = { qty: 1, rate: 100, returnAmount: 100, description: 'Saree', returnDate: '2026-10-01' };
    render(
      <ReturnStatusSheet
        open
        invoiceNo="101"
        partyName="Ravi Stores"
        returns={[
          { ...base, id: 'a', rolls: 4 },
          { ...base, id: 'b', rolls: 0 },
        ]}
        onClose={() => {}}
        onUndo={() => {}}
        onUndoAll={() => {}}
      />,
    );
    expect(screen.getAllByText('Rolls:')).toHaveLength(1);
    expect(screen.getByText('Rolls:').parentElement).toHaveTextContent('Rolls: 4');
  });

  it('InvoiceProducts: a Rolls column only when a line has rolls', () => {
    const { rerender } = render(
      <InvoiceProducts invoice={{ products: [{ description: 'Saree', qty: 2, rate: 500 }] }} />,
    );
    expect(screen.queryByText('Rolls')).toBeNull();
    rerender(
      <InvoiceProducts
        invoice={{
          products: [
            { description: 'Saree', qty: 2, rolls: 6, rate: 500 },
            { description: 'Silk', qty: 1, rate: 900 },
          ],
        }}
      />,
    );
    expect(screen.getByText('Rolls')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('-')).toBeInTheDocument();
  });
});
