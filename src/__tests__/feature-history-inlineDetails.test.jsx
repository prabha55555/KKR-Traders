/**
 * Sales / Purchase History: every bill shows its basic details directly in the table row (desktop) and the card
 * (phones) – party contact, products, the amounts breakdown, payments, returns and the balance – without opening the
 * detail sheet, which now opens only from the explicit "Details" action.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryInvoiceCard } from '@/features/history/components/HistoryInvoiceCard';
import { HistoryInvoiceDetailSheet } from '@/features/history/components/HistoryInvoiceDetailSheet';
import {
  HistoryInvoiceGroupBody,
  HistoryInvoiceTable,
} from '@/features/history/components/HistoryInvoiceTable';
import { InvoiceSummaryBox } from '@/features/history/components/InvoiceParts';
import { SALES_LABELS } from '@/features/history/lib/types';
import { PURCHASE_LABELS, toHistoryPurchase } from '@/features/history/purchase/purchaseModel';
import { toHistoryInvoice } from '@/features/history/sales/salesModel';

const ADDRESS = '12, Big Bazaar Street, Tiruppur';

/** A sales invoice through the real view model: carried balance, discount, Cash + Account, both kinds of return. */
const salesInvoice = (over = {}, { canAddPayment = true } = {}) =>
  toHistoryInvoice(
    {
      invoiceNo: '101',
      invoiceDate: '2026-09-30',
      customerName: 'Ravi Stores',
      customerPhone: '9876543210',
      customerAddress: ADDRESS,
      products: [
        { description: 'Cotton saree', qty: 2, rolls: 1, rate: 500, amount: 1000 },
        { description: 'Silk dhoti', qty: 3, rate: 400, amount: 1200 },
      ],
      subtotal: 2200,
      previousBalance: 300,
      discountAmount: 100,
      grandTotal: 2400,
      amountPaid: 1000,
      balanceDue: 1400,
      paymentBreakdown: { cash: 600, account: 400 },
      ...over,
    },
    [
      { id: 'p1', paymentDate: '2026-09-30', amount: 600, paymentMethod: 'cash', paymentType: 'initial' },
      {
        id: 'p2',
        paymentDate: '2026-10-02',
        amount: 400,
        paymentMethod: 'account',
        paymentType: 'additional',
      },
    ],
    [
      // older return without settlement fields: deducted from the balance
      { id: 'r1', returnDate: '2026-10-03', description: 'Silk dhoti', qty: 1, rate: 200, returnAmount: 200 },
      {
        id: 'r2',
        returnDate: '2026-10-04',
        description: 'Cotton saree',
        qty: 1,
        rate: 150,
        returnAmount: 150,
        settlementType: 'refund',
        refundMethod: 'cash',
      },
    ],
    canAddPayment,
  );

/** A purchase bill through the real view model (nested payment object, "P-" prefix, rolls, a balance return). */
const purchaseBill = () =>
  toHistoryPurchase(
    {
      invoiceNo: 'P-005',
      invoiceDate: '2026-10-01',
      supplierName: 'Sri Ganesh Yarns',
      supplierPhone: '9876500000',
      supplierAddress: 'Tirupur',
      products: [{ description: 'Cotton Yarn', qty: 10, rolls: 4, rate: 750, amount: 7500 }],
      subtotal: 7500,
      previousBalance: 500,
      manualPreviousBalance: 100,
      discount: 100,
      grandTotal: 8000,
      payment: { cash: 5000, upi: 0, account: 0, totalPaid: 5000, balanceDue: 3000 },
    },
    [
      {
        id: 'pp1',
        invoiceNo: 'P-005',
        paymentDate: '2026-10-01',
        amount: 5000,
        paymentMethod: 'cash',
        paymentType: 'initial',
      },
    ],
    [
      {
        id: 'pr1',
        returnDate: '2026-10-02',
        description: 'Cotton Yarn',
        qty: 1,
        rate: 200,
        returnAmount: 200,
      },
    ],
    true,
  );

const spies = () => ({
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

/** The page wiring in small: the table, and the detail sheet driven by `actions.open`. */
function Harness({ invoices, labels, calls }) {
  const [openNo, setOpenNo] = useState(null);
  const actions = useMemo(
    () => ({
      ...calls,
      open: (no) => {
        calls.open(no);
        setOpenNo(no);
      },
    }),
    [calls],
  );
  const detail = invoices.find((i) => i.invoiceNo === openNo) ?? null;
  return (
    <>
      <HistoryInvoiceTable invoices={invoices} labels={labels} actions={actions} />
      <HistoryInvoiceDetailSheet
        invoice={detail}
        labels={labels}
        actions={actions}
        onClose={() => setOpenNo(null)}
      />
    </>
  );
}

/** [header row, bill row, products / payments row] of a one-bill table. */
const billRows = () => {
  const [header, main, details] = screen.getAllByRole('row');
  return { header, cells: within(main).getAllByRole('cell'), details };
};

const setWidth = (width) =>
  act(() => {
    window.innerWidth = width;
    window.dispatchEvent(new Event('resize'));
  });
afterEach(() => setWidth(1024));

describe('History table (desktop): the basic details are in the row, no popup needed', () => {
  it('has a header row with the amount columns, right-aligned', () => {
    render(<HistoryInvoiceTable invoices={[salesInvoice()]} labels={SALES_LABELS} actions={spies()} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual([
      'Invoice No / Customer',
      'Bill Amt',
      'Prev. Bal',
      'Discount',
      'Total',
      'Paid',
      'Returns',
      'Balance Due',
      'Actions',
    ]);
    for (const h of headers.slice(1, 8)) expect(h).toHaveAttribute('data-align', 'right');
    // the same column widths in every day's table
    const widths = [...document.querySelectorAll('col')].map((c) => c.style.width);
    expect(widths.slice(1, 8).every(Boolean)).toBe(true);
  });

  it('a sales bill: number, status, date, customer contact, every amount and the balance – sheet closed', () => {
    const calls = spies();
    render(<Harness invoices={[salesInvoice()]} labels={SALES_LABELS} calls={calls} />);
    const { cells } = billRows();
    const [bill, billAmount, previous, discount, total, paid, returns, balance] = cells;

    expect(bill).toHaveTextContent('Invoice No 101');
    expect(bill).toHaveTextContent('30/9/2026');
    expect(within(bill).getByText('Partially Paid')).toBeInTheDocument();
    expect(within(bill).getByText('Ravi Stores')).toBeInTheDocument();
    expect(within(bill).getByText('9876543210')).toBeInTheDocument();
    // the address stays on one line; the full text is in the tooltip
    expect(within(bill).getByTitle(ADDRESS)).toHaveTextContent(ADDRESS);

    expect(billAmount).toHaveTextContent('₹2,200.00');
    expect(previous).toHaveTextContent('₹300.00');
    expect(discount).toHaveTextContent('-₹100.00');
    expect(total).toHaveTextContent('₹2,400.00');
    expect(paid).toHaveTextContent('₹1,000.00');
    expect(paid).toHaveTextContent('Cash ₹600.00');
    expect(paid).toHaveTextContent('A/c ₹400.00');
    // returns: deducted from the balance vs refunded (the balance is unchanged by a refund)
    expect(returns).toHaveTextContent('-₹200.00deducted');
    expect(returns).toHaveTextContent('₹150.00refunded');
    // balance due after the returns settled on it: 1,400 - 200
    expect(balance).toHaveTextContent('₹1,200.00');
    expect(balance).toHaveTextContent('after returns');
    for (const cell of [billAmount, previous, discount, total, paid, returns, balance]) {
      expect(cell).toHaveAttribute('data-align', 'right');
    }

    expect(calls.open).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a sales bill: every product line (description · rolls · qty × rate = amount) and the payments, inline', () => {
    render(<HistoryInvoiceTable invoices={[salesInvoice()]} labels={SALES_LABELS} actions={spies()} />);
    const products = screen.getByRole('region', { name: 'Products of Invoice No 101' });
    expect(within(products).getByText('Products (2)')).toBeInTheDocument();
    const [saree, dhoti] = within(products).getAllByRole('listitem');
    expect(saree).toHaveTextContent('Cotton saree');
    expect(within(saree).getByText('1 roll')).toBeInTheDocument();
    expect(within(saree).getByText('2 × ₹500.00')).toBeInTheDocument();
    expect(within(saree).getByText('₹1,000.00')).toBeInTheDocument();
    expect(dhoti).toHaveTextContent('Silk dhoti');
    expect(within(dhoti).getByText('3 × ₹400.00')).toBeInTheDocument();
    expect(within(dhoti).getByText('₹1,200.00')).toBeInTheDocument();

    const payments = screen.getByRole('region', { name: 'Payments of Invoice No 101' });
    expect(payments).toHaveTextContent('Initial paid₹600.00');
    expect(payments).toHaveTextContent('Additional paid₹400.00');
  });

  it('shows exactly the figures of the summary box (same fields)', () => {
    const invoice = salesInvoice();
    const { unmount } = render(
      <HistoryInvoiceTable invoices={[invoice]} labels={SALES_LABELS} actions={spies()} />,
    );
    const row = billRows().cells.map((c) => c.textContent);
    unmount();
    render(<InvoiceSummaryBox invoice={invoice} />);
    const value = (label) => screen.getByText(label).nextSibling.textContent;
    expect(row[1]).toContain(value('Current Bill Amount:'));
    expect(row[2]).toContain(value('Previous Balance:'));
    expect(row[3]).toContain(value('Discount Amount:'));
    expect(row[4]).toContain(value('Total Amount:'));
    expect(row[5]).toContain(screen.getByText('Total Amount Paid:').nextSibling.textContent);
    expect(row[6]).toContain(value('Return Amount:'));
    expect(row[6]).toContain(value('Returns (refunded):'));
    expect(row[7]).toContain(value('Current Adjusted Balance Due:'));
    // the Cash / Account split is in the summary box too
    expect(value('Cash:')).toBe('₹600.00');
    expect(value('Account:')).toBe('₹400.00');
  });

  it('a purchase bill renders the same full row with the Supplier wording and no "P-" prefix', () => {
    const calls = spies();
    render(<HistoryInvoiceTable invoices={[purchaseBill()]} labels={PURCHASE_LABELS} actions={calls} />);
    expect(screen.getByRole('columnheader', { name: 'Invoice No / Supplier' })).toBeInTheDocument();
    const { cells } = billRows();
    const [bill, billAmount, previous, discount, total, paid, returns, balance] = cells;
    expect(bill).toHaveTextContent('Invoice No 005');
    expect(bill).not.toHaveTextContent('P-005');
    expect(within(bill).getByText('Sri Ganesh Yarns')).toBeInTheDocument();
    expect(within(bill).getByText('9876500000')).toBeInTheDocument();
    expect(within(bill).getByText('Partially Paid')).toBeInTheDocument();
    expect(billAmount).toHaveTextContent('₹7,500.00');
    expect(previous).toHaveTextContent('₹600.00');
    expect(discount).toHaveTextContent('-₹100.00');
    expect(total).toHaveTextContent('₹8,000.00');
    expect(paid).toHaveTextContent('₹5,000.00');
    expect(paid).toHaveTextContent('Cash ₹5,000.00');
    expect(returns).toHaveTextContent('-₹200.00');
    expect(balance).toHaveTextContent('₹2,800.00');

    const products = screen.getByRole('region', { name: 'Products of Invoice No 005' });
    const [yarn] = within(products).getAllByRole('listitem');
    expect(yarn).toHaveTextContent('Cotton Yarn');
    expect(within(yarn).getByText('4 rolls')).toBeInTheDocument();
    expect(within(yarn).getByText('10 × ₹750.00')).toBeInTheDocument();
    expect(within(yarn).getByText('₹7,500.00')).toBeInTheDocument();

    // the actions name the displayed number and pass the stored one
    fireEvent.click(screen.getByRole('button', { name: 'Edit Invoice No 005' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return History of Invoice No 005' }));
    expect(calls.edit).toHaveBeenCalledWith('P-005');
    expect(calls.viewReturns).toHaveBeenCalledWith('P-005');
  });

  it('"+N more" expands a long product list in place (no popup) and collapses it again', () => {
    const calls = spies();
    const products = ['A', 'B', 'C', 'D', 'E'].map((x, i) => ({
      description: `Fabric ${x}`,
      qty: i + 1,
      rate: 100,
      amount: (i + 1) * 100,
    }));
    render(<Harness invoices={[salesInvoice({ products })]} labels={SALES_LABELS} calls={calls} />);
    const list = screen.getByRole('region', { name: 'Products of Invoice No 101' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).queryByText('Fabric D')).toBeNull();

    const more = within(list).getByRole('button', { name: '+2 more products' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(within(list).getByText('Fabric E')).toBeInTheDocument();
    expect(within(list).getByText('5 × ₹100.00')).toBeInTheDocument();
    const less = within(list).getByRole('button', { name: 'Show less' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    expect(calls.open).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(less);
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
  });

  it('only the Details action opens the detail sheet (bill slip image, history links)', () => {
    const calls = spies();
    const slip = 'data:image/png;base64,AAAA';
    render(
      <Harness invoices={[salesInvoice({ manualBillImage: slip })]} labels={SALES_LABELS} calls={calls} />,
    );
    expect(screen.getByText('Slip Attached')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Ravi Stores'));
    fireEvent.click(screen.getByText('₹2,400.00'));
    expect(screen.queryByRole('dialog')).toBeNull();

    const details = screen.getByRole('button', { name: 'Details of Invoice No 101' });
    expect(details).toHaveClass('bg-sky-50');
    fireEvent.click(details);
    expect(calls.open).toHaveBeenCalledWith('101');
    const dialog = screen.getByRole('dialog', { name: 'Invoice No 101' });
    expect(within(dialog).getByAltText('Attached manual bill slip for Invoice No 101')).toHaveAttribute(
      'src',
      slip,
    );
    expect(within(dialog).getByRole('button', { name: /Payment History/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Return History/ })).toBeInTheDocument();
  });

  it('every action still works from the row, as a coloured icon named after the bill', () => {
    const calls = spies();
    render(<HistoryInvoiceTable invoices={[salesInvoice()]} labels={SALES_LABELS} actions={calls} />);
    const cases = [
      ['Details of Invoice No 101', calls.open, 'bg-sky-50'],
      ['Edit Invoice No 101', calls.edit, 'bg-blue-50'],
      ['Add Payment to Invoice No 101', calls.addPayment, 'bg-emerald-50'],
      ['Payment History of Invoice No 101', calls.viewPayments, 'bg-sky-50'],
      ['Add Return to Invoice No 101', calls.addReturn, 'bg-amber-50'],
      ['Return History of Invoice No 101', calls.viewReturns, 'bg-sky-50'],
      ['Share Statement of Invoice No 101', calls.shareStatement, 'bg-violet-50'],
      ['Download Statement of Invoice No 101', calls.downloadStatement, 'bg-brand-50'],
      ['Delete Invoice No 101', calls.remove, 'bg-red-50'],
    ];
    const actionsCell = billRows().cells[8];
    expect(
      within(actionsCell)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(cases.map(([name]) => name));
    // the actions column also covers the products row
    expect(actionsCell).toHaveAttribute('rowspan', '2');
    for (const [name, spy, colour] of cases) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveClass(colour);
      fireEvent.click(button);
      expect(spy).toHaveBeenCalledWith('101');
    }
  });

  it('leaves out the actions a bill does not offer', () => {
    render(
      <HistoryInvoiceTable
        invoices={[
          toHistoryInvoice(
            {
              invoiceNo: '7',
              invoiceDate: '2026-09-01',
              customerName: 'Old Bill',
              products: [],
              subtotal: 100,
              grandTotal: 100,
              amountPaid: 0,
              balanceDue: 100,
            },
            [],
            [],
            false,
          ),
        ]}
        labels={SALES_LABELS}
        actions={spies()}
      />,
    );
    expect(screen.queryByRole('button', { name: /Add Payment/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Payment History/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add Return/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Return History/ })).toBeNull();
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('No products found')).toBeInTheDocument();
    // nothing carried / no discount / no returns: a dash, not ₹0.00
    const { cells } = billRows();
    for (const i of [2, 3, 6]) expect(cells[i]).toHaveTextContent('None');
  });
});

describe('History cards (phones / tablets): the same details', () => {
  it('a card shows the contact, every product line, the breakdown with the Cash / Account split and the balance', () => {
    const calls = spies();
    render(<HistoryInvoiceCard invoice={salesInvoice()} labels={SALES_LABELS} actions={calls} />);
    const card = screen.getByRole('article', { name: 'Invoice No 101' });
    expect(within(card).getByText('Invoice No 101')).toBeInTheDocument();
    expect(within(card).getByText('Partially Paid')).toBeInTheDocument();
    expect(card).toHaveTextContent('30/9/2026');
    expect(within(card).getByText('Ravi Stores')).toBeInTheDocument();
    expect(within(card).getByText('9876543210')).toBeInTheDocument();
    expect(card).toHaveTextContent(ADDRESS);

    // products without opening anything: qty, rolls, rate, amount
    const products = within(card).getByRole('region', { name: 'Products of Invoice No 101' });
    const [saree] = within(products).getAllByRole('listitem');
    expect(saree).toHaveTextContent('Cotton saree');
    expect(saree).toHaveTextContent('1 roll · 2 × ₹500.00');
    expect(within(saree).getByText('₹1,000.00')).toBeInTheDocument();

    // amounts breakdown, payments split, returns and balance
    const value = (label) => within(card).getByText(label).nextSibling.textContent;
    expect(value('Current Bill Amount:')).toBe('₹2,200.00');
    expect(value('Previous Balance:')).toBe('₹300.00');
    expect(value('Discount Amount:')).toBe('-₹100.00');
    expect(value('Total Amount:')).toBe('₹2,400.00');
    expect(value('Cash:')).toBe('₹600.00');
    expect(value('Account:')).toBe('₹400.00');
    expect(value('Return Amount:')).toBe('-₹200.00');
    expect(value('Returns (refunded):')).toBe('₹150.00');
    expect(value('Current Adjusted Balance Due:')).toBe('₹1,200.00');

    // Details (slip image) is an explicit action; the other actions keep their names
    fireEvent.click(within(card).getByRole('button', { name: 'Details' }));
    expect(calls.open).toHaveBeenCalledWith('101');
    fireEvent.click(within(card).getByRole('button', { name: 'Add Return' }));
    expect(calls.addReturn).toHaveBeenCalledWith('101');
  });

  it('a long product list expands in place on the card too', () => {
    const products = ['A', 'B', 'C', 'D'].map((x) => ({ description: `Fabric ${x}`, qty: 1, rate: 50 }));
    render(
      <HistoryInvoiceCard invoice={salesInvoice({ products })} labels={SALES_LABELS} actions={spies()} />,
    );
    expect(screen.queryByText('Fabric D')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '+1 more products' }));
    expect(screen.getByText('Fabric D')).toBeInTheDocument();
    // a line saved without an amount shows qty × rate
    expect(screen.getAllByText('₹50.00').length).toBeGreaterThan(0);
  });

  it('phones get the cards and desktops the table, for purchase bills as for sales', () => {
    setWidth(375);
    const { rerender } = render(
      <HistoryInvoiceGroupBody invoices={[purchaseBill()]} labels={PURCHASE_LABELS} actions={spies()} />,
    );
    expect(screen.queryByRole('table')).toBeNull();
    const card = screen.getByRole('article', { name: 'Invoice No 005' });
    expect(within(card).getByText('Sri Ganesh Yarns')).toBeInTheDocument();
    expect(card).toHaveTextContent('4 rolls · 10 × ₹750.00');
    expect(within(card).getByText('Current Adjusted Balance Due:').nextSibling).toHaveTextContent(
      '₹2,800.00',
    );

    setWidth(1280);
    rerender(
      <HistoryInvoiceGroupBody invoices={[purchaseBill()]} labels={PURCHASE_LABELS} actions={spies()} />,
    );
    expect(screen.getByRole('table')).toHaveClass('erp-table');
    expect(screen.queryByRole('article')).toBeNull();
  });
});
