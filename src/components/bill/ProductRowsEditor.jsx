/**
 * Product lines of a bill (Sales Bill, Purchase Bill, Edit Purchase): S.No, description with shortcut
 * autocomplete, qty, rate, computed amount, remove, plus "Add Product". Table on tablets/desktops, one card per
 * line on phones.
 *
 * Props
 *  - rows: Array<{description: string, qty: string, rate: string}>   (strings, like the form state)
 *  - onChange(rows)                                                  receives the whole new array
 *  - shortcuts: Array<{shortcutKey, fullDescription}> | null         product catalogue (null = still loading)
 *  - readOnly?: boolean                                              hides add/remove, locks inputs
 *  - addLabel?: string                                               default "Add Product"
 * Removing the last row leaves one blank row. `EMPTY_ROW`, `matchShortcuts`, `isKnownProduct` are re-exported.
 */
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { rowAmount } from '@/core/billing';
import { formatCurrency } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { getStockQuantityMap } from '@/features/overview/stocks/stocksService';
import { Button, IconButton, NumberField } from '@/ui';
import { cn } from '@/ui/cn';
import { ProductDescriptionInput } from './ProductDescriptionInput';
import { EMPTY_ROW, removeRowAt } from './productMatch';

export { EMPTY_ROW, isKnownProduct, matchShortcuts } from './productMatch';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function ProductRowsEditor({ rows, onChange, shortcuts, readOnly, addLabel = 'Add Product' }) {
  const { isCompact } = useBreakpoint();
  const [stockMap, setStockMap] = useState(new Map());

  useEffect(() => {
    getStockQuantityMap()
      .then(setStockMap)
      .catch((err) => console.error('Failed to load stock quantities:', err));
  }, []);

  const getStock = (desc) => {
    if (!desc || typeof desc !== 'string' || !desc.trim() || !stockMap) return null;
    return stockMap.get(desc.trim()) || stockMap.get(desc.trim().toLowerCase()) || null;
  };

  const update = (index, patch) => onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index) => onChange(removeRowAt(rows, index));
  const add = () => onChange([...rows, { ...EMPTY_ROW }]);

  return (
    <div>
      {isCompact ? (
        <ul className="space-y-3">
          {rows.map((row, i) => (
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
              <div className="mt-2.5 grid grid-cols-[1fr_1fr] gap-2.5">
                <div>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-xs font-semibold text-slate-600">Qty</span>
                    {(() => {
                      const st = getStock(row.description);
                      if (!st || typeof st.available !== 'number') return null;
                      return (
                        <span
                          className={cn(
                            'py-0.2 rounded px-1.5 text-[10px] font-bold tabular-nums',
                            st.available > 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : st.available === 0
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-red-50 text-red-700',
                          )}
                        >
                          Stock: {st.available}
                        </span>
                      );
                    })()}
                  </div>
                  <NumberField value={row.qty} readOnly={readOnly} onChange={(qty) => update(i, { qty })} />
                </div>
                <div>
                  <div className="pb-1 text-xs font-semibold text-slate-600">Rate</div>
                  <NumberField
                    value={row.rate}
                    readOnly={readOnly}
                    onChange={(rate) => update(i, { rate })}
                  />
                </div>
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-gold-50/70 px-3 py-2 ring-1 ring-gold-200/70">
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">Amount</span>
                <span className="text-right font-display text-lg font-extrabold [overflow-wrap:anywhere] text-brand-800 tabular-nums">
                  {rupees(rowAmount(row.qty, row.rate))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-line">
          <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                <th className="w-14 rounded-tl-xl border-b border-line bg-slate-50/80 px-3 py-2.5">S.No</th>
                <th className="border-b border-line bg-slate-50/80 px-2 py-2.5">Description</th>
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
              {rows.map((row, i) => (
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
                      aria-label={`Quantity of item ${i + 1}`}
                      value={row.qty}
                      readOnly={readOnly}
                      onChange={(qty) => update(i, { qty })}
                    />
                    {(() => {
                      const st = getStock(row.description);
                      if (!st || typeof st.available !== 'number') return null;
                      return (
                        <div className="mt-1 text-right">
                          <span
                            className={cn(
                              'inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                              st.available > 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : st.available === 0
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-red-50 text-red-700',
                            )}
                          >
                            Stock: {st.available}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="border-b border-line px-1.5 py-2">
                    <NumberField
                      aria-label={`Rate of item ${i + 1}`}
                      value={row.rate}
                      readOnly={readOnly}
                      onChange={(rate) => update(i, { rate })}
                    />
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
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly ? (
        <Button variant="primary" icon={Plus} onClick={add} fullWidth className="mt-3 min-h-12">
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}
