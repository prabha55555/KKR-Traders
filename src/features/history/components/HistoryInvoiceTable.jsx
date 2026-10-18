/**
 * HistoryInvoiceGroupBody – the invoices of ONE date group.
 *   desktop (>= 1024px): dense table (Invoice, Date, party, Total, Paid, Returns, Balance, icon actions);
 *                        clicking a row calls `actions.open(invoiceNo)` (the detail sheet).
 *   phone / tablet:      HistoryInvoiceCards, 1 column on phones and 2 columns on tablets.
 *
 * Props: invoices (HistoryInvoice[]) · labels ({ party, formatInvoiceNo? }) · actions (HistoryInvoiceActions, stable).
 * Also exports `HistoryInvoiceTable` (just the table) and `buildInvoiceColumns(labels, actions)`.
 */
import { Banknote, MessageCircle, RotateCcw, SquarePen, Trash2, FileDown } from 'lucide-react';
import { memo, useMemo } from 'react';
import { formatCurrency, formatDateIN } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from '@/ui';
import { displayInvoiceNo } from '../lib/types';
import { HistoryInvoiceCard } from './HistoryInvoiceCard';
import { InvoiceSlipBadge } from './InvoiceParts';

const money = (n) => `₹${formatCurrency(n)}`;
const balanceOf = (i) => (i.totalReturns > 0 ? i.adjustedBalanceDue : i.balanceDue);

function IconAction({ icon: Icon, label, tone, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex size-8 items-center justify-center rounded-lg transition hover:bg-gold-100/70 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none active:scale-90',
        tone,
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
    </button>
  );
}

/** Table columns of the wide layout. `align`: 'left' | 'right'. */
export function buildInvoiceColumns(labels, actions) {
  return [
    {
      key: 'no',
      header: 'Invoice',
      render: (i) => (
        <span className="inline-flex items-center gap-2 font-display font-bold text-brand-800">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full ring-2',
              balanceOf(i) > 0
                ? i.amountPaid > 0
                  ? 'bg-amber-400 ring-amber-100'
                  : 'bg-red-500 ring-red-100'
                : 'bg-emerald-500 ring-emerald-100',
            )}
            title={balanceOf(i) > 0 ? (i.amountPaid > 0 ? 'Part paid' : 'Unpaid') : 'Paid'}
            aria-hidden
          />
          #{displayInvoiceNo(labels, i.invoiceNo)}
          <InvoiceSlipBadge invoice={i} />
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      render: (i) => <span className="text-slate-500">{formatDateIN(i.invoiceDate)}</span>,
    },
    {
      key: 'party',
      header: labels.party,
      render: (i) => i.partyName,
      className: 'w-full max-w-0 truncate font-medium text-slate-800',
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
      render: (i) => <span className="text-emerald-600">{money(i.amountPaid)}</span>,
    },
    {
      key: 'returns',
      header: 'Returns',
      align: 'right',
      render: (i) =>
        i.totalReturns > 0 ? (
          <span className="text-red-600">-{money(i.totalReturns)}</span>
        ) : (
          <span className="text-slate-300">-</span>
        ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (i) => (
        <span className={cn('font-bold', balanceOf(i) > 0 ? 'text-red-600' : 'text-emerald-600')}>
          {money(balanceOf(i))}
        </span>
      ),
    },
    ...(actions
      ? [
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (i) => (
              <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                {actions.edit ? (
                  <IconAction
                    icon={SquarePen}
                    label={`Edit invoice ${displayInvoiceNo(labels, i.invoiceNo)}`}
                    tone="text-slate-600 hover:text-brand-800"
                    onClick={() => actions.edit(i.invoiceNo)}
                  />
                ) : null}
                {actions.remove ? (
                  <IconAction
                    icon={Trash2}
                    label={`Delete invoice ${displayInvoiceNo(labels, i.invoiceNo)}`}
                    tone="text-red-500 hover:text-red-700"
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
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line bg-linear-to-b from-slate-50 to-slate-100/70 text-[11px] tracking-[0.08em] text-slate-500 uppercase">
          {columns.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={cn(
                'px-3 py-2.5 font-bold whitespace-nowrap',
                c.align === 'right' ? 'text-right' : 'text-left',
              )}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {invoices.map((invoice) => (
          <tr
            key={invoice.invoiceNo}
            onClick={open ? () => open(invoice.invoiceNo) : undefined}
            className={cn(
              'tabular-nums transition-colors',
              open ? 'cursor-pointer hover:bg-gold-50/70' : 'hover:bg-slate-50/70',
            )}
          >
            {columns.map((c) => (
              <td
                key={c.key}
                className={cn(
                  'px-3 py-2 whitespace-nowrap',
                  c.align === 'right' && 'text-right',
                  c.className,
                )}
              >
                {c.render(invoice)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
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
