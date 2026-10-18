import { BellPlus, Eye, Pencil, Plus, Trash2 } from 'lucide-react';

import { formatRupees } from '@/core/format';
import { Badge, Button, IconButton, cn, statusTone } from '@/ui';

import { hasRolls, openingActions, rollsText, stockTone } from './stocksLogic';

export const TONE_CLASS = { positive: 'text-emerald-700', negative: 'text-red-600', zero: 'text-slate-500' };

/**
 * The stock status of a product, in the app-wide status colours (same as the Stocks filter chips): In stock (green),
 * Low stock (amber, at or below its minimum), Out of stock (red), Oversold (red, negative stock).
 */
export function stockStatus(row) {
  const tone = stockTone(row.available);
  if (tone === 'negative') return { label: 'Oversold', tone: 'danger' };
  if (tone === 'zero') return { label: 'Out of stock', tone: statusTone('Out of stock') };
  const min = row.minStockLevel || 0;
  if (min > 0 && row.available <= min) return { label: 'Low stock', tone: statusTone('Low stock') };
  return { label: 'In stock', tone: statusTone('In stock') };
}

/** Available quantity as a stock-status badge; `showLabel` adds "In stock" / "Low stock" / "Out of stock" / "Oversold". */
export function AvailableValue({ row, className, showLabel = false }) {
  const status = stockStatus(row);
  return (
    <span title={status.label} className="inline-flex max-w-full">
      <Badge tone={status.tone} className={cn('text-sm font-bold tabular-nums', className)}>
        {row.available}
        {showLabel ? (
          <span className="ml-1.5 text-[11px] font-semibold opacity-80">{status.label}</span>
        ) : null}
      </Badge>
    </span>
  );
}

/**
 * The roll count under a quantity ("12 rolls"), for products counted in rolls only (`row` = the stock row; products
 * never counted in rolls show nothing, as before rolls existed). `strong` = the available rolls (darker).
 */
export function RollsLine({ row, rolls, strong = false }) {
  if (!hasRolls(row)) return null;
  return (
    <div
      className={cn(
        'mt-0.5 text-[11px] font-semibold whitespace-nowrap tabular-nums',
        rolls < 0 ? 'text-red-600' : strong ? 'text-brand-800' : 'text-slate-500',
      )}
    >
      {rollsText(rolls)}
    </div>
  );
}

/** Opening stock value: a gold-tinted badge when there is one (red when negative), a muted 0 otherwise. */
export function OpeningValue({ row }) {
  if (openingActions(row) === 'edit') {
    return (
      <Badge tone={row.opening < 0 ? 'danger' : 'brand'} className="text-sm font-bold tabular-nums">
        {row.opening}
      </Badge>
    );
  }
  return <span className="text-slate-400 tabular-nums">0</span>;
}

/**
 * "History", "Set Min Stock" and "Add Old Stock", or "Edit Old Stock" + "Delete Old Stock" when an opening stock exists.
 * Row-level colours: History = info, min-stock alert = amber (the Low stock colour), add = gold, edit = blue, delete = red.
 */
export function StockActions({ row, onViewHistory, onEditOpening, onDeleteOpening, onSetMinStock }) {
  const hasOpening = openingActions(row) === 'edit';
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outlineInfo"
        size="sm"
        icon={Eye}
        onClick={onViewHistory}
        className="flex-1 max-sm:min-h-11"
      >
        History
      </Button>
      <IconButton
        icon={BellPlus}
        label="Set Min Stock"
        variant="outlineWarning"
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
          variant="outlineGold"
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
    <div className="min-w-0 rounded-xl bg-slate-50 px-2 py-2 text-center ring-1 ring-line ring-inset">
      <div className="text-[10px] font-bold tracking-[0.08em] text-slate-500 uppercase">{label}</div>
      <div className="mt-1 text-base">{children}</div>
    </div>
  );
}

/** One product as a phone card: opening / purchased / sold / available (+ rolls), history and opening-stock actions. */
export function StockCard({ row, ...actions }) {
  return (
    <div className="space-y-3">
      <div className="font-display text-base font-bold break-words text-brand-800">{row.description}</div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
        <Metric label="Opening">
          <OpeningValue row={row} />
          <RollsLine row={row} rolls={row.openingRolls} />
        </Metric>
        <Metric label="Purchased">
          <span className="font-semibold text-slate-800 tabular-nums">{row.purchased}</span>
          <RollsLine row={row} rolls={row.purchasedRolls} />
        </Metric>
        <Metric label="Avg Rate">
          <span className="font-semibold text-brand-800 tabular-nums">
            {row.avgPurchaseRate > 0 ? formatRupees(row.avgPurchaseRate) : '-'}
          </span>
        </Metric>
        <Metric label="Sold">
          <span className="font-semibold text-slate-800 tabular-nums">{row.sold}</span>
          <RollsLine row={row} rolls={row.soldRolls} />
        </Metric>
        <Metric label="Available">
          <AvailableValue row={row} className="px-2" />
          <RollsLine row={row} rolls={row.availableRolls} strong />
        </Metric>
      </div>
      <StockActions row={row} {...actions} />
    </div>
  );
}
