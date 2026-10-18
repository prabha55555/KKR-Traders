/**
 * Product description box with the shortcut autocomplete dropdown (sales.html / script.js "autocomplete-item").
 *
 * Props
 *  - value: string                      current description
 *  - onChange(value: string)            typed text OR the full description of a picked suggestion
 *  - shortcuts: Array<{shortcutKey, fullDescription}> | null   product catalogue (null while loading: no hints)
 *  - stockMap?: Map                     stock lookup (stocksService.getStockQuantityMap): stock hints + stock products
 *                                       ("In Stock: 80 kg · 12 rolls" for a product counted in rolls)
 *  - readOnly?: boolean
 *  - label: string                      accessible label
 *  - placeholder?: string
 *  - className?: string
 * Keyboard: ArrowUp/ArrowDown move, Enter picks, Escape closes. A description that is not in the catalogue
 * is flagged ("Select a product from the suggestions") once the box loses focus, mirroring the save validation.
 */
import { useId, useMemo, useState } from 'react';
import { lookupStock, stockLabel } from '@/features/overview/stocks/stocksLogic';
import { Badge } from '@/ui';
import { cn } from '@/ui/cn';
import { isKnownProduct, matchShortcuts } from './productMatch';

/** The app's Badge sized down for a hint under an input / inside a table cell. */
export const CHIP_CLASS = 'px-1.5! text-[10px]! leading-4! tabular-nums';

/**
 * Stock pill in the app's status colours: green in stock, amber none left, red oversold (`value` decides the colour).
 * `title` = optional tooltip.
 */
export function StockBadge({ value, title, className, children }) {
  const badge = (
    <Badge
      tone={value > 0 ? 'success' : value === 0 ? 'warning' : 'danger'}
      className={cn(CHIP_CLASS, className)}
    >
      {children}
    </Badge>
  );
  return title ? <span title={title}>{badge}</span> : badge;
}

export function ProductDescriptionInput({
  value,
  onChange,
  shortcuts,
  stockMap,
  readOnly,
  label,
  placeholder = 'Type product name or shortcut',
  className,
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const shortcutSuggestions = focused && !readOnly && !dismissed ? matchShortcuts(shortcuts, value) : [];

  const suggestions = useMemo(() => {
    if (!focused || readOnly || dismissed) return [];
    const res = [...shortcutSuggestions];
    const seen = new Set(res.map((s) => s.fullDescription.toLowerCase().trim()));
    const q = (value ?? '').trim().toLowerCase();
    if (stockMap && typeof stockMap.entries === 'function') {
      for (const [desc, info] of stockMap.entries()) {
        const norm = String(desc).trim().toLowerCase();
        if (norm && !seen.has(norm) && (!q || norm.includes(q))) {
          seen.add(norm);
          res.push({
            shortcutKey: 'STOCK',
            fullDescription: String(desc).trim(),
            stock: info?.available ?? 0,
          });
          if (res.length >= 12) break;
        }
      }
    }
    return res;
  }, [focused, readOnly, dismissed, shortcutSuggestions, stockMap, value]);

  const open = suggestions.length > 0;
  const matchedStock = typeof value === 'string' ? lookupStock(stockMap, value) : null;
  const inStock = Boolean(matchedStock);
  const isKnown = (!!shortcuts && isKnownProduct(shortcuts, value)) || inStock;
  const unknown = !focused && (!!shortcuts || inStock) && value.trim().length > 0 && !isKnown;
  const noMatch =
    focused &&
    !readOnly &&
    !dismissed &&
    (!!shortcuts || !!stockMap) &&
    value.trim().length > 0 &&
    suggestions.length === 0;
  const active = Math.min(highlight, suggestions.length - 1);

  const pick = (s) => {
    onChange(s.fullDescription);
    setDismissed(true);
  };

  const handleBlur = () => {
    setFocused(false);
    if (!value || typeof value !== 'string' || !value.trim() || !shortcuts) return;
    const trimmed = value.trim().toLowerCase();
    // 1. If it matches a shortcut key (e.g. user typed "LJ"), resolve to the official catalogue description
    const byKey = shortcuts.find((s) => (s.shortcutKey || '').trim().toLowerCase() === trimmed);
    if (byKey) {
      onChange(byKey.fullDescription);
      return;
    }
    // 2. If it matches a full description (case-insensitive), normalize to official master casing
    const byDesc = shortcuts.find((s) => (s.fullDescription || '').trim().toLowerCase() === trimmed);
    if (byDesc) {
      onChange(byDesc.fullDescription);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight(Math.min(active + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight(Math.max(active - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && suggestions[active]) {
        e.preventDefault();
        pick(suggestions[active]);
      } else if (shortcuts && value && typeof value === 'string' && value.trim()) {
        const trimmed = value.trim().toLowerCase();
        const byKey = shortcuts.find((s) => (s.shortcutKey || '').trim().toLowerCase() === trimmed);
        if (byKey) {
          e.preventDefault();
          pick(byKey);
        } else {
          const byDesc = shortcuts.find((s) => (s.fullDescription || '').trim().toLowerCase() === trimmed);
          if (byDesc) {
            e.preventDefault();
            pick(byDesc);
          }
        }
      }
    } else if (e.key === 'Escape') {
      setDismissed(true);
    }
  };

  return (
    <div className={cn('relative min-w-0', className)}>
      <input
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-invalid={unknown || undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        placeholder={placeholder}
        value={value || ''}
        readOnly={readOnly}
        onChange={(e) => {
          setDismissed(false);
          setHighlight(0);
          onChange(e.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={handleBlur}
        onKeyDown={onKeyDown}
        className={cn(
          'block min-h-11 w-full min-w-0 rounded-xl border bg-white px-3.5 py-2 text-slate-900 shadow-[inset_0_1px_2px_rgb(20_26_48/0.04)] transition duration-150 sm:min-h-10',
          'placeholder:text-slate-400 read-only:bg-slate-50 read-only:text-slate-600 hover:border-slate-400 focus:ring-4 focus:outline-none',
          unknown
            ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
            : isKnown
              ? 'border-emerald-400/80 focus:border-emerald-500 focus:ring-emerald-100'
              : 'border-slate-300 focus:border-gold-500 focus:ring-gold-100',
        )}
      />
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1.5 max-h-64 animate-fade-in overflow-auto rounded-xl border border-line bg-white/95 p-1 shadow-pop ring-1 ring-brand-900/5 backdrop-blur-md"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.shortcutKey}_${s.fullDescription}_${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so the input does not lose focus before the pick lands
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-800 transition-colors',
                i === active && 'bg-gold-50 ring-1 ring-gold-200',
              )}
            >
              <strong className="shrink-0 rounded-md bg-gold-100 px-1.5 py-0.5 text-xs font-bold text-gold-800 ring-1 ring-gold-200">
                {s.shortcutKey}
              </strong>
              <span className="min-w-0 flex-1 truncate">{s.fullDescription}</span>
              {stockMap
                ? (() => {
                    const stockInfo = lookupStock(stockMap, s.fullDescription);
                    if (!stockInfo || typeof stockInfo.available !== 'number') return null;
                    const qty = stockInfo.available;
                    return (
                      <StockBadge value={qty} className="ml-auto shrink-0">
                        Stock: {qty}
                      </StockBadge>
                    );
                  })()
                : null}
            </li>
          ))}
        </ul>
      ) : null}
      {noMatch ? (
        <p className="mt-1.5 text-xs font-medium text-amber-600">No matching products found in catalogue</p>
      ) : null}
      {unknown ? (
        <p className="mt-1.5 text-xs font-semibold text-red-600" role="alert">
          Select a product from the suggestions
        </p>
      ) : null}
      {isKnown ? (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] font-semibold">
          <span className="flex items-center gap-1 text-emerald-600">✓ In catalogue</span>
          {typeof matchedStock?.available === 'number' && (
            <StockBadge value={matchedStock.available}>📦 In Stock: {stockLabel(matchedStock)}</StockBadge>
          )}
        </div>
      ) : null}
    </div>
  );
}
