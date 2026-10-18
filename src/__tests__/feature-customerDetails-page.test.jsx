import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/core/db';
import CustomerDetailsPage from '@/features/customerDetails/CustomerDetailsPage';
import { toCustomerRow } from '@/features/customerDetails/customerRow';
import { FeedbackProvider } from '@/ui';

const LONG_ADDRESS = 'No. 12, Gandhi Road, Tiruppur, Tamil Nadu';
const invoice = (over) => ({
  invoiceDate: '2026-10-01',
  customerAddress: '',
  products: [],
  previousBalance: 0,
  discountAmount: 0,
  ...over,
});
const INVOICES = [
  invoice({
    invoiceNo: '12',
    customerName: 'Ravi Textiles',
    customerPhone: '9876543210',
    customerAddress: LONG_ADDRESS,
    subtotal: 1500,
    grandTotal: 1500,
    amountPaid: 400,
  }),
  invoice({
    invoiceNo: '11',
    invoiceDate: '2026-09-01',
    customerName: 'Kumar Silks',
    customerPhone: '9123456780',
    customerAddress: 'Erode',
    subtotal: 1000,
    grandTotal: 1000,
    amountPaid: 1000,
  }),
];
const RETURNS = [
  {
    id: 'r1',
    invoiceNo: '12',
    returnDate: '2026-10-02',
    description: 'Cotton',
    qty: 1,
    rate: 100,
    returnAmount: 100,
  },
];

const setWidth = (width) =>
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
  });

function Location() {
  const { pathname, search } = useLocation();
  return <p>at {`${pathname}${search}`}</p>;
}

async function renderPage({ invoices = INVOICES, returns = RETURNS } = {}) {
  vi.spyOn(db, 'getAllInvoices').mockResolvedValue(invoices);
  vi.spyOn(db, 'getAllReturns').mockResolvedValue(returns);
  vi.spyOn(db, 'getAllCustomers').mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={['/sales/customers']}>
      <FeedbackProvider>
        <Routes>
          <Route path="/sales/customers" element={<CustomerDetailsPage />} />
          <Route path="/sales/history" element={<Location />} />
        </Routes>
      </FeedbackProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'Customer List' });
}

const search = (text) => {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search customers' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
};

beforeEach(() => setWidth(1280));
afterEach(() => {
  vi.restoreAllMocks();
  setWidth(1024);
});

describe('Customer Details page (shared party layout)', () => {
  it('desktop: Export in the header, the search toolbar, 7 status cards and the shared table', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { level: 1, name: 'Customer Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export' })).toHaveClass('from-brand-600'); // ink = Export

    const toolbar = within(screen.getByRole('search'));
    expect(toolbar.getByRole('searchbox', { name: 'Search customers' })).toBeInTheDocument();
    expect(toolbar.getByRole('button', { name: 'Search' })).toHaveClass('bg-gold-sheen');
    expect(toolbar.getByRole('button', { name: 'Clear' })).toHaveClass('bg-amber-50');

    const grid = screen.getByText('Total Balance').closest('.grid');
    expect(
      within(grid)
        .getAllByText(/^Total /)
        .map((el) => el.textContent),
    ).toEqual([
      'Total Customers',
      'Total Invoices',
      'Total Amount',
      'Total Paid',
      'Total Discount',
      'Total Returns',
      'Total Balance',
    ]);

    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Customer Name',
      'Phone',
      'Address',
      'Total Invoices',
      'Opening Balance',
      'Total Amount',
      'Amount Paid',
      'Discount',
      'Returns',
      'Balance Due',
      'Reminder',
    ]);
    // a customer with nothing due gets the muted note instead of the reminder
    const kumar = within(screen.getByText('Kumar Silks').closest('tr'));
    expect(kumar.getByText('No balance/phone')).toBeInTheDocument();
    expect(kumar.queryByRole('button', { name: /WhatsApp/ })).toBeNull();
    // the list count
    expect(within(screen.getByText('Customer List').parentElement).getByText('2')).toBeInTheDocument();
  });

  it('balance due is a status badge (owed red, settled grey); returns are marked on the name', async () => {
    await renderPage();
    const ravi = within(screen.getByText('Ravi Textiles').closest('tr'));
    const owed = ravi.getAllByText(/^₹/).at(-1);
    expect(owed.closest('.rounded-full')).toHaveClass('bg-red-50');
    expect(ravi.getByRole('img', { name: 'This customer has returns' })).toBeInTheDocument();
    const kumar = within(screen.getByText('Kumar Silks').closest('tr'));
    expect(kumar.getAllByText('₹0.00').at(-1).closest('.rounded-full')).toHaveClass('bg-slate-100');
  });

  it('Search / Clear filter the list; a search with no match says so', async () => {
    await renderPage();
    search('kumar');
    expect(screen.getByText('Kumar Silks')).toBeInTheDocument();
    expect(screen.queryByText('Ravi Textiles')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Ravi Textiles')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search customers' })).toHaveValue('');

    search('zzz');
    expect(screen.getByRole('heading', { name: 'No Customers Found' })).toBeInTheDocument();
    expect(screen.getByText('No customer matches your search.')).toBeInTheDocument();
  });

  it('with no data the empty state says how to get some', async () => {
    await renderPage({ invoices: [], returns: [] });
    expect(screen.getByRole('heading', { name: 'No Customers Found' })).toBeInTheDocument();
    expect(
      screen.getByText('Add customers or create invoices to see customer data here'),
    ).toBeInTheDocument();
  });

  it('Export opens the export dialog', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(await screen.findByRole('dialog', { name: 'Export Customer Data' })).toBeInTheDocument();
  });

  it('the WhatsApp row action opens the reminder dialog for that customer', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Send WhatsApp payment reminder to Ravi Textiles' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send WhatsApp Reminder' });
    expect(within(dialog).getByText('Customer: Ravi Textiles')).toBeInTheDocument();
  });

  it('the invoice count lists the invoices and opens one in Sales History', async () => {
    await renderPage();
    const ravi = within(screen.getByText('Ravi Textiles').closest('tr'));
    fireEvent.click(ravi.getByRole('button', { name: /^View the 1 invoices of Ravi Textiles/ }));
    const dialog = await screen.findByRole('dialog', { name: "Ravi Textiles's Invoices" });
    fireEvent.click(within(dialog).getByRole('button', { name: '12' }));
    expect(await screen.findByText('at /sales/history?search=12')).toBeInTheDocument();
  });

  it('phone numbers stay masked until tapped; a long address shows its first 30 characters until tapped', async () => {
    await renderPage();
    const ravi = within(screen.getByText('Ravi Textiles').closest('tr'));
    fireEvent.click(ravi.getByRole('button', { name: 'Phone *******210' }));
    expect(ravi.getByRole('button', { name: 'Phone 9876543210' })).toHaveAttribute('aria-pressed', 'true');

    const address = ravi.getByRole('button', { name: `Address ${LONG_ADDRESS}` });
    expect(address).toHaveTextContent(`${LONG_ADDRESS.slice(0, 30)}...`);
    fireEvent.click(address);
    expect(address).toHaveTextContent(LONG_ADDRESS);
  });

  it('phones: cards instead of the table, same figures, full-width reminder at the bottom', async () => {
    setWidth(360);
    await renderPage();
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByRole('heading', { level: 3, name: 'Ravi Textiles' }).closest('.shadow-card');
    const labels = within(card)
      .getAllByText(
        /^(Total Invoices|Opening Balance|Total Amount|Amount Paid|Discount|Returns|Balance Due)$/,
      )
      .map((el) => el.textContent);
    expect(labels).toEqual([
      'Total Invoices',
      'Opening Balance',
      'Total Amount',
      'Amount Paid',
      'Discount',
      'Returns',
      'Balance Due',
    ]);
    expect(
      within(card).getByRole('button', { name: 'Send WhatsApp payment reminder to Ravi Textiles' }),
    ).toHaveTextContent('Send Reminder');
  });
});

describe('toCustomerRow (a customer summary as a shared party row)', () => {
  it('formats through the customer row model and keeps the numeric balance for its colour', () => {
    const c = {
      name: 'Ravi',
      phone: '9876543210',
      address: '',
      totalInvoices: 2,
      totalCurrentBillAmount: 1500,
      amountPaid: 400,
      totalDiscountAmount: 50,
      totalReturns: 230.25,
      allInvoiceNumbers: ['12', '11'],
    };
    expect(toCustomerRow(c)).toEqual({
      key: 'Ravi',
      name: 'Ravi',
      phone: '9876543210',
      address: '',
      invoiceCount: '2',
      invoiceNumbers: ['12', '11'],
      openingBalance: '₹0.00',
      amount: '₹1,500.00',
      paid: '₹400.00',
      discount: '₹50.00',
      returns: '₹230.25',
      balance: '₹819.75',
      balanceValue: 819.75,
      hasReturns: true,
      source: c,
    });
  });
});
