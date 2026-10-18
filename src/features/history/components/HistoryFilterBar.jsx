/**
 * HistoryFilterBar – the history filters of the original page: free-text search (party name / invoice number),
 * invoice-number range, date range, plus "Search" and "Clear Filters". Nothing is applied until Search / Enter.
 * Desktop: two rows. Tablet: stacked. Phone: search row, the ranges fold behind "More filters".
 *
 * Props:
 *   value     HistoryFilters { search, fromInvoiceNo, toInvoiceNo, fromDate, toDate }  (draft, owned by the controller)
 *   onChange(next)   draft changed
 *   onSearch()       apply the draft (Search button / Enter)
 *   onClear()        reset everything
 *   labels    { party } – "Search customer name or invoice no"
 */
import { ChevronDown, Search as SearchIcon, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { digitsOnly } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Button, DateField, SearchBar, TextField, cn } from '@/ui';

export function HistoryFilterBar({ value, onChange, onSearch, onClear, labels }) {
  const { isCompact } = useBreakpoint();
  const [moreOpen, setMoreOpen] = useState(false);
  const anyRange = !!(value.fromInvoiceNo || value.toInvoiceNo || value.fromDate || value.toDate);
  // a range set from elsewhere (clicking a day heading) must be visible on phones
  useEffect(() => {
    if (anyRange) setMoreOpen(true);
  }, [anyRange]);
  const showRanges = !isCompact || moreOpen;
  const set = (patch) => onChange({ ...value, ...patch });
  const party = labels.party.toLowerCase();

  return (
    <form
      role="search"
      aria-label="Filter invoices"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
      className="space-y-3.5 rounded-2xl border border-line bg-white p-3.5 shadow-card sm:p-4"
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)] lg:items-end">
        <SearchBar
          value={value.search}
          onChange={(search) => set({ search })}
          placeholder={`Search ${party} name or invoice no`}
          aria-label="Search invoices"
          autoComplete="off"
        />
        {isCompact ? (
          <button
            type="button"
            aria-expanded={showRanges}
            onClick={() => setMoreOpen((v) => !v)}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-sm font-semibold text-brand-800 ring-1 ring-line transition ring-inset hover:bg-gold-50 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none"
          >
            <span className="flex size-6 items-center justify-center rounded-md bg-gold-100 text-gold-700">
              <SlidersHorizontal className="size-3.5" aria-hidden />
            </span>
            <span className="flex-1 text-left">
              {showRanges ? 'Fewer filters' : 'More filters (invoice range, dates)'}
            </span>
            {anyRange ? <span className="size-2 rounded-full bg-gold-500" aria-hidden /> : null}
            <ChevronDown
              className={cn(
                'size-4 text-slate-400 transition-transform duration-200',
                showRanges && 'rotate-180',
              )}
              aria-hidden
            />
          </button>
        ) : (
          <RangeGroup label="Invoice number">
            <TextField
              className="flex-1"
              inputMode="numeric"
              placeholder="From Invoice No"
              aria-label="From invoice number"
              value={value.fromInvoiceNo}
              onChange={(v) => set({ fromInvoiceNo: digitsOnly(v) })}
            />
            <RangeTo />
            <TextField
              className="flex-1"
              inputMode="numeric"
              placeholder="To Invoice No"
              aria-label="To invoice number"
              value={value.toInvoiceNo}
              onChange={(v) => set({ toInvoiceNo: digitsOnly(v) })}
            />
          </RangeGroup>
        )}
      </div>

      {showRanges ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)] lg:items-end">
          <RangeGroup label="Date range">
            <DateField
              className="flex-1"
              aria-label="From date"
              value={value.fromDate}
              onChange={(fromDate) => set({ fromDate })}
            />
            <RangeTo />
            <DateField
              className="flex-1"
              aria-label="To date"
              value={value.toDate}
              onChange={(toDate) => set({ toDate })}
            />
          </RangeGroup>
          {isCompact ? (
            <RangeGroup label="Invoice number">
              <TextField
                className="flex-1"
                inputMode="numeric"
                placeholder="From Invoice No"
                aria-label="From invoice number"
                value={value.fromInvoiceNo}
                onChange={(v) => set({ fromInvoiceNo: digitsOnly(v) })}
              />
              <RangeTo />
              <TextField
                className="flex-1"
                inputMode="numeric"
                placeholder="To Invoice No"
                aria-label="To invoice number"
                value={value.toInvoiceNo}
                onChange={(v) => set({ toInvoiceNo: digitsOnly(v) })}
              />
            </RangeGroup>
          ) : (
            <Buttons onClear={onClear} />
          )}
        </div>
      ) : null}

      {isCompact ? <Buttons onClear={onClear} /> : null}
    </form>
  );
}

/** A labelled from–to pair (small-caps caption above the two fields). */
function RangeGroup({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-slate-400 uppercase">{label}</p>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

const RangeTo = () => <span className="text-xs font-semibold text-slate-400 uppercase">to</span>;

function Buttons({ onClear }) {
  return (
    <div className="flex gap-2 lg:items-end lg:justify-end">
      <Button type="submit" icon={SearchIcon} className="flex-1 lg:flex-none">
        Search
      </Button>
      <Button variant="outlineDanger" onClick={onClear} className="flex-1 lg:flex-none">
        Clear Filters
      </Button>
    </div>
  );
}
