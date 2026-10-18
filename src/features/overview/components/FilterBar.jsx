import { CalendarDays, X } from 'lucide-react';

import { Button, Card, DateField, SearchBar } from '@/ui';
import { todayISO } from '@/core/format';

/**
 * The "search by date + search by name / reason + clear" row of the overview pages.
 * Supports quick date filters (Today, This Month) and optional extra filter slots.
 */
export default function FilterBar({
  date,
  onDateChange,
  text,
  onTextChange,
  textPlaceholder,
  onClear,
  quickDates = false,
  extraFilters,
}) {
  const hasDate = typeof onDateChange === 'function';
  const filtering = (hasDate && !!date) || !!text;
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const isToday = date === today;
  const isThisMonth = date === thisMonth;

  return (
    <Card className="mb-5 space-y-2.5 border-line bg-white/80 p-3 sm:p-3.5">
      <div
        className={`grid gap-2.5 ${
          hasDate ? 'sm:grid-cols-[11.5rem_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'
        } sm:items-center`}
      >
        {hasDate && (
          <DateField
            value={date}
            onChange={onDateChange}
            aria-label="Search by date"
            title="Search by Date"
          />
        )}
        <SearchBar
          value={text}
          onChange={onTextChange}
          placeholder={textPlaceholder}
          aria-label={textPlaceholder?.replace('...', '') || 'Search'}
        />
        <Button
          variant="outlineDanger"
          icon={X}
          onClick={onClear}
          disabled={!filtering}
          className="max-sm:w-full"
        >
          Clear
        </Button>
      </div>

      {(quickDates || extraFilters) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-1 text-xs">
          {quickDates && hasDate && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="flex items-center gap-1 font-medium text-slate-400">
                <CalendarDays className="size-3.5" /> Quick:
              </span>
              <button
                type="button"
                onClick={() => onDateChange(isToday ? '' : today)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  isToday
                    ? 'bg-brand-900 text-gold-300 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => onDateChange(isThisMonth ? '' : thisMonth)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  isThisMonth
                    ? 'bg-brand-900 text-gold-300 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                This Month
              </button>
              {date && (
                <button
                  type="button"
                  onClick={() => onDateChange('')}
                  className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-600"
                  title="Clear date filter"
                >
                  All Dates
                </button>
              )}
            </div>
          )}

          {extraFilters && <div className="ml-auto flex flex-wrap items-center gap-1.5">{extraFilters}</div>}
        </div>
      )}
    </Card>
  );
}
