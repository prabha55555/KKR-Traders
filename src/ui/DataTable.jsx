import { useBreakpoint } from '@/hooks/useBreakpoint';
import { cn } from './cn';
import { EmptyState } from './States';

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' };

/**
 * Table on tablets/desktops, card list on phones.
 *
 * columns: [{ key, header, align?, className?, value?: (row, i) => text, render?: (row, i) => node,
 *             mobile?: 'title' | 'hide' }]
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

  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';
  return (
    <div className={cn('overflow-x-auto rounded-2xl border border-line bg-white shadow-card', className)}>
      <table className="w-full min-w-max text-sm">
        <thead>
          <tr className="border-b border-line bg-linear-to-b from-slate-50 to-slate-100/70 text-[11px] tracking-[0.08em] text-slate-500 uppercase">
            {columns.map((c) => (
              <th key={c.key} className={cn(pad, 'font-bold whitespace-nowrap', ALIGN[c.align ?? 'left'])}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'transition-colors',
                onRowClick ? 'cursor-pointer hover:bg-gold-50/70' : 'hover:bg-slate-50/70',
              )}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn(pad, 'text-slate-800', ALIGN[c.align ?? 'left'], c.className)}>
                  {cellContent(c, row, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer ? (
          <tfoot className="border-t border-gold-200 bg-gold-50/60">
            <tr>
              <td colSpan={columns.length} className={pad}>
                {footer}
              </td>
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
