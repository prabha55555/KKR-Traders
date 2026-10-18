import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { cn } from './cn';

export const DEFAULT_PAGE_SIZE = 10;

/**
 * Client-side paging of an already filtered list. The caller keeps its own totals / filtering.
 * `resetKey` (e.g. the search text) sends the list back to page 1; a page that no longer exists after the list shrank
 * is clamped. Attach `anchorRef` to the list wrapper so changing page scrolls its top back into view.
 *
 *   const pager = usePagination(visible, { resetKey: query });
 *   pager.rows            -> rows of the current page
 *   <Pagination pager={pager} anchorRef … />
 */
export function usePagination(items, { pageSize = DEFAULT_PAGE_SIZE, resetKey } = {}) {
  const [requested, setRequested] = useState(1);
  const anchorRef = useRef(null);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pageCount);

  useEffect(() => setRequested(1), [resetKey]);

  const setPage = useCallback(
    (next) => {
      setRequested(Math.min(Math.max(1, next), pageCount));
      const el = anchorRef.current;
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' });
    },
    [pageCount],
  );

  const start = (page - 1) * pageSize;
  return {
    rows: items.slice(start, start + pageSize),
    page,
    pageCount,
    total,
    pageSize,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    setPage,
    anchorRef,
  };
}

/** 1 … 4 5 6 … 12 — always the first, last and the neighbours of the current page. */
function pageList(page, count) {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const out = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(count - 1, page + 1);
  if (lo > 2) out.push('gap-start');
  for (let n = lo; n <= hi; n += 1) out.push(n);
  if (hi < count - 1) out.push('gap-end');
  out.push(count);
  return out;
}

/**
 * Pager bar: "Showing 11–20 of 42", Previous / Next and (from `sm`) numbered pages; phones get Previous · Page x of y · Next.
 * Renders nothing when everything fits on one page.
 */
export function Pagination({ pager, noun = 'items', className }) {
  const { page, pageCount, total, from, to, setPage } = pager;
  if (total <= pager.pageSize) return null;
  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'mt-4 flex flex-col items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-card sm:flex-row sm:justify-between',
        className,
      )}
    >
      <p className="text-[13px] font-medium text-slate-500 tabular-nums" aria-live="polite">
        Showing{' '}
        <span className="font-bold text-brand-800">
          {from}–{to}
        </span>{' '}
        of <span className="font-bold text-brand-800">{total}</span> {noun}
      </p>
      <div className="flex w-full items-center gap-1.5 sm:w-auto">
        <Button
          size="sm"
          variant="outline"
          icon={ChevronLeft}
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          aria-label="Previous page"
          className="min-h-11 flex-1 sm:min-h-9 sm:flex-none"
        >
          Prev
        </Button>
        <span className="px-2 text-[13px] font-semibold text-slate-600 tabular-nums sm:hidden">
          {page} / {pageCount}
        </span>
        <ul className="hidden items-center gap-1 sm:flex">
          {pageList(page, pageCount).map((n) =>
            typeof n === 'number' ? (
              <li key={n}>
                <button
                  type="button"
                  onClick={() => setPage(n)}
                  aria-label={`Page ${n}`}
                  aria-current={n === page ? 'page' : undefined}
                  className={cn(
                    'min-h-9 min-w-9 rounded-lg px-2 text-[13px] font-semibold tabular-nums transition focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none',
                    n === page
                      ? 'bg-linear-to-b from-brand-600 to-brand-800 text-gold-200 shadow-sm'
                      : 'text-slate-600 hover:bg-gold-50',
                  )}
                >
                  {n}
                </button>
              </li>
            ) : (
              <li key={n} aria-hidden className="px-1 text-slate-400">
                …
              </li>
            ),
          )}
        </ul>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
          aria-label="Next page"
          className="min-h-11 flex-1 flex-row-reverse sm:min-h-9 sm:flex-none"
        >
          Next
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
