import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db';
import CustomerDetailsPage from '@/features/customerDetails/CustomerDetailsPage';
import { buildSupplierStatTiles, toSupplierRow } from '@/features/purchase/components/supplierParty';
import SupplierDetailsPage from '@/features/purchase/pages/SupplierDetailsPage';
import { exportSuppliersCsv } from '@/features/purchase/supplierExport';
import { FeedbackProvider } from '@/ui';

vi.mock('@/features/purchase/supplierExport', () => ({ exportSuppliersCsv: vi.fn() }));

const LONG_ADDRESS = 'Avinashi Road, Peelamedu, Coimbatore 641004';
const bill = (over) => ({ invoiceDate: '2026-10-01', supplierAddress: '', products: [], ...over });
const BILLS = [
  bill({
    invoiceNo: 'P-12',
    invoiceDate: '2026-10-05',
    supplierName: 'ABC Mills',
    supplierPhone: '9000000001',
    supplierAddress: LONG_ADDRESS,
    subtotal: 3000,
    grandTotal: 3000,
    payment: { cash: 1000, account: 400, totalPaid: 1400 },
  }),
  bill({
    invoiceNo: '003',
    supplierName: 'XYZ Tex',
    supplierPhone: '9222222222',
    supplierAddress: 'Salem',
    subtotal: 200,
    grandTotal: 200,
    payment: { cash: 200, account: 0, totalPaid: 200 },
  }),
];
const PURCHASE_RETURNS = [{ id: 'pr1', invoiceNo: 'P-12', returnDate: '2026-10-06', returnAmount: 100 }];

// the customer fixture of the consistency checks: the same shape of data (one owing party with returns, one settled)
const INVOICES = [
  {
    invoiceNo: '12',
    invoiceDate: '2026-10-01',
    customerName: 'Ravi Textiles',
    customerPhone: '9876543210',
    customerAddress: 'Tiruppur',
    products: [],
    subtotal: 1500,
    grandTotal: 1500,
    amountPaid: 400,
    discountAmount: 0,
  },
  {
    invoiceNo: '11',
    invoiceDate: '2026-09-01',
    customerName: 'Kumar Silks',
    customerPhone: '9123456780',
    customerAddress: 'Erode',
    products: [],
    subtotal: 1000,
    grandTotal: 1000,
    amountPaid: 1000,
    discountAmount: 0,
  },
];
const SALES_RETURNS = [{ id: 'r1', invoiceNo: '12', returnDate: '2026-10-02', returnAmount: 100 }];

const setWidth = (width) =>
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
  });

function Location() {
  const { pathname, search } = useLocation();
  return <p>at {`${pathname}${search}`}</p>;
}

function shell(path) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <FeedbackProvider>
        <Routes>
          <Route path="/purchase/suppliers" element={<SupplierDetailsPage />} />
          <Route path="/sales/customers" element={<CustomerDetailsPage />} />
          <Route path="/purchase/history" element={<Location />} />
        </Routes>
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

async function renderSuppliers({
  bills = BILLS,
  returns = PURCHASE_RETURNS,
  path = '/purchase/suppliers',
} = {}) {
  vi.spyOn(db, 'getAllPurchaseBills').mockResolvedValue(bills);
  vi.spyOn(db, 'getAllPurchaseReturns').mockResolvedValue(returns);
  vi.spyOn(db, 'getAllSuppliers').mockResolvedValue([]);
  shell(path);
  await screen.findByRole('heading', { name: 'Supplier List' });
}

async function renderCustomers() {
  vi.spyOn(db, 'getAllInvoices').mockResolvedValue(INVOICES);
  vi.spyOn(db, 'getAllReturns').mockResolvedValue(SALES_RETURNS);
  vi.spyOn(db, 'getAllCustomers').mockResolvedValue([]);
  shell('/sales/customers');
  await screen.findByRole('heading', { name: 'Customer List' });
}

beforeEach(() => setWidth(1280));
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(exportSuppliersCsv).mockReset();
  setWidth(1024);
});

describe('Supplier Details page (shared party layout)', () => {
  it('desktop: Export in the header, the search toolbar, 7 status cards and the shared table', async () => {
    await renderSuppliers();
    expect(screen.getByRole('heading', { level: 1, name: 'Supplier Details' })).toBeInTheDocument();
    const toolbar = within(screen.getByRole('search'));
    expect(toolbar.getByRole('searchbox', { name: 'Search suppliers' })).toBeInTheDocument();
    expect(toolbar.getByRole('button', { name: 'Search' })).toHaveClass('bg-gold-sheen');
    expect(toolbar.getByRole('button', { name: 'Clear' })).toHaveClass('bg-amber-50');

    const grid = screen.getByText('Total Balance').closest('.grid');
    expect(
      within(grid)
        .getAllByText(/^Total /)
        .map((el) => el.textContent),
    ).toEqual([
      'Total Suppliers',
      'Total Invoices',
      'Total Amount',
      'Total Paid',
      'Total Discount',
      'Total Returns',
      'Total Balance',
    ]);
    expect(within(grid).getByText('-₹100.00')).toHaveClass('text-amber-700');
    expect(within(grid).getByText('₹1,600.00')).toHaveClass('text-emerald-700');

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Supplier Name',
      'Phone',
      'Address',
      'Total Invoices',
      'Opening Balance',
      'Total Amount',
      'Amount Paid',
      'Discount',
      'Returns',
      'Balance Due',
    ]);
    const abc = within(screen.getByText('ABC Mills').closest('tr'));
    expect(abc.getByRole('img', { name: 'This supplier has returns' })).toBeInTheDocument();
    expect(abc.getAllByText(/^₹/).at(-1).closest('.rounded-full')).toHaveClass('bg-red-50');
  });

  it('opens already searching for ?phone=', async () => {
    await renderSuppliers({ path: '/purchase/suppliers?phone=9222222222' });
    expect(screen.getByRole('searchbox', { name: 'Search suppliers' })).toHaveValue('9222222222');
    expect(screen.getByText('XYZ Tex')).toBeInTheDocument();
    expect(screen.queryByText('ABC Mills')).toBeNull();
  });

  it('Search / Clear filter the list; a search with no match says so', async () => {
    await renderSuppliers();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search suppliers' }), {
      target: { value: 'salem' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByText('XYZ Tex')).toBeInTheDocument();
    expect(screen.queryByText('ABC Mills')).toBeNull();
    // the status cards sum the suppliers shown, like Customer Details
    expect(screen.getByText('Total Suppliers').previousElementSibling).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('ABC Mills')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search suppliers' }), {
      target: { value: 'zzz' },
    });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByRole('heading', { name: 'No Suppliers Found' })).toBeInTheDocument();
    expect(screen.getByText('No supplier matches your search.')).toBeInTheDocument();
  });

  it('Export writes every supplier (not just the searched ones); with no data it says there is nothing', async () => {
    await renderSuppliers();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(exportSuppliersCsv).toHaveBeenCalledTimes(1);
    expect(vi.mocked(exportSuppliersCsv).mock.calls[0][0].map((s) => s.name)).toEqual([
      'ABC Mills',
      'XYZ Tex',
    ]);
    cleanup();
    vi.mocked(exportSuppliersCsv).mockClear();

    await renderSuppliers({ bills: [], returns: [] });
    expect(
      screen.getByText('Add suppliers or create purchase bills to see supplier data here'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByText('Nothing to export')).toBeInTheDocument();
    expect(exportSuppliersCsv).not.toHaveBeenCalled();
  });

  it('the invoice count lists the bills and opens one in Purchase History', async () => {
    await renderSuppliers();
    const abc = within(screen.getByText('ABC Mills').closest('tr'));
    fireEvent.click(abc.getByRole('button', { name: /^View the 1 invoices of ABC Mills/ }));
    const dialog = await screen.findByRole('dialog', { name: "ABC Mills's Invoices" });
    fireEvent.click(within(dialog).getByRole('button', { name: '012' }));
    expect(await screen.findByText('at /purchase/history?search=012')).toBeInTheDocument();
  });

  it('phone numbers stay masked until tapped; a long address expands on tap', async () => {
    await renderSuppliers();
    const abc = within(screen.getByText('ABC Mills').closest('tr'));
    fireEvent.click(abc.getByRole('button', { name: 'Phone *******001' }));
    expect(abc.getByRole('button', { name: 'Phone 9000000001' })).toBeInTheDocument();
    const address = abc.getByRole('button', { name: `Address ${LONG_ADDRESS}` });
    expect(address).toHaveTextContent(`${LONG_ADDRESS.slice(0, 30)}...`);
    fireEvent.click(address);
    expect(address).toHaveTextContent(LONG_ADDRESS);
  });

  it('phones: cards instead of the table', async () => {
    setWidth(360);
    await renderSuppliers();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('heading', { level: 3, name: 'ABC Mills' })).toBeInTheDocument();
  });
});

describe('supplier → shared party mapping', () => {
  it('stat tiles: same keys, labels and tones as the customer tiles', () => {
    const tiles = buildSupplierStatTiles({
      totalSuppliers: 2,
      totalBills: 3,
      totalAmount: 1500,
      totalPaid: 0,
      totalDiscount: 0,
      totalBalance: -10,
    });
    expect(tiles.map((t) => [t.key, t.label, t.value, t.hint, t.tone])).toEqual([
      ['parties', 'Total Suppliers', '2', undefined, 'info'],
      ['invoices', 'Total Invoices', '3', undefined, 'info'],
      ['amount', 'Total Amount', '₹1,500.00', '(1.50 K)', 'brand'],
      ['paid', 'Total Paid', '₹0.00', undefined, 'success'],
      ['discount', 'Total Discount', '₹0.00', undefined, 'neutral'],
      // no returns card without returns; an advance with the supplier is green
      ['balance', 'Total Balance', '₹-10.00', undefined, 'success'],
    ]);
  });

  it('toSupplierRow formats the aggregated supplier', () => {
    const s = {
      key: 'p:9000000001',
      name: 'ABC Mills',
      phone: '9000000001',
      address: 'Coimbatore',
      totalBills: 2,
      totalAmount: 1500,
      totalPaid: 400,
      totalDiscount: 50,
      totalReturns: 0,
      openingBalance: 60,
      allInvoiceNumbers: ['012', '009'],
      balanceDue: 1110,
    };
    expect(toSupplierRow(s)).toEqual({
      key: 'p:9000000001',
      name: 'ABC Mills',
      phone: '9000000001',
      address: 'Coimbatore',
      invoiceCount: '2',
      invoiceNumbers: ['012', '009'],
      openingBalance: '₹60.00',
      amount: '₹1,500.00',
      paid: '₹400.00',
      discount: '₹50.00',
      returns: '₹0.00',
      balance: '₹1,110.00',
      balanceValue: 1110,
      hasReturns: false,
      source: s,
    });
  });
});

/** Structure + styling fingerprint of a rendered party details page (party names normalised). */
function fingerprint() {
  const party = (text) =>
    text.replace(/Customers?|Suppliers?/g, 'Party').replace(/customers?|suppliers?/g, 'party');
  const grid = screen.getByText('Total Balance').closest('.grid');
  const tiles = within(grid)
    .getAllByText(/^Total /)
    .map((label) => {
      const card = label.closest('.shadow-card');
      return {
        label: party(label.textContent),
        valueClass: label.previousElementSibling.className,
        iconClass: card.querySelector('.ring-inset').className,
        cellClass: card.parentElement.className,
        hasHint: label.nextElementSibling !== null,
      };
    });
  const toolbar = screen.getByRole('search');
  const listHeading = screen.getByRole('heading', { name: /List$/ });
  return {
    pageWrap: screen.getByRole('heading', { level: 1 }).closest('.mx-auto').className,
    exportButton: screen.getByRole('button', { name: 'Export' }).className,
    toolbarClass: toolbar.className,
    toolbar: within(toolbar)
      .getAllByRole('button')
      .map((b) => [b.textContent, b.className]),
    // both start the same way; customers also match invoice numbers
    searchPlaceholderStart: party(within(toolbar).getByRole('searchbox').getAttribute('placeholder')).slice(
      0,
      24,
    ),
    gridClass: grid.className,
    tiles,
    listHeading: [party(listHeading.textContent), listHeading.className],
    countBadge: listHeading.parentElement.lastElementChild.className,
  };
}

describe('Customer Details and Supplier Details share one design', () => {
  it('same page frame, header action, toolbar, status cards (labels, order, tones, hints, grid) and list heading', async () => {
    await renderCustomers();
    const customers = fingerprint();
    cleanup();
    await renderSuppliers();
    const suppliers = fingerprint();
    expect(suppliers).toEqual(customers);
    // and the Total Balance card (owed on both) is red and fills the last row of the 7-card grid
    const balance = suppliers.tiles.at(-1);
    expect(balance.valueClass).toContain('text-red-600');
    expect(balance.cellClass).toContain('col-span-2');
  });

  it('same table: identical columns and cell styling; customers add the reminder as the last (action) column', async () => {
    const tableOf = () => ({
      headers: screen.getAllByRole('columnheader').map((th) => [th.textContent, th.dataset.align]),
      frame: screen.getByRole('table').parentElement.className,
      table: screen.getByRole('table').className,
    });
    await renderCustomers();
    const customers = tableOf();
    cleanup();
    await renderSuppliers();
    const suppliers = tableOf();

    expect(customers.frame).toBe(suppliers.frame);
    expect(customers.table).toBe(suppliers.table);
    const rename = ([h, align]) => [h.replace(/^(Customer|Supplier) Name$/, 'Party Name'), align];
    expect(customers.headers.slice(0, -1).map(rename)).toEqual(suppliers.headers.map(rename));
    expect(customers.headers.at(-1)).toEqual(['Reminder', 'center']);
  });

  it('phones: the same card design on both pages', async () => {
    setWidth(360);
    const cardOf = () => {
      const heading = screen.getAllByRole('heading', { level: 3 })[0];
      const card = heading.closest('.shadow-card');
      return {
        card: card.className,
        list: card.closest('ul').className,
        rows: within(card)
          .getAllByText(
            /^(Total Invoices|Opening Balance|Total Amount|Amount Paid|Discount|Returns|Balance Due)$/,
          )
          .map((el) => el.textContent),
        contact: within(card)
          .getAllByRole('button', { name: /^(Phone|Address) / })
          .map((b) => b.getAttribute('aria-label').split(' ')[0]),
      };
    };
    await renderCustomers();
    const customers = cardOf();
    cleanup();
    await renderSuppliers();
    const suppliers = cardOf();
    expect(suppliers).toEqual(customers);
  });
});
