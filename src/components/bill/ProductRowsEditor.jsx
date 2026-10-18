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
 * Removing the last row leaves one blank row. `EMPTY_ROW`, `matchShortcuts`, `isKnownProduct` are re-exported.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { rowAmount, totalRolls } from '@/core/billing';
import { formatCurrency, toNum } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { lookupStock, rollsText, stockLabel } from '@/features/overview/stocks/stocksLogic';
import { getStockQuantityMap } from '@/features/overview/stocks/stocksService';
import { Button, IconButton, NumberField } from '@/ui';
import { cn } from '@/ui/cn';
import { ProductDescriptionInput } from './ProductDescriptionInput';
import { EMPTY_ROW, removeRowAt } from './productMatch';

export { EMPTY_ROW, isKnownProduct, matchShortcuts } from './productMatch';

const rupees = (n) => `₹${formatCurrency(n)}`;

/**
 * On-screen only (never printed): the product's average purchase price, the same number as the Stocks page's
 * "Average Purchase Rate". '-' for a known product with no priced purchase (e.g. opening stock only).
 */
function AvgCostChip({ stock, className = 'mt-1 text-right' }) {
  if (!stock) return null;
  const avg = Number(stock.avgPurchaseRate) || 0;
  return (
    <div className={cn('no-print', className)}>
      <span
        className={cn(
          'inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
          avg > 0 ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-500',
        )}
        title="Average purchase price (purchase bills + dyeing / combing receipts; returns and opening stock excluded)"
      >
        Avg buy {avg > 0 ? rupees(avg) : '-'}
      </span>
    </div>
  );
}

/** Stock pill: green in stock, amber none left, red oversold (`value` decides the colour). */
function StockChip({ value, title, children }) {
  return (
    <span
      title={title}
      className={cn(
        'inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
        value > 0
          ? 'bg-emerald-50 text-emerald-700'
          : value === 0
            ? 'bg-amber-50 text-amber-700'
            : 'bg-red-50 text-red-700',
      )}
    >
      {children}
    </span>
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
    <div>
      {isCompact ? (
        <ul className="space-y-3">
          {rows.map((row, i) => {
            const st = knownStock(row.description);
            const avg = showAvgCost ? getStock(row.description) : null;
            return (
              <li key={i} className="rounded-2xl border border-line bg-white p-3.5 shadow-card">
                <div className="mb-2.5 flex items-center justify-between">
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
                      className="text-red-600 hover:bg-red-50"
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
                    {st ? <StockChip value={st.available}>Stock: {stockLabel(st)}</StockChip> : null}
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
        <div className="rounded-xl border border-line">
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <th className="w-14 rounded-tl-xl border-b border-line bg-slate-50/80 px-3 py-2.5">S.No</th>
                <th className="border-b border-line bg-slate-50/80 px-2 py-2.5">Description</th>
                <th className="w-20 border-b border-line bg-slate-50/80 px-2 py-2.5 text-right lg:w-24">
                  Rolls
                </th>
                <th className="w-24 border-b border-line bg-slate-50/80 px-2 py-2.5 text-right lg:w-28">
                  Qty
                </th>
                <th className="w-28 border-b border-line bg-slate-50/80 px-2 py-2.5 text-right lg:w-32">
                  Rate
                </th>
                <th
                  className={cn(
                    'w-32 border-b border-line bg-slate-50/80 px-3 py-2.5 text-right lg:w-36',
                    readOnly && 'rounded-tr-xl',
                  )}
                >
                  Amount
                </th>
                {!readOnly ? (
                  <th className="w-12 rounded-tr-xl border-b border-line bg-slate-50/80 py-2.5">
                    <span className="sr-only">Remove</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr:last-child>td:first-child]:rounded-bl-xl [&>tr:last-child>td:last-child]:rounded-br-xl">
              {rows.map((row, i) => {
                const st = knownStock(row.description);
                return (
                  <tr
                    key={i}
                    className="group align-top transition-colors focus-within:bg-gold-50/40 hover:bg-gold-50/40"
                  >
                    <td className="border-b border-line px-3 pt-4 text-slate-400 tabular-nums">{i + 1}</td>
                    <td className="border-b border-line px-1.5 py-2">
                      <ProductDescriptionInput
                        label={`Description of item ${i + 1}`}
                        value={row.description}
                        onChange={(description) => update(i, { description })}
                        shortcuts={shortcuts}
                        stockMap={stockMap}
                        readOnly={readOnly}
                      />
                    </td>
                    <td className="border-b border-line px-1.5 py-2">
                      <NumberField
                        wholeNumber
                        aria-label={`Rolls of item ${i + 1}`}
                        value={row.rolls ?? ''}
                        readOnly={readOnly}
                        onChange={(rolls) => update(i, { rolls })}
                      />
                      {st?.hasRolls ? (
                        <div className="mt-1 text-right">
                          <StockChip value={st.availableRolls} title="Rolls in stock">
                            {rollsText(st.availableRolls)}
                          </StockChip>
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-line px-1.5 py-2">
                      <NumberField
                        aria-label={`Quantity of item ${i + 1}`}
                        value={row.qty}
                        readOnly={readOnly}
                        onChange={(qty) => update(i, { qty })}
                      />
                      {st ? (
                        <div className="mt-1 text-right">
                          <StockChip value={st.available}>
                            Stock: {st.available}
                            {st.hasRolls ? ' kg' : ''}
                          </StockChip>
                        </div>
                      ) : null}
                    </td>
                    <td className="border-b border-line px-1.5 py-2">
                      <NumberField
                        aria-label={`Rate of item ${i + 1}`}
                        value={row.rate}
                        readOnly={readOnly}
                        onChange={(rate) => update(i, { rate })}
                      />
                      {showAvgCost ? <AvgCostChip stock={getStock(row.description)} /> : null}
                    </td>
                    <td className="border-b border-line px-3 pt-3.5 text-right font-display font-bold text-brand-800 tabular-nums">
                      {rupees(rowAmount(row.qty, row.rate))}
                    </td>
                    {!readOnly ? (
                      <td className="border-b border-line px-1 py-2 text-center">
                        <IconButton
                          icon={Trash2}
                          label={`Remove item ${i + 1}`}
                          className="text-slate-400 hover:bg-red-50 hover:text-red-600"
                          onClick={() => remove(i)}
                        />
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
        <Button variant="primary" icon={Plus} onClick={add} fullWidth className="mt-3 min-h-12">
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}
