/**
 * HistoryInvoiceGroupBody – the invoices of ONE date group.
 *   desktop (>= 1024px): HistoryInvoiceTable – every bill shows its basic details inline, no popup needed.
 *   phone / tablet:      HistoryInvoiceCards (same details), 1 column on phones and 2 columns on tablets.
 *
 * HistoryInvoiceTable (the app's bordered .erp-table) – one block per bill (its own <tbody>):
 *   main row  Invoice No + status / slip badges, date, party (name, phone, address) · right-aligned amounts:
 *             Bill Amt, Prev. Bal, Discount, Total, Paid (+ Cash / Account split), Returns (deducted from the
 *             balance vs refunded), Balance Due (after the returns settled on it) – the InvoiceSummaryBox figures.
 *   sub-row   every product line ("description · rolls · qty × rate = amount", first 3 + "+N more" in place) and
 *             the initial / additional payments.
 *   Actions   (spans both rows) the eye icon only: it opens the detail sheet, which holds every action (edit,
 *             payments, returns, print / share, statements, delete), the slip image and the history links.
 * Rows are not clickable: the detail sheet opens from the Details action only. Every day's table uses the same
 * column widths; a table wider than the screen scrolls inside its own frame.
 *
 * Props: invoices (HistoryInvoice[]) · labels ({ party, formatInvoiceNo? }) · actions (HistoryInvoiceActions, stable).
 * Also exports `HistoryInvoiceTable` (just the table) and `buildInvoiceColumns(labels, actions)` (main-row columns).
 */
import { Eye } from 'lucide-react';
import { memo, useMemo } from 'react';
import { formatCurrency, formatDateIN, toNum } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { IconButton, cn } from '@/ui';
import { balanceReturnsOf, invoiceDue, refundedReturnsOf } from '../lib/statement';
import { displayInvoiceNo } from '../lib/types';
import { HistoryInvoiceCard } from './HistoryInvoiceCard';
import {
  InvoiceProductLines,
  InvoiceSlipBadge,
  InvoiceStatusBadge,
  PaidSplit,
  PartyContact,
  PaymentRecordsSummary,
  hasPaymentRecordsSummary,
} from './InvoiceParts';

const money = (n) => `₹${formatCurrency(n)}`;

/** A dash for an empty amount cell (no discount, no returns, nothing carried). */
const None = () => (
  <span className="text-slate-300">
    <span aria-hidden>–</span>
    <span className="sr-only">None</span>
  </span>
);
const DETAIL_HEADING = 'mb-1 text-[11px] font-bold tracking-[0.08em] text-slate-500 uppercase';
/** Small caption under a figure ("refunded", "after returns"). */
const Caption = ({ children, className }) => (
  <span className={cn('block text-[11px] leading-tight font-medium', className)}>{children}</span>
);

/**
 * The Actions column holds only the eye icon: it opens the bill's detail sheet, which has every action (edit, payments,
 * returns, print / share, statements, delete). The label names the bill ("Details of Invoice No 101").
 */
function RowActions({ invoice, labels, actions }) {
  if (!actions.open) return null;
  const no = displayInvoiceNo(labels, invoice.invoiceNo);
  return (
    <div className="flex justify-center">
      <IconButton
        icon={Eye}
        variant="outlineInfo"
        label={`Details of Invoice No ${no}`}
        onClick={() => actions.open(invoice.invoiceNo)}
      />
    </div>
  );
}

/** First column: number, badges, date and the party with its contact details. */
function InvoiceCell({ invoice, labels }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-display text-[15px] leading-tight font-extrabold whitespace-nowrap text-brand-800">
          <span className="sr-only">Invoice No </span>
          {displayInvoiceNo(labels, invoice.invoiceNo)}
        </span>
        <span className="text-xs whitespace-nowrap text-slate-500 tabular-nums">
          <span className="sr-only">Date: </span>
          {formatDateIN(invoice.invoiceDate)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <InvoiceStatusBadge invoice={invoice} />
        <InvoiceSlipBadge invoice={invoice} />
      </div>
      <PartyContact invoice={invoice} labels={labels} clampAddress className="text-[13px]" />
    </div>
  );
}

/**
 * Main-row columns. `align` 'right' = one-line tabular figures; `width` = the same width in every day's table;
 * `title` = header tooltip; `spansDetails` = the cell also covers the products sub-row (rowSpan 2).
 */
export function buildInvoiceColumns(labels, actions) {
  return [
    {
      key: 'invoice',
      header: `Invoice No / ${labels.party}`,
      render: (i) => <InvoiceCell invoice={i} labels={labels} />,
    },
    {
      key: 'billAmount',
      header: 'Bill Amt',
      title: 'Current bill amount (this bill only)',
      align: 'right',
      width: '6.5rem',
      render: (i) => <span className="font-semibold text-slate-800">{money(i.subtotal)}</span>,
    },
    {
      key: 'previousBalance',
      header: 'Prev. Bal',
      title: 'Previous balance carried into this bill',
      align: 'right',
      width: '6.5rem',
      render: (i) => {
        const previous = toNum(i.previousBalance);
        if (!previous) return <None />;
        return (
          <span className={cn('font-semibold', previous > 0.005 ? 'text-red-600' : 'text-emerald-700')}>
            {money(previous)}
          </span>
        );
      },
    },
    {
      key: 'discount',
      header: 'Discount',
      align: 'right',
      width: '5.5rem',
      render: (i) =>
        i.discountAmount ? (
          <span className="font-semibold text-emerald-600">-{money(i.discountAmount)}</span>
        ) : (
          <None />
        ),
    },
    {
      key: 'total',
      header: 'Total',
      title: 'Total amount (bill + previous balance − discount)',
      align: 'right',
      width: '6.75rem',
      render: (i) => <span className="font-bold text-brand-800">{money(i.grandTotal)}</span>,
    },
    {
      key: 'paid',
      header: 'Paid',
      title: 'Total amount paid, with the Cash / Account split',
      align: 'right',
      width: '7rem',
      render: (i) => (
        <span className="flex flex-col items-end gap-0.5">
          <span className={cn('font-semibold', i.amountPaid > 0 ? 'text-emerald-700' : 'text-slate-500')}>
            {money(i.amountPaid)}
          </span>
          <PaidSplit invoice={i} short />
        </span>
      ),
    },
    {
      key: 'returns',
      header: 'Returns',
      title: 'Returns deducted from the balance, and returns refunded (balance unchanged)',
      align: 'right',
      width: '6rem',
      render: (i) => {
        if (!(i.totalReturns > 0)) return <None />;
        const adjusted = balanceReturnsOf(i);
        const refunded = refundedReturnsOf(i);
        return (
          <span className="flex flex-col items-end gap-1">
            {adjusted > 0 ? (
              <span title="Deducted from the balance">
                <span className="font-semibold text-red-600">-{money(adjusted)}</span>
                <Caption className="text-slate-500">deducted</Caption>
              </span>
            ) : null}
            {refunded > 0 ? (
              <span title="Refunded — the balance is unchanged">
                <span className="font-semibold text-amber-700">{money(refunded)}</span>
                <Caption className="text-amber-700">refunded</Caption>
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Balance Due',
      align: 'right',
      width: '7rem',
      render: (i) => {
        const due = invoiceDue(i);
        return (
          <span>
            <span
              className={cn('text-[14px] font-extrabold', due > 0.005 ? 'text-red-600' : 'text-emerald-700')}
            >
              {money(due)}
            </span>
            {balanceReturnsOf(i) > 0 ? <Caption className="text-slate-500">after returns</Caption> : null}
          </span>
        );
      },
    },
    ...(actions
      ? [
          {
            key: 'actions',
            header: 'Actions',
            align: 'center',
            width: '4.5rem',
            spansDetails: true,
            render: (i) => <RowActions invoice={i} labels={labels} actions={actions} />,
          },
        ]
      : []),
  ];
}

/** The products / payments line under a bill's figures. */
function BillDetails({ invoice, labels }) {
  const no = displayInvoiceNo(labels, invoice.invoiceNo);
  const count = invoice.products?.length ?? 0;
  return (
    // w-0 + min-w-full: the details never widen the columns (they take the width the figures above leave them)
    <div className="flex w-0 min-w-full flex-wrap items-start gap-x-10 gap-y-3">
      <section aria-label={`Products of Invoice No ${no}`} className="max-w-2xl min-w-0 flex-[1_1_22rem]">
        <h4 className={DETAIL_HEADING}>Products ({count})</h4>
        <InvoiceProductLines invoice={invoice} />
      </section>
      {hasPaymentRecordsSummary(invoice) ? (
        <section aria-label={`Payments of Invoice No ${no}`} className="w-60 max-w-full shrink-0">
          <h4 className={DETAIL_HEADING}>Payments</h4>
          <PaymentRecordsSummary invoice={invoice} />
        </section>
      ) : null}
    </div>
  );
}

const HistoryInvoiceRows = memo(function HistoryInvoiceRows({ invoice, columns, labels, isLast }) {
  const detailSpan = columns.filter((c) => !c.spansDetails).length;
  return (
    <tbody className="group/bill">
      <tr>
        {columns.map((c) => (
          <td
            key={c.key}
            rowSpan={c.spansDetails ? 2 : undefined}
            data-align={c.align ?? 'left'}
            className={cn(
              'align-top group-hover/bill:bg-slate-50/80',
              c.spansDetails
                ? cn('border-b-slate-300', isLast && 'border-b-0')
                : '[border-bottom-style:dashed] border-b-slate-200',
            )}
          >
            {c.render(invoice)}
          </td>
        ))}
      </tr>
      <tr>
        <td
          colSpan={detailSpan}
          className={cn(
            'bg-slate-50/50 pt-2 pb-3 group-hover/bill:bg-slate-50/80',
            !isLast && 'border-b-slate-300',
          )}
        >
          <BillDetails invoice={invoice} labels={labels} />
        </td>
      </tr>
    </tbody>
  );
});

export function HistoryInvoiceTable({ invoices, labels, actions }) {
  const columns = useMemo(() => buildInvoiceColumns(labels, actions), [labels, actions]);
  return (
    <div className="erp-table-wrap">
      <table className="erp-table erp-table-dense text-[13px]">
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-align={c.align ?? 'left'} title={c.title}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        {invoices.map((invoice, index) => (
          <HistoryInvoiceRows
            key={invoice.invoiceNo}
            invoice={invoice}
            columns={columns}
            labels={labels}
            isLast={index === invoices.length - 1}
          />
        ))}
      </table>
    </div>
  );
}

export const HistoryInvoiceGroupBody = memo(function HistoryInvoiceGroupBody({ invoices, labels, actions }) {
  const { isExpanded } = useBreakpoint();
  if (isExpanded) return <HistoryInvoiceTable invoices={invoices} labels={labels} actions={actions} />;
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {invoices.map((invoice) => (
        <HistoryInvoiceCard key={invoice.invoiceNo} invoice={invoice} labels={labels} actions={actions} />
      ))}
    </div>
  );
});
