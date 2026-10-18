/**
 * HistoryInvoiceCard – phone / tablet presentation of one invoice (the web's `.invoice-item`).
 * Products expand on demand ("View Details").
 *
 * Props: invoice (HistoryInvoice) · labels ({ party, formatInvoiceNo? }) · actions (HistoryInvoiceActions, keep it stable).
 */
import { ChevronDown, User } from 'lucide-react';
import { memo, useState } from 'react';
import { formatCurrency } from '@/core/format';
import { cn } from '@/ui';
import { displayInvoiceNo } from '../lib/types';
import {
  InvoiceActionButtons,
  InvoiceHistoryLinks,
  InvoiceProducts,
  InvoiceSlipBadge,
  InvoiceStatusBadge,
  InvoiceSummaryBox,
  PaidProgress,
} from './InvoiceParts';

const rs = (n) => `₹${formatCurrency(n)}`;

export const HistoryInvoiceCard = memo(function HistoryInvoiceCard({ invoice, labels, actions }) {
  const [showProducts, setShowProducts] = useState(false);
  const no = invoice.invoiceNo;
  const due = invoice.totalReturns > 0 ? invoice.adjustedBalanceDue : invoice.balanceDue;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-line bg-white p-3.5 shadow-card transition duration-200 hover:shadow-lift sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="border-l-[3px] border-gold-400 pl-2.5 font-display text-base font-extrabold text-brand-800">
          Invoice #{displayInvoiceNo(labels, no)}
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <InvoiceSlipBadge invoice={invoice} />
          <InvoiceStatusBadge invoice={invoice} />
        </div>
      </div>
      <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-600">
        <User className="size-3.5 shrink-0 text-slate-400" aria-hidden />
        <span className="sr-only">{labels.party}: </span>
        <span className="min-w-0 truncate font-medium text-slate-800">{invoice.partyName}</span>
      </p>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">Total</div>
          <div className="font-display text-2xl leading-tight font-extrabold text-brand-800 tabular-nums">
            {rs(invoice.grandTotal)}
          </div>
        </div>
        <div className="text-right text-xs tabular-nums">
          <div className="font-semibold text-emerald-700">Paid {rs(invoice.amountPaid)}</div>
          <div className={cn('font-semibold', due > 0 ? 'text-red-600' : 'text-slate-500')}>
            Due {rs(due)}
          </div>
        </div>
      </div>
      <PaidProgress invoice={invoice} className="mt-2.5" />

      <InvoiceSummaryBox invoice={invoice} />

      <button
        type="button"
        aria-expanded={showProducts}
        onClick={() => setShowProducts((v) => !v)}
        className="mb-1 flex min-h-11 w-full items-center justify-between rounded-xl px-2 text-sm font-semibold text-gold-700 transition hover:bg-gold-50 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none"
      >
        View Details
        <ChevronDown
          className={cn('size-4 transition-transform duration-200', showProducts && 'rotate-180')}
          aria-hidden
        />
      </button>
      {showProducts ? <InvoiceProducts invoice={invoice} /> : null}

      <InvoiceHistoryLinks
        invoice={invoice}
        onViewPayments={() => actions.viewPayments(no)}
        onViewReturns={() => actions.viewReturns(no)}
      />
      <div className="mt-auto">
        <InvoiceActionButtons invoice={invoice} actions={actions} compact />
      </div>
    </article>
  );
});
