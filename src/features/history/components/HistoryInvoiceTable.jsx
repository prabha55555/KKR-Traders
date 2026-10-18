/**
 * HistoryInvoiceGroupBody – the invoices of ONE date group.
 *   desktop (>= 1024px): the app table (.erp-table: Invoice No, Date, party, Total, Paid, Returns, Balance with its
 *                        Paid / Partially Paid / Unpaid badge, icon actions); clicking a row calls `actions.open(invoiceNo)`
 *                        (the detail sheet). A table wider than the screen scrolls inside its own frame.
 *   phone / tablet:      HistoryInvoiceCards, 1 column on phones and 2 columns on tablets.
 *
 * Props: invoices (HistoryInvoice[]) · labels ({ party, formatInvoiceNo? }) · actions (HistoryInvoiceActions, stable).
 * Also exports `HistoryInvoiceTable` (just the table) and `buildInvoiceColumns(labels, actions)`.
 */
import { SquarePen, Trash2 } from 'lucide-react';
import { memo, useMemo } from 'react';
import { formatCurrency, formatDateIN } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { IconButton, cn } from '@/ui';
import { balanceReturnsOf, invoiceDue, refundedReturnsOf } from '../lib/statement';
import { displayInvoiceNo } from '../lib/types';
import { HistoryInvoiceCard } from './HistoryInvoiceCard';
import { InvoiceSlipBadge, InvoiceStatusBadge } from './InvoiceParts';

const money = (n) => `₹${formatCurrency(n)}`;
/** What the bill still owes: balanceDue minus the returns settled against it (refunds leave it unchanged). */
const balanceOf = invoiceDue;

/** Row-level icon action: the row click (open the detail) must not fire as well. */
function RowAction({ onClick, ...rest }) {
  return (
    <IconButton
      {...rest}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    />
  );
}

/** Table columns of the wide layout. `align`: 'left' | 'right' | 'center' (right = one-line tabular figures). */
export function buildInvoiceColumns(labels, actions) {
  return [
    {
      key: 'no',
      header: 'Invoice No',
      render: (i) => (
        <span className="flex flex-wrap items-center gap-1.5 font-display font-bold text-brand-800">
          <span className="whitespace-nowrap">{displayInvoiceNo(labels, i.invoiceNo)}</span>
          <InvoiceSlipBadge invoice={i} />
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      nowrap: true,
      render: (i) => <span className="text-slate-500">{formatDateIN(i.invoiceDate)}</span>,
    },
    {
      key: 'party',
      header: labels.party,
      render: (i) => i.partyName,
      className: 'w-full font-medium text-slate-800',
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (i) => <span className="font-semibold text-brand-800">{money(i.grandTotal)}</span>,
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      render: (i) => <span className="text-emerald-700">{money(i.amountPaid)}</span>,
    },
    {
      key: 'returns',
      header: 'Returns',
      align: 'right',
      render: (i) => {
        if (!(i.totalReturns > 0)) return <span className="text-slate-300">-</span>;
        const adjusted = balanceReturnsOf(i);
        const refunded = refundedReturnsOf(i);
        return (
          <span className="flex flex-col items-end leading-tight">
            {adjusted > 0 ? <span className="text-red-600">-{money(adjusted)}</span> : null}
            {refunded > 0 ? (
              <span className="text-xs text-amber-700" title="Refunded — the balance is unchanged">
                {money(refunded)} refunded
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (i) => (
        <span className="flex flex-col items-end gap-1">
          <span className={cn('font-bold', balanceOf(i) > 0 ? 'text-red-600' : 'text-emerald-700')}>
            {money(balanceOf(i))}
          </span>
          <InvoiceStatusBadge invoice={i} />
        </span>
      ),
    },
    ...(actions
      ? [
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'center',
            render: (i) => (
              <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                {actions.edit ? (
                  <RowAction
                    icon={SquarePen}
                    variant="edit"
                    label={`Edit Invoice No ${displayInvoiceNo(labels, i.invoiceNo)}`}
                    onClick={() => actions.edit(i.invoiceNo)}
                  />
                ) : null}
                {actions.remove ? (
                  <RowAction
                    icon={Trash2}
                    variant="outlineDanger"
                    label={`Delete Invoice No ${displayInvoiceNo(labels, i.invoiceNo)}`}
                    onClick={() => actions.remove(i.invoiceNo)}
                  />
                ) : null}
              </div>
            ),
          },
        ]
      : []),
  ];
}

export function HistoryInvoiceTable({ invoices, labels, actions }) {
  const columns = useMemo(() => buildInvoiceColumns(labels, actions), [labels, actions]);
  const { open } = actions;
  return (
    <div className="erp-table-wrap">
      <table className="erp-table erp-table-dense">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" data-align={c.align ?? 'left'}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr
              key={invoice.invoiceNo}
              onClick={open ? () => open(invoice.invoiceNo) : undefined}
              className={open ? 'cursor-pointer' : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-align={c.align ?? 'left'}
                  className={cn(c.nowrap && 'nowrap', c.className)}
                >
                  {c.render(invoice)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
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
