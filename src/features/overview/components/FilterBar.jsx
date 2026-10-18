import { CalendarDays, X } from 'lucide-react';

import { Button, Card, ChoiceChips, DateField, SearchBar } from '@/ui';
import { todayISO } from '@/core/format';

/**
 * The "search by date + search by name / reason + clear" row of the overview pages.
 * Supports quick date filters (All Dates, Today, This Month — tap the active one again to clear it) and optional extra
 * filter slots. `dateLabel` names the date field when it is not a search (e.g. "Interest as of" on the finance records,
 * where the date changes the computed figures). `active` = an extra filter is chosen (keeps Clear enabled).
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
  dateLabel,
  active = false,
}) {
  const hasDate = typeof onDateChange === 'function';
  // `active`: an extra filter (e.g. Cash / Account chips) is on, so Clear has something to reset
  const filtering = (hasDate && !!date) || !!text || !!active;
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const quickOptions = [
    { value: '', label: 'All Dates' },
    { value: today, label: 'Today' },
    { value: thisMonth, label: 'This Month' },
  ];

  return (
    <Card className="mb-5 space-y-3">
      <div
        className={`grid gap-2.5 ${
          hasDate ? 'sm:grid-cols-[11.5rem_minmax(0,1fr)_auto]' : 'sm:grid-cols-[minmax(0,1fr)_auto]'
        } ${dateLabel ? 'sm:items-end' : 'sm:items-center'}`}
      >
        {hasDate && (
          <DateField
            value={date}
            onChange={onDateChange}
            label={dateLabel}
            aria-label={dateLabel || 'Search by date'}
            title={dateLabel || 'Search by Date'}
          />
        )}
        <SearchBar
          value={text}
          onChange={onTextChange}
          placeholder={textPlaceholder}
          aria-label={textPlaceholder?.replace('...', '') || 'Search'}
        />
        <Button
          variant="outlineWarning"
          icon={X}
          onClick={onClear}
          disabled={!filtering}
          className="max-sm:w-full"
        >
          Clear
        </Button>
      </div>

      {(quickDates || extraFilters) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          {quickDates && hasDate && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                <CalendarDays className="size-3.5 text-gold-600" aria-hidden /> Quick:
              </span>
              <ChoiceChips
                value={date}
                options={quickOptions}
                onChange={(v) => onDateChange(v && v === date ? '' : v)}
              />
            </div>
          )}

          {extraFilters && <div className="ml-auto flex flex-wrap items-center gap-2">{extraFilters}</div>}
        </div>
      )}
    </Card>
  );
}
