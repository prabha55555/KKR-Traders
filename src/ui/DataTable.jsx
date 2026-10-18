import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from './cn';
import { EmptyState } from './States';

/**
 * Table on tablets/desktops, card list on phones.
 *
 * columns: [{ key, header, align?, nowrap?, className?, headerClassName?, value?: (row, i) => text,
 *             render?: (row, i) => node, mobile?: 'title' | 'hide' }]
 * Desktop uses the app's one bordered table style (.erp-table in styles/index.css): every cell outlined, right-aligned
 * columns stay on one line, text wraps, and a table wider than the screen scrolls inside its own frame.
 * On phones every column becomes a "label: value" line of a card (the `mobile: 'title'` column is the card heading,
 * `mobile: 'hide'` skips a column). Pass `renderCard(row, i)` to draw the phone card yourself.
 * rowKey(row, i) -> unique key · onRowClick(row) makes rows tappable · footer = totals row.
 */
export function DataTable({
  columns,
  rows,
  rowKey,
  onRowClick,
  renderCard,
  empty,
  footer,
  dense = false,
  className,
}) {
  const { isCompact } = useBreakpoint();

  if (rows.length === 0) {
    return (
      <div className={cn('rounded-2xl border border-line bg-white shadow-card', className)}>
        {empty ?? <EmptyState title="No records found" />}
      </div>
    );
  }

  if (isCompact) {
    const titleCol = columns.find((c) => c.mobile === 'title');
    const cols = columns.filter((c) => c.mobile !== 'hide' && c !== titleCol);
    return (
      <ul className={cn('space-y-3', className)}>
        {rows.map((row, i) => (
          <li key={rowKey(row, i)}>
            <div
              role={onRowClick ? 'button' : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => e.key === 'Enter' && onRowClick(row) : undefined}
              className={cn(
                'rounded-2xl border border-line bg-white p-4 shadow-card',
                onRowClick && 'transition active:scale-[0.99] active:bg-gold-50',
              )}
            >
              {renderCard ? (
                renderCard(row, i)
              ) : (
                <>
                  {titleCol ? (
                    <div className="mb-2 font-display font-bold text-brand-800">
                      {cellContent(titleCol, row, i)}
                    </div>
                  ) : null}
                  <dl className="space-y-1.5">
                    {cols.map((c) => (
                      <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                        <dt className="shrink-0 text-slate-500">{c.header}</dt>
                        <dd className="min-w-0 text-right font-medium text-slate-800 tabular-nums">
                          {cellContent(c, row, i)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
          </li>
        ))}
        {footer ? <li className="rounded-2xl border border-line bg-gold-50/60 p-4">{footer}</li> : null}
      </ul>
    );
  }

  return (
    <div className={cn('erp-table-wrap', className)}>
      <table className={cn('erp-table', dense && 'erp-table-dense')}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} data-align={c.align ?? 'left'} className={c.headerClassName}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-align={c.align ?? 'left'}
                  className={cn(c.nowrap && 'nowrap', c.className)}
                >
                  {cellContent(c, row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot>
            <tr>
              <td colSpan={columns.length}>{footer}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function cellContent(col, row, i) {
  if (col.render) return col.render(row, i);
  const v = col.value ? col.value(row, i) : row[col.key];
  return v === null || v === undefined ? '' : String(v);
}
