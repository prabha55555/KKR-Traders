/**
 * Product lines of a bill (Sales Bill, Purchase Bill, Edit Purchase): S.No, description with shortcut
 * autocomplete, rolls, qty, rate, computed amount, remove, plus "Add Product". Table on tablets/desktops, one card per
 * line on phones.
 *
 * Props
 *  - rows: Array<{description: string, rolls?: string, qty: string, rate: string}>   (strings, like the form state)
 *                                                                    rolls = optional roll count (never in the amount)
 *  - onChange(rows)                                                  receives the whole new array
 *  - shortcuts: Array<{shortcutKey, fullDescription}> | null         product catalogue (null = still loading)
 *  - readOnly?: boolean                                              hides add/remove, locks inputs
 *  - addLabel?: string                                               default "Add Product"
 *  - showAvgCost?: boolean                                           default false; Sales Bill only: "Avg buy ₹x" chip
 *                                                                    (the Stocks page's average purchase rate) under Rate
 * Stock hints: under Qty the quantity in stock, under Rolls the rolls in stock (products counted in rolls only); on
 * phones one line "Stock: 80 kg · 12 rolls". When any line has rolls, the bill's total qty and rolls show underneath.
 * Layout: the app's bordered table (.erp-table, every cell outlined) when the editor is at least TABLE_MIN_WIDTH wide;
 * otherwise one card per line — on phones, and in the narrow form column of the bill screens on laptop-sized windows,
 * where the table's number columns would leave no room for the description.
 * Removing the last row leaves one blank row. `EMPTY_ROW`, `matchShortcuts`, `isKnownProduct` are re-exported.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rowAmount, totalRolls } from '@/core/billing';
import { formatCurrency, toNum } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { lookupStock, rollsText, stockLabel } from '@/features/overview/stocks/stocksLogic';
import { getStockQuantityMap } from '@/features/overview/stocks/stocksService';
import { Badge, Button, IconButton, NumberField } from '@/ui';
import { cn } from '@/ui/cn';
import { CHIP_CLASS, ProductDescriptionInput, StockBadge } from './ProductDescriptionInput';
import { EMPTY_ROW, removeRowAt } from './productMatch';

export { EMPTY_ROW, isKnownProduct, matchShortcuts } from './productMatch';

const rupees = (n) => `₹${formatCurrency(n)}`;

/** Editor width (px) the table needs: its number columns take ~520px, the description gets the rest. */
const TABLE_MIN_WIDTH = 680;

/** Rendered width of `ref`'s element in px; 0 until measured (and where ResizeObserver is missing, e.g. tests). */
function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

// The table sits in a flat .erp-table frame (rounded 0.75rem, 1px border) that does not clip, so the product
// suggestions can drop over the rows below; the corner cells follow the frame's curve so their tint stays inside it.
const CORNER_TL = 'rounded-tl-[calc(0.75rem_-_1px)]';
const CORNER_TR = 'rounded-tr-[calc(0.75rem_-_1px)]';
const LAST_ROW_CORNERS =
  '[&>tr:last-child>td:first-child]:rounded-bl-[calc(0.75rem_-_1px)] [&>tr:last-child>td:last-child]:rounded-br-[calc(0.75rem_-_1px)]';
/** Text in a cell lines up with the middle of the 2.5rem inputs beside it. */
const INPUT_LINE = 'inline-flex min-h-10 items-center';

/**
 * On-screen only (never printed): the product's average purchase price, the same number as the Stocks page's
 * "Average Purchase Rate". '-' for a known product with no priced purchase (e.g. opening stock only).
 */
function AvgCostChip({ stock, className = 'mt-1 text-right' }) {
  if (!stock) return null;
  const avg = Number(stock.avgPurchaseRate) || 0;
  return (
    <div className={cn('no-print', className)}>
      <span title="Average purchase price (purchase bills + dyeing / combing receipts; returns and opening stock excluded)">
        {/* never truncated: the whole price shows; if the cell is narrow it wraps between label and price */}
        <Badge tone={avg > 0 ? 'info' : 'neutral'} truncate={false} className={CHIP_CLASS}>
          <span className="whitespace-nowrap">Avg buy</span>
          <span className="whitespace-nowrap">{avg > 0 ? rupees(avg) : '-'}</span>
        </Badge>
      </span>
    </div>
  );
}

export function ProductRowsEditor({
  rows,
  onChange,
  shortcuts,
  readOnly,
  addLabel = 'Add Product',
  showAvgCost = false,
}) {
  const { isCompact } = useBreakpoint();
  const rootRef = useRef(null);
  const width = useElementWidth(rootRef);
  const asCards = isCompact || (width > 0 && width < TABLE_MIN_WIDTH);
  const [stockMap, setStockMap] = useState(new Map());

  useEffect(() => {
    getStockQuantityMap()
      .then(setStockMap)
      .catch((err) => console.error('Failed to load stock quantities:', err));
  }, []);

  const getStock = (desc) => (typeof desc === 'string' ? lookupStock(stockMap, desc) : null);
  /** stock-map entry with a numeric quantity, else null */
  const knownStock = (desc) => {
    const st = getStock(desc);
    return st && typeof st.available === 'number' ? st : null;
  };

  const update = (index, patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index) => onChange(removeRowAt(rows, index));
  const add = () => onChange([...rows, { ...EMPTY_ROW }]);

  const rollsTotal = totalRolls(rows);
  const qtyTotal = Math.round(rows.reduce((sum, r) => sum + toNum(r.qty), 0) * 1000) / 1000;

  return (
    <div ref={rootRef}>
      {asCards ? (
        <ul className="space-y-3">
          {rows.map((row, i) => {
            const st = knownStock(row.description);
            const avg = showAvgCost ? getStock(row.description) : null;
            return (
              <li key={i} className="rounded-2xl border border-line bg-white p-3.5 shadow-card">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-bold text-brand-800">
                    <span
                      aria-hidden
                      className="flex size-6 items-center justify-center rounded-full bg-brand-800 text-xs font-bold text-gold-300 tabular-nums"
                    >
                      {i + 1}
                    </span>
                    Item {i + 1}
                  </span>
                  {!readOnly ? (
                    <IconButton
                      icon={Trash2}
                      label={`Remove item ${i + 1}`}
                      variant="outlineDanger"
                      onClick={() => remove(i)}
                    />
                  ) : null}
                </div>
                <ProductDescriptionInput
                  label={`Description of item ${i + 1}`}
                  value={row.description}
                  onChange={(description) => update(i, { description })}
                  shortcuts={shortcuts}
                  stockMap={stockMap}
                  readOnly={readOnly}
                />
                <div className="mt-2.5 grid grid-cols-[0.8fr_1fr_1fr] gap-2">
                  <div className="min-w-0">
                    <div className="pb-1 text-xs font-semibold text-slate-600">Rolls</div>
                    <NumberField
                      wholeNumber
                      aria-label={`Rolls of item ${i + 1}`}
                      value={row.rolls ?? ''}
                      readOnly={readOnly}
                      onChange={(rolls) => update(i, { rolls })}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="pb-1 text-xs font-semibold text-slate-600">Qty</div>
                    <NumberField
                      aria-label={`Quantity of item ${i + 1}`}
                      value={row.qty}
                      readOnly={readOnly}
                      onChange={(qty) => update(i, { qty })}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="pb-1 text-xs font-semibold text-slate-600">Rate</div>
                    <NumberField
                      aria-label={`Rate of item ${i + 1}`}
                      value={row.rate}
                      readOnly={readOnly}
                      onChange={(rate) => update(i, { rate })}
                    />
                  </div>
                </div>
                {st || avg ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {st ? <StockBadge value={st.available}>Stock: {stockLabel(st)}</StockBadge> : null}
                    <AvgCostChip stock={avg} className="ml-auto" />
                  </div>
                ) : null}
                <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-gold-50/70 px-3 py-2 ring-1 ring-gold-200/70">
                  <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                    Amount
                  </span>
                  <span className="text-right font-display text-lg font-extrabold [overflow-wrap:anywhere] text-brand-800 tabular-nums">
                    {rupees(rowAmount(row.qty, row.rate))}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="erp-table-wrap erp-table-flat overflow-visible">
          <table className="erp-table erp-table-dense table-fixed">
            <thead>
              <tr>
                <th data-align="center" className={cn('w-13', CORNER_TL)}>
                  S.No
                </th>
                <th>Description</th>
                <th className="num w-20">Rolls</th>
                <th className="num w-24">Qty</th>
                {/* wider on the Sales Bill, where the full "Avg buy ₹…" chip sits under the rate */}
                <th className={cn('num', showAvgCost ? 'w-36' : 'w-24')}>Rate</th>
                <th className={cn('num w-34', readOnly && CORNER_TR)}>Amount</th>
                {!readOnly ? (
                  <th className={cn('w-14', CORNER_TR)}>
                    <span className="sr-only">Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className={LAST_ROW_CORNERS}>
              {rows.map((row, i) => {
                const st = knownStock(row.description);
                return (
                  <tr key={i} className="[&:focus-within>td]:bg-gold-50/60 [&>td]:align-top">
                    <td data-align="center" className="text-slate-400 tabular-nums">
                      <span className={INPUT_LINE}>{i + 1}</span>
                    </td>
                    <td>
                      <ProductDescriptionInput
                        label={`Description of item ${i + 1}`}
                        value={row.description}
                        onChange={(description) => update(i, { description })}
                        shortcuts={shortcuts}
                        stockMap={stockMap}
                        readOnly={readOnly}
                      />
                    </td>
                    <td>
                      <NumberField
                        wholeNumber
                        aria-label={`Rolls of item ${i + 1}`}
                        inputClassName="px-2!"
                        value={row.rolls ?? ''}
                        readOnly={readOnly}
                        onChange={(rolls) => update(i, { rolls })}
                      />
                      {st?.hasRolls ? (
                        <div className="mt-1 text-right">
                          <StockBadge value={st.availableRolls} title="Rolls in stock">
                            {rollsText(st.availableRolls)}
                          </StockBadge>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <NumberField
                        aria-label={`Quantity of item ${i + 1}`}
                        inputClassName="px-2!"
                        value={row.qty}
                        readOnly={readOnly}
                        onChange={(qty) => update(i, { qty })}
                      />
                      {st ? (
                        <div className="mt-1 text-right">
                          <StockBadge value={st.available}>
                            Stock: {st.available}
                            {st.hasRolls ? ' kg' : ''}
                          </StockBadge>
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <NumberField
                        aria-label={`Rate of item ${i + 1}`}
                        inputClassName="px-2!"
                        value={row.rate}
                        readOnly={readOnly}
                        onChange={(rate) => update(i, { rate })}
                      />
                      {showAvgCost ? <AvgCostChip stock={getStock(row.description)} /> : null}
                    </td>
                    <td className="num font-display font-bold text-brand-800">
                      <span className={INPUT_LINE}>{rupees(rowAmount(row.qty, row.rate))}</span>
                    </td>
                    {!readOnly ? (
                      <td data-align="center">
                        <span className={INPUT_LINE}>
                          <IconButton
                            icon={Trash2}
                            label={`Remove item ${i + 1}`}
                            variant="outlineDanger"
                            onClick={() => remove(i)}
                          />
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rollsTotal > 0 ? (
        <p className="mt-2 text-right text-xs font-semibold text-slate-500 tabular-nums">
          Total Qty: <span className="text-brand-800">{qtyTotal}</span>
          <span className="mx-1.5 text-slate-300">·</span>
          Total Rolls: <span className="text-brand-800">{rollsTotal}</span>
        </p>
      ) : null}
      {!readOnly ? (
        <Button variant="primary" icon={Plus} onClick={add} fullWidth className="mt-3 min-h-12!">
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}
