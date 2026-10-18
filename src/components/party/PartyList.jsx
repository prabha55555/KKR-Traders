import { useBreakpoint } from '@/hooks/useBreakpoint';
import { EmptyState } from '@/ui';
import { PartyCard } from './PartyCard';
import { PartyTable } from './PartyTable';

/**
 * The party list of both details pages: the dense table on desktop windows (>= 1024px), cards otherwise (one column
 * on phones, two on tablets), and the same empty state ("No Customers Found" / "No Suppliers Found"; the message says
 * whether the search found nothing or there is no data yet).
 * rows = PartyRow[] of the current page (see ./index.js) · renderActions(row, { dense }) = optional row actions.
 */
export function PartyList({ kind, rows, searching, renderActions, actionsHeader }) {
  const { isExpanded } = useBreakpoint();

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-white shadow-card">
        <EmptyState
          icon={kind.icon}
          title={`No ${kind.plural} Found`}
          message={searching ? `No ${kind.noun} matches your search.` : kind.emptyMessage}
        />
      </div>
    );
  }

  if (isExpanded) {
    return <PartyTable kind={kind} rows={rows} renderActions={renderActions} actionsHeader={actionsHeader} />;
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-3.5">
      {rows.map((row, i) => (
        <li key={row.key} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <PartyCard row={row} kind={kind} renderActions={renderActions} />
        </li>
      ))}
    </ul>
  );
}
