/**
 * HistoryInvoiceCard – phone / tablet presentation of one invoice, with the same basic details as the desktop table
 * (no popup needed): number, date, status / slip badges, party with phone and address, total / paid / due, every
 * product line (qty, rolls, rate, amount – first 3 + "+N more" in place), the amounts breakdown (InvoiceSummaryBox:
 * bill, previous balance, discount, total, payments with the Cash / Account split, returns, balance due), the payment /
 * return history links and the actions. "Details" opens the detail sheet (bill slip image).
 *
 * Props: invoice (HistoryInvoice) · labels ({ party, formatInvoiceNo? }) · actions (HistoryInvoiceActions, keep it stable).
 */
import { memo } from 'react';
import { formatCurrency, formatDateIN } from '@/core/format';
import { cn } from '@/ui';
import { invoiceDue } from '../lib/statement';
import { displayInvoiceNo } from '../lib/types';
import {
  InvoiceActionButtons,
  InvoiceHistoryLinks,
  InvoiceProductLines,
  InvoiceSlipBadge,
  InvoiceStatusBadge,
  InvoiceSummaryBox,
  PaidProgress,
  PartyContact,
} from './InvoiceParts';

const rs = (n) => `₹${formatCurrency(n)}`;
const LABEL = 'text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase';
const HEADING = 'mb-1.5 text-[11px] font-bold tracking-[0.08em] text-slate-500 uppercase';

export const HistoryInvoiceCard = memo(function HistoryInvoiceCard({ invoice, labels, actions }) {
  const no = invoice.invoiceNo;
  const shownNo = displayInvoiceNo(labels, no);
  // returns settled on the balance are deducted; refunded returns do not change what is owed
  const due = invoiceDue(invoice);
  const count = invoice.products?.length ?? 0;

  return (
    <article
      aria-label={`Invoice No ${shownNo}`}
      className="flex h-full min-w-0 flex-col rounded-2xl border border-line bg-white p-3.5 shadow-card transition duration-200 hover:shadow-lift sm:p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
        <div className="min-w-0">
          <h3 className="border-l-[3px] border-gold-400 pl-2.5 font-display text-base leading-tight font-extrabold wrap-break-word text-brand-800">
            Invoice No {shownNo}
          </h3>
          <p className="mt-0.5 pl-3 text-xs text-slate-500 tabular-nums">
            <span className="sr-only">Date: </span>
            {formatDateIN(invoice.invoiceDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <InvoiceSlipBadge invoice={invoice} />
          <InvoiceStatusBadge invoice={invoice} />
        </div>
      </div>

      <PartyContact
        invoice={invoice}
        labels={labels}
        className="mt-3 rounded-xl bg-slate-50/70 px-3 py-2 text-sm ring-1 ring-line ring-inset"
      />

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className={LABEL}>Total</div>
          <div className="font-display text-2xl leading-tight font-extrabold text-brand-800 tabular-nums">
            {rs(invoice.grandTotal)}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs tabular-nums">
          <div className="font-semibold text-emerald-700">Paid {rs(invoice.amountPaid)}</div>
          <div className={cn('font-semibold', due > 0.005 ? 'text-red-600' : 'text-slate-500')}>
            Due {rs(due)}
          </div>
        </div>
      </div>
      <PaidProgress invoice={invoice} className="mt-2.5" />

      <section aria-label={`Products of Invoice No ${shownNo}`} className="mt-3 border-t border-line pt-3">
        <h4 className={HEADING}>Products ({count})</h4>
        <InvoiceProductLines invoice={invoice} stacked />
      </section>

      <InvoiceSummaryBox invoice={invoice} />

      <InvoiceHistoryLinks
        invoice={invoice}
        onViewPayments={() => actions.viewPayments(no)}
        onViewReturns={() => actions.viewReturns(no)}
      />
      <div className="mt-auto">
        <InvoiceActionButtons
          invoice={invoice}
          actions={actions}
          compact
          onDetails={actions.open ? () => actions.open(no) : undefined}
        />
      </div>
    </article>
  );
});
