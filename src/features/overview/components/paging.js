import { usePagination } from '@/ui';

export const PAGE_SIZE = 100;
/** Rows shown per page on the overview lists (Stocks, Revenue, Expenses, Shortcuts). */
export const LIST_PAGE_SIZE = 10;

/** First `limit` rows plus how many were left out. Pure so it can be tested. */
export function pageSlice(rows, limit) {
  if (rows.length <= limit) return { rows, remaining: 0 };
  return { rows: rows.slice(0, limit), remaining: rows.length - limit };
}

/**
 * Pages a (filtered) list: `rows` = the current page, `pager` = props for <Pagination> (see ShowMore.jsx). Totals are
 * always computed from the full list by the caller. `resetKey` (e.g. the search terms) starts again from page 1.
 */
export function usePagedRows(rows, resetKey) {
  const pager = usePagination(rows, { pageSize: LIST_PAGE_SIZE, resetKey });
  return { rows: pager.rows, pager };
}
