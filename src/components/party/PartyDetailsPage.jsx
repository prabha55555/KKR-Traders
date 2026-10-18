import { Download, ListChecks } from 'lucide-react';

import {
  Badge,
  Button,
  ErrorState,
  LoadingState,
  Page,
  Pagination,
  SectionHeader,
  usePagination,
} from '@/ui';
import { PartyList } from './PartyList';
import { PartySearchToolbar } from './PartySearchToolbar';
import { PartyStatsGrid } from './PartyStatsGrid';

/** Export action of the page header (ink = Print / Download / Export); the label folds to the icon on phones. */
export function PartyExportButton({ kind, onClick, loading = false }) {
  return (
    <Button
      variant="secondary"
      icon={Download}
      loading={loading}
      onClick={onClick}
      title={`Export ${kind.nouns}`}
    >
      <span className="max-sm:sr-only">Export</span>
    </Button>
  );
}

/**
 * The one layout of the Customer Details and Supplier Details pages, so both always share the same structure:
 *   Page header (title, icon, Export)  →  search toolbar  →  status cards  →  "<Party> List" heading with the count
 *   →  table (desktop) / cards (phones, tablets)  →  pager  →  the page's dialogs (`children`).
 * Loading and load-error states use the same Page frame.
 *
 * Props
 *  - kind: PARTY_KINDS.customer | PARTY_KINDS.supplier          labels, icon, invoice module
 *  - loading, error, onRetry                                   first-load state (error = message text)
 *  - onExport(), exporting?                                    header Export button
 *  - term, onTermChange(term)                                  committed search text (the toolbar debounces typing)
 *  - tiles                                                     status cards (buildPartyStatTiles)
 *  - items, toRow(item) → PartyRow, resetKey                   the page's filtered list, its row mapper, pager reset
 *  - renderActions?(row, { dense }), actionsHeader?            per-row actions (table column / card footer)
 */
export function PartyDetailsPage({
  kind,
  loading,
  error,
  onRetry,
  onExport,
  exporting,
  term = '',
  onTermChange,
  tiles,
  items,
  toRow,
  resetKey,
  renderActions,
  actionsHeader,
  children,
}) {
  const pager = usePagination(items, { resetKey });
  const head = { title: kind.title, icon: kind.icon, max: '7xl' };

  if (loading) {
    return (
      <Page {...head}>
        <LoadingState label={`Loading ${kind.nouns}…`} />
      </Page>
    );
  }
  if (error) {
    return (
      <Page {...head}>
        <ErrorState message={`Error loading ${kind.noun} data: ${error}`} onRetry={onRetry} />
      </Page>
    );
  }

  return (
    <Page {...head} actions={<PartyExportButton kind={kind} onClick={onExport} loading={exporting} />}>
      <div className="space-y-4 sm:space-y-5">
        <PartySearchToolbar kind={kind} initialTerm={term} onTermChange={onTermChange} />
        <PartyStatsGrid tiles={tiles} kind={kind} />
        <section>
          <SectionHeader
            title={`${kind.name} List`}
            icon={ListChecks}
            className="mb-3"
            right={
              <Badge tone="info" className="tabular-nums" title={`${items.length} ${kind.nouns}`}>
                {items.length}
              </Badge>
            }
          />
          <div ref={pager.anchorRef} className="scroll-mt-32" />
          <PartyList
            kind={kind}
            rows={pager.rows.map(toRow)}
            searching={term.trim() !== ''}
            renderActions={renderActions}
            actionsHeader={actionsHeader}
          />
          <Pagination pager={pager} noun={kind.nouns} />
        </section>
      </div>
      {children}
    </Page>
  );
}
