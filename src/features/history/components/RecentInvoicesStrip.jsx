/**
 * RecentInvoicesStrip – "Recent Invoices": the newest invoice numbers as a horizontal strip;
 * clicking one filters the list to it.
 *
 * Props: invoices ([{ invoiceNo, partyName, invoiceDate, subtotal }]) · loading (bool) ·
 *        labels ({ party, formatInvoiceNo? }) · onSelect(invoiceNo) · title (default "Recent Invoices").
 */
import { Clock } from 'lucide-react';
import { formatCurrency, formatDateIN } from '@/core/format';
import { SectionHeader } from '@/ui';
import { displayInvoiceNo } from '../lib/types';
import { SkeletonBlock } from './Skeleton';

export function RecentInvoicesStrip({ invoices, loading, labels, onSelect, title = 'Recent Invoices' }) {
  return (
    <section aria-label={title} className="rounded-2xl border border-line bg-white p-3.5 shadow-card sm:p-4">
      <SectionHeader title={title} icon={Clock} className="mb-3" />
      {loading ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} className="h-[86px] w-52 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <p className="rounded-xl bg-slate-50/70 py-4 text-center text-sm text-slate-500">
          No recent invoices found.
        </p>
      ) : (
        <ul className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-0.5 pb-2">
          {invoices.map((invoice) => (
            <li key={invoice.invoiceNo} className="shrink-0 snap-start">
              <button
                type="button"
                onClick={() => onSelect(invoice.invoiceNo)}
                aria-label={`Show invoice ${invoice.invoiceNo}`}
                title={labels.party ? `${labels.party}: ${invoice.partyName}` : undefined}
                className="group relative min-h-[86px] w-52 overflow-hidden rounded-xl border border-line bg-linear-to-b from-white to-slate-50/80 p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-gold-300 hover:bg-gold-50/50 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none active:scale-[0.985]"
              >
                <span
                  className="absolute inset-x-0 top-0 h-px hairline-gold opacity-0 transition group-hover:opacity-100"
                  aria-hidden
                />
                <div className="font-display text-base font-extrabold text-gold-700">
                  #{displayInvoiceNo(labels, invoice.invoiceNo)}
                </div>
                <div className="truncate text-sm font-medium text-slate-700">{invoice.partyName}</div>
                <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-slate-500">
                  <span>{formatDateIN(invoice.invoiceDate)}</span>
                  <span className="font-display text-sm font-extrabold text-brand-800 tabular-nums">
                    ₹{formatCurrency(invoice.subtotal)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
