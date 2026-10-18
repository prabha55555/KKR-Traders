import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';

import { formatRupees } from '@/core/format';
import { Button, IconButton, cn } from '@/ui';

import { openingActions, stockTone } from './stocksLogic';

export const TONE_CLASS = { positive: 'text-emerald-700', negative: 'text-red-600', zero: 'text-slate-500' };

/** Stock-level pill styles: in stock = emerald, out = neutral, oversold (negative) = red. */
const LEVEL = {
  positive: {
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    label: 'In stock',
  },
  zero: { pill: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400', label: 'Out of stock' },
  negative: { pill: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', label: 'Oversold' },
};

/** Available quantity as a stock-level badge (dot + number); `showLabel` adds "In stock" / "Out of stock" / "Oversold". */
export function AvailableValue({ row, className, showLabel = false }) {
  const level = LEVEL[stockTone(row.available)];
  return (
    <span
      title={level.label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold tabular-nums ring-1 ring-inset',
        level.pill,
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', level.dot)} aria-hidden />
      {row.available}
      {showLabel ? <span className="text-[11px] font-semibold opacity-80">{level.label}</span> : null}
    </span>
  );
}

/** Opening stock value: a gold-tinted badge when there is one, a muted 0 otherwise. */
export function OpeningValue({ row }) {
  if (openingActions(row) === 'edit') {
    return (
      <span className="inline-block rounded-full bg-gold-100 px-2.5 py-0.5 text-sm font-bold text-gold-800 tabular-nums ring-1 ring-gold-200 ring-inset">
        {row.opening}
      </span>
    );
  }
  return <span className="text-slate-400 tabular-nums">0</span>;
}

/**
 * "View History" plus "Add Old Stock", or "Edit Old Stock" + "Delete Old Stock" when an opening stock exists.
 * `compact` (table rows) turns Delete into an icon-only button so the actions stay on one line.
 */
export function StockActions({ row, onViewHistory, onEditOpening, onDeleteOpening, onSetMinStock, compact }) {
  const hasOpening = openingActions(row) === 'edit';
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        icon={Eye}
        onClick={onViewHistory}
        className="flex-1 max-sm:min-h-11"
      >
        History
      </Button>
      <IconButton
        icon={Plus}
        label="Set Min Stock"
        variant="primary"
        onClick={onSetMinStock}
        className="max-sm:min-h-11 max-sm:min-w-11"
      />
      {hasOpening ? (
        <>
          <IconButton
            icon={Pencil}
            label="Edit Old Stock"
            variant="edit"
            onClick={onEditOpening}
            className="max-sm:min-h-11 max-sm:min-w-11"
          />
          <IconButton
            icon={Trash2}
            label="Delete Old Stock"
            variant="outlineDanger"
            onClick={onDeleteOpening}
            className="max-sm:min-h-11 max-sm:min-w-11"
          />
        </>
      ) : (
        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={onEditOpening}
          className="flex-1 max-sm:min-h-11"
        >
          Add Old Stock
        </Button>
      )}
    </div>
  );
}

function Metric({ label, children }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50/70 px-2 py-2 text-center">
      <div className="text-[10px] font-bold tracking-[0.08em] text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-base">{children}</div>
    </div>
  );
}

/** One product as a phone card: opening / purchased / sold / available, history and opening-stock actions. */
export function StockCard({ row, ...actions }) {
  return (
    <div className="space-y-3">
      <div className="font-display text-base font-bold break-words text-brand-800">{row.description}</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        <Metric label="Opening">
          <OpeningValue row={row} />
        </Metric>
        <Metric label="Purchased">
          <span className="font-semibold text-slate-800 tabular-nums">{row.purchased}</span>
        </Metric>
        <Metric label="Avg Rate">
          <span className="font-semibold text-brand-800 tabular-nums">
            {row.avgPurchaseRate > 0 ? formatRupees(row.avgPurchaseRate) : '-'}
          </span>
        </Metric>
        <Metric label="Sold">
          <span className="font-semibold text-slate-800 tabular-nums">{row.sold}</span>
        </Metric>
        <Metric label="Available">
          <AvailableValue row={row} className="px-2" />
        </Metric>
      </div>
      <StockActions row={row} {...actions} />
    </div>
  );
}
