import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db';
import { FeedbackProvider } from '@/ui';
import PurchaseBillPage from '@/features/purchase/pages/PurchaseBillPage';
import PurchaseEditPage from '@/features/purchase/pages/PurchaseEditPage';

const shell = (path, route, element) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FeedbackProvider>
        <Routes>
          <Route path={route} element={element} />
        </Routes>
      </FeedbackProvider>
    </MemoryRouter>,
  );

const mockReads = () => {
  vi.spyOn(db, 'getAllSuppliers').mockResolvedValue([
    { phone: '9876543210', name: 'Ravi Yarns', address: 'Tirupur' },
  ]);
  vi.spyOn(db, 'getAllPurchaseBills').mockResolvedValue([]);
  vi.spyOn(db, 'getAllShortcuts').mockResolvedValue([{ shortcutKey: 'c', fullDescription: 'Cotton' }]);
};

afterEach(() => vi.restoreAllMocks());

describe('Purchase Bill page', () => {
  it('renders the invoice, supplier, products and summary sections with Save + Share actions', async () => {
    mockReads();
    shell('/purchase/bill', '/purchase/bill', <PurchaseBillPage />);
    expect(await screen.findByText('Bill Summary')).toBeInTheDocument();
    expect(screen.getByText('Supplier')).toBeInTheDocument();
    expect(screen.getByText('Current Bill Subtotal')).toBeInTheDocument();
    expect(screen.getAllByText('Save Purchase Bill').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Share Acknowledgement').length).toBeGreaterThan(0);
  });
});

describe('Edit Purchase page', () => {
  it('loads the bill from the route parameter and locks the invoice number', async () => {
    vi.spyOn(db, 'getPurchaseBill').mockResolvedValue({
      invoiceNo: 'P-005',
      invoiceDate: '2026-09-30',
      supplierPhone: '9876543210',
      supplierName: 'Ravi Yarns',
      supplierAddress: 'Tirupur',
      products: [{ description: 'Cotton', qty: 2, rate: 100 }],
      previousBalance: 0,
    });
    vi.spyOn(db, 'getPurchasePaymentsByInvoice').mockResolvedValue([]);
    vi.spyOn(db, 'getAllShortcuts').mockResolvedValue([]);
    shell('/purchase/edit/P-005', '/purchase/edit/:invoiceNo', <PurchaseEditPage />);
    await waitFor(() => expect(screen.getByDisplayValue('P-005')).toBeInTheDocument());
    expect(screen.getByDisplayValue('P-005')).toHaveAttribute('readonly');
    expect(screen.getAllByText('Update Purchase Bill').length).toBeGreaterThan(0);
    expect(db.getPurchaseBill).toHaveBeenCalledWith('P-005');
  });

  it('shows a not-found state for an unknown bill', async () => {
    vi.spyOn(db, 'getPurchaseBill').mockResolvedValue(null);
    vi.spyOn(db, 'getAllShortcuts').mockResolvedValue([]);
    shell('/purchase/edit/X1', '/purchase/edit/:invoiceNo', <PurchaseEditPage />);
    expect(await screen.findByText('Purchase bill not found')).toBeInTheDocument();
  });
});
