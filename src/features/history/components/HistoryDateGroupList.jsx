/**
 * HistoryDateGroupList – the date-grouped invoice list: one heading per day (with the day's invoice count)
 * followed by that day's invoices (table on desktop, cards on phone/tablet – see HistoryInvoiceGroupBody).
 * Days are paged (`pageDays` days per page, <Pagination> underneath) so thousands of invoices stay light.
 *
 * Props:
 *   groups       DateGroup[]  (from lib/grouping: { key, date, invoices, totalInvoices })
 *   labels       { party, formatInvoiceNo? }
 *   actions      HistoryInvoiceActions (referentially stable)
 *   loading      bool         -> skeleton cards
 *   error        string|null  -> error state with retry
 *   onRetry()    retry after an error
 *   onFilterDate(day)  click on a day heading: show only that day (headings of undated groups are inert)
 *   pageDays     number of days per page (default 5)
 *   emptyTitle   text of the empty state (default "No invoices found.")
 */
import { Calendar, FileSearch } from 'lucide-react';
import { formatCurrency } from '@/core/format';
import { EmptyState, ErrorState, Pagination, usePagination } from '@/ui';
import { HistoryInvoiceGroupBody } from './HistoryInvoiceTable';
import { InvoiceListSkeleton } from './Skeleton';

function DateHeading({ group, onClick }) {
  const count = `${group.totalInvoices} Invoice${group.totalInvoices > 1 ? 's' : ''}`;
  const dayTotal = group.invoices.reduce((sum, invoice) => sum + (Number(invoice.grandTotal) || 0), 0);
  return (
    <div className="sticky top-[calc(6.5rem+env(safe-area-inset-top))] z-10 -mx-1 bg-canvas/85 px-1 py-2 backdrop-blur-md lg:top-14">
      <button
        type="button"
        onClick={onClick}
        disabled={!group.key}
        aria-label={`${group.date}, ${count}. Show only this day`}
        className="group relative flex min-h-12 w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-line bg-white py-1.5 pr-3.5 pl-4 text-left shadow-card transition duration-200 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none enabled:hover:-translate-y-px enabled:hover:border-gold-300 enabled:hover:shadow-lift"
      >
        <span className="absolute inset-y-0 left-0 w-1 bg-gold-gradient" aria-hidden />
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-200 transition group-enabled:group-hover:bg-gold-sheen group-enabled:group-hover:text-brand-900">
            <Calendar className="size-[18px]" aria-hidden />
          </span>
          <span className="truncate font-display text-[15px] font-extrabold text-brand-800 sm:text-base">
            {group.date}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 ring-inset">
            {count}
          </span>
          <span className="hidden text-right sm:block">
            <span className="block text-[10px] leading-none font-bold tracking-[0.08em] text-slate-400 uppercase">
              Day total
            </span>
            <span className="font-display text-sm font-extrabold text-brand-800 tabular-nums">
              ₹{formatCurrency(dayTotal)}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

export function HistoryDateGroupList({
  groups,
  labels,
  actions,
  loading,
  error,
  onRetry,
  onFilterDate,
  pageDays = 5,
  emptyTitle = 'No invoices found.',
}) {
  // a new search / filter (different first day or day count) starts again from page 1
  const pager = usePagination(groups, {
    pageSize: pageDays,
    resetKey: `${groups.length}|${groups[0]?.key ?? ''}`,
  });

  if (loading) return <InvoiceListSkeleton />;
  if (error) {
    return (
      <ErrorState
        message="Error loading invoices. Please try again."
        onRetry={onRetry}
        className="rounded-2xl border border-line bg-white shadow-card"
      />
    );
  }
  if (groups.length === 0) {
    return (
      <EmptyState
        icon={FileSearch}
        title={emptyTitle}
        message="Try a different name, invoice number or date range, or clear the filters."
        className="rounded-2xl border border-line bg-white shadow-card"
      />
    );
  }

  return (
    <div className="space-y-2">
      <div ref={pager.anchorRef} className="scroll-mt-40" />
      {pager.rows.map((group, index) => (
        <section
          key={group.key || 'no-date'}
          aria-label={group.date}
          className="animate-rise"
          style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
        >
          <DateHeading group={group} onClick={() => onFilterDate(group.key)} />
          <div className="pt-1 pb-3 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-line lg:bg-white lg:p-1.5 lg:shadow-card">
            <HistoryInvoiceGroupBody invoices={group.invoices} labels={labels} actions={actions} />
          </div>
        </section>
      ))}
      <Pagination pager={pager} noun="days" />
    </div>
  );
}
