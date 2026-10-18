/**
 * Shared recycle-bin screen: list deleted bills, view, restore, delete permanently, empty the bin.
 * Configured per bin through `BIN_CONFIG[kind]` (sales = invoices, purchase = purchase bills).
 */
import { Clock, Database, FileText, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatCurrency, formatDateIN } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Button,
  ChoiceChips,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  Pagination,
  RefreshButton,
  SearchBar,
  Skeleton,
  useFeedback,
  usePagination,
} from '@/ui';
import { BinDetailSheet } from './BinDetailSheet';
import { BinItemCard, BinRowActions, BinTypeBadge, deletedAtText } from './BinItemCard';
import {
  BIN_CONFIG,
  binItemName,
  computeBinStats,
  displayBillNo,
  filterBinItems,
  partyName,
} from './binLogic';
import { emptyBin, loadBinItems, permanentlyDeleteBinItem, restoreBinItem } from './binService';

const LOAD_ERROR = 'Failed to load recycle bin items. Please try again.';
const PAGE_SIZE = 10;

function StatTile({ icon: Icon, value, label }) {
  return (
    <div className="group relative flex min-w-0 flex-col items-center gap-1 overflow-hidden rounded-2xl border border-line bg-white px-2 py-3.5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <span className="absolute inset-x-0 top-0 h-px hairline-gold opacity-0 transition group-hover:opacity-100" />
      <span className="flex size-9 items-center justify-center rounded-xl bg-gold-100 text-gold-700 ring-1 ring-gold-200">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="mt-0.5 max-w-full text-center font-display text-base font-extrabold [overflow-wrap:anywhere] text-brand-800 tabular-nums sm:text-lg">
        {value}
      </div>
      <div className="max-w-full text-center text-xs leading-snug font-medium text-slate-500">{label}</div>
    </div>
  );
}

export default function RecycleBinScreen({ kind, title }) {
  const config = BIN_CONFIG[kind];
  const { toast, confirm, loading: overlay } = useFeedback();
  const { isExpanded, isMedium } = useBreakpoint();
  const [items, setItems] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewItem, setViewItem] = useState(null);

  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
    try {
      setItems(await loadBinItems(kind));
      setNow(new Date());
    } catch (e) {
      console.error('Error loading recycle bin items:', e);
      toast('Failed to load recycle bin items', undefined, 'error');
      throw new Error(LOAD_ERROR);
    }
  });

  const stats = useMemo(() => computeBinStats(items, config.itemType, now), [items, config.itemType, now]);
  const visible = useMemo(
    () => filterBinItems(items, typeFilter, search, now),
    [items, typeFilter, search, now],
  );
  const pager = usePagination(visible, { pageSize: PAGE_SIZE, resetKey: `${typeFilter}|${search}` });
  const shown = pager.rows;

  const onRestore = async (item) => {
    const ok = await confirm({
      title: 'Restore Item',
      message: `Are you sure you want to restore this item?\n\n${binItemName(item)} will be restored to its original location.`,
      confirmText: 'Restore',
    });
    if (!ok) return;
    try {
      await overlay.run(
        'Restoring Item',
        async () => {
          await restoreBinItem(kind, item.id);
          await reload();
        },
        'Please wait while we restore the item...',
      );
      toast('Item restored successfully!', undefined, 'success');
    } catch (e) {
      console.error('Error restoring item:', e);
      toast('Failed to restore item', undefined, 'error');
    }
  };

  const onPermanentDelete = async (item) => {
    const ok = await confirm({
      title: 'Permanent Delete',
      message: `This action cannot be undone. The item will be permanently deleted.\n\n${binItemName(item)} will be permanently deleted.\n\nThis action is irreversible!`,
      tone: 'danger',
      confirmText: 'Permanently Delete',
    });
    if (!ok) return;
    try {
      await overlay.run(
        'Deleting Item',
        async () => {
          await permanentlyDeleteBinItem(kind, item.id);
          await reload();
        },
        'Permanently removing item from database...',
      );
      toast('Item permanently deleted!', undefined, 'success');
    } catch (e) {
      console.error('Error deleting item:', e);
      toast('Failed to delete item', undefined, 'error');
    }
  };

  const onEmptyBin = async () => {
    const ok = await confirm({
      title: config.emptyButton,
      message: `${config.emptyConfirmMessage}\n\nAll items will be permanently lost!`,
      tone: 'danger',
      confirmText: config.emptyButton,
    });
    if (!ok) return;
    try {
      const deletedCount = await overlay.run(
        'Emptying Recycle Bin',
        async () => {
          const count = await emptyBin(kind);
          await reload();
          return count;
        },
        'Permanently deleting all items...',
      );
      toast(`Recycle bin emptied! ${deletedCount} items deleted.`, undefined, 'success');
    } catch (e) {
      console.error('Error emptying recycle bin:', e);
      toast('Failed to empty recycle bin', undefined, 'error');
    }
  };

  const actionsFor = (item) => ({
    onView: () => setViewItem(item),
    onRestore: () => void onRestore(item),
    onDelete: () => void onPermanentDelete(item),
  });

  const columns = [
    {
      key: 'no',
      header: 'Invoice No',
      render: (i) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-bold text-brand-800">{displayBillNo(i)}</span>
          <BinTypeBadge item={i} />
        </div>
      ),
    },
    { key: 'party', header: config.partyLabel, value: (i) => partyName(i) || '-' },
    { key: 'date', header: 'Date', value: (i) => (i.invoiceDate ? formatDateIN(i.invoiceDate) : '-') },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      value: (i) => `₹${formatCurrency(i.grandTotal)}`,
    },
    {
      key: 'deleted',
      header: 'Deleted At',
      className: 'text-slate-600',
      value: (i) => deletedAtText(i, now),
    },
    { key: 'actions', header: 'Actions', render: (i) => <BinRowActions item={i} {...actionsFor(i)} /> },
  ];

  const empty =
    items.length === 0 ? (
      <EmptyState icon={Trash2} title={config.emptyTitle} message={config.emptyMessage} />
    ) : (
      <EmptyState icon={Search} title="No matching items" message="Try a different search or filter." />
    );

  let body;
  if (loading) {
    body = (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-2xl" />
        ))}
      </div>
    );
  } else if (error) {
    body = <ErrorState message={error} onRetry={() => void reload()} />;
  } else if (visible.length === 0) {
    body = <div className="rounded-2xl border border-line bg-white shadow-card">{empty}</div>;
  } else {
    body = (
      <>
        {isExpanded ? (
          <DataTable rows={shown} columns={columns} rowKey={(i) => i.id} onRowClick={setViewItem} />
        ) : (
          <ul className={isMedium ? 'grid grid-cols-2 gap-3.5' : 'space-y-3'}>
            {shown.map((i, n) => (
              <li key={i.id} className="animate-rise" style={{ animationDelay: `${Math.min(n, 8) * 40}ms` }}>
                <BinItemCard item={i} now={now} {...actionsFor(i)} />
              </li>
            ))}
          </ul>
        )}
        <Pagination pager={pager} noun="deleted items" />
      </>
    );
  }

  return (
    <Page
      title={title}
      icon={Trash2}
      actions={<RefreshButton loading={refreshing} onClick={() => void refresh()} />}
    >
      <div className="mb-5 grid grid-cols-3 gap-2.5 sm:gap-3.5">
        <StatTile icon={FileText} value={String(stats.totalItems)} label="Total Items" />
        <StatTile
          icon={Clock}
          value={stats.oldestDays === null ? '-' : `${stats.oldestDays} days`}
          label="Oldest Item"
        />
        <StatTile icon={Database} value={String(stats.invoiceItems)} label={config.countLabel} />
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 shadow-card lg:flex-row lg:items-center">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search deleted items..."
          aria-label="Search deleted items"
          className="lg:flex-1"
        />
        <ChoiceChips
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: 'all', label: 'All Items' },
            { value: config.itemType, label: config.typeFilterLabel },
          ]}
        />
        <Button
          variant="outlineDanger"
          icon={Trash2}
          onClick={onEmptyBin}
          disabled={items.length === 0}
          className="lg:shrink-0"
        >
          {config.emptyButton}
        </Button>
      </div>

      <div ref={pager.anchorRef} className="scroll-mt-32" />
      {body}
      <BinDetailSheet item={viewItem} config={config} onClose={() => setViewItem(null)} />
    </Page>
  );
}
