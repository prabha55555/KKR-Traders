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
  Card,
  ChoiceChips,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  Pagination,
  SearchBar,
  Skeleton,
  StatCard,
  StatGrid,
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

export default function RecycleBinScreen({ kind, title }) {
  const config = BIN_CONFIG[kind];
  const { toast, confirm, loading: overlay } = useFeedback();
  const { isExpanded, isMedium } = useBreakpoint();
  const [items, setItems] = useState([]);
  const [now, setNow] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [viewItem, setViewItem] = useState(null);

  const { loading, error, reload } = useFocusLoad(async () => {
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
      const reason = e instanceof Error && e.message.includes('already exists') ? e.message : undefined;
      toast('Failed to restore item', reason, 'error');
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
          <span className="font-display font-bold whitespace-nowrap text-brand-800">{displayBillNo(i)}</span>
          <BinTypeBadge item={i} />
        </div>
      ),
    },
    { key: 'party', header: config.partyLabel, value: (i) => partyName(i) || '-' },
    {
      key: 'date',
      header: 'Date',
      nowrap: true,
      value: (i) => (i.invoiceDate ? formatDateIN(i.invoiceDate) : '-'),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      className: 'font-semibold text-brand-800',
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
    body = <Card>{empty}</Card>;
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
    <Page title={title} icon={Trash2}>
      <StatGrid cols={3} className="mb-5">
        <StatCard icon={FileText} tone="info" value={String(stats.totalItems)} label="Total Items" />
        <StatCard
          icon={Clock}
          tone="warning"
          value={stats.oldestDays === null ? '-' : `${stats.oldestDays} days`}
          label="Oldest Item"
        />
        <StatCard icon={Database} tone="info" value={String(stats.invoiceItems)} label={config.countLabel} />
      </StatGrid>

      <Card className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
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
      </Card>

      <div ref={pager.anchorRef} className="scroll-mt-32" />
      {body}
      <BinDetailSheet item={viewItem} config={config} onClose={() => setViewItem(null)} />
    </Page>
  );
}
