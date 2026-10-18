/**
 * Available Stocks — replaces original-app/stocks.html + js/stocks.js.
 * Financial summary tiles, searchable per-product stock (table → cards on phones), "Stock Details" history dialog and
 * the opening ("old") stock add / edit / delete flow.
 */
import { Boxes, Save, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatRupees } from '@/core/format';
import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Badge,
  Button,
  Card,
  ChoiceChips,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  NumberField,
  Page,
  SearchBar,
  statusTone,
  useFeedback,
} from '@/ui';

import ShowMore from '../components/ShowMore';
import SkeletonRows from '../components/SkeletonRows';
import { usePagedRows } from '../components/paging';
import FinancialSummary from './FinancialSummary';
import OpeningStockModal from './OpeningStockModal';
import StockDetailModal from './StockDetailModal';
import RestockDashboard from './RestockDashboard';
import { AvailableValue, OpeningValue, RollsLine, StockActions, StockCard } from './StockRowParts';
import { filterStocks } from './stocksLogic';
import { loadStocks } from './stocksService';

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Items' },
  { value: 'finished', label: 'Finished Fabric' },
  { value: 'rawGrey', label: 'Raw Grey Fabric' },
];

/** Inventory health filters; each count badge takes its colour from the app-wide status map. */
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Products', tone: 'brand' },
  { value: 'inStock', label: 'In Stock', tone: statusTone('In stock') },
  { value: 'lowStock', label: 'Low Stock', tone: statusTone('Low stock') },
  { value: 'outOfStock', label: 'Out of Stock', tone: statusTone('Out of stock') },
];

const MIN_STOCK_FORM_ID = 'min-stock-form';

export default function StocksPage() {
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [historyRow, setHistoryRow] = useState(null);
  const [openingRow, setOpeningRow] = useState(null);
  const [minStockRow, setMinStockRow] = useState(null);
  const [minStockValue, setMinStockValue] = useState('');
  const [savingMinStock, setSavingMinStock] = useState(false);

  const { loading, error, reload } = useFocusLoad(async () => {
    try {
      setData(await loadStocks());
    } catch (e) {
      console.error('Error loading stocks:', e);
      throw new Error('Error loading stocks. Please try again.');
    }
  });

  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'inStock' | 'lowStock' | 'outOfStock'
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'rawGrey' | 'finished'

  // Count products by inventory health
  const statusCounts = useMemo(() => {
    const list = data?.rows ?? [];
    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;
    list.forEach((r) => {
      const avail = r.available ?? 0;
      const min = r.minStockLevel || 0;
      if (avail <= 0) {
        outOfStock++;
      } else if (min > 0 && avail <= min) {
        lowStock++;
      } else {
        inStock++;
      }
    });
    return { all: list.length, inStock, lowStock, outOfStock };
  }, [data]);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    let filtered = list;

    // Filter by fabric type (All / Raw Grey / Finished Goods)
    if (typeFilter === 'rawGrey') {
      filtered = filtered.filter((r) => {
        const desc = (r.description || '').toLowerCase();
        return desc.includes('grey') || desc.includes('greige') || desc.includes('raw');
      });
    } else if (typeFilter === 'finished') {
      filtered = filtered.filter((r) => {
        const desc = (r.description || '').toLowerCase();
        return !(desc.includes('grey') || desc.includes('greige') || desc.includes('raw'));
      });
    }

    if (statusFilter === 'inStock') {
      filtered = filtered.filter((r) => {
        const avail = r.available ?? 0;
        const min = r.minStockLevel || 0;
        return avail > 0 && (min === 0 || avail > min);
      });
    } else if (statusFilter === 'lowStock') {
      filtered = filtered.filter((r) => {
        const avail = r.available ?? 0;
        const min = r.minStockLevel || 0;
        return avail > 0 && min > 0 && avail <= min;
      });
    } else if (statusFilter === 'outOfStock') {
      filtered = filtered.filter((r) => (r.available ?? 0) <= 0);
    }
    return filterStocks(filtered, search);
  }, [data, statusFilter, typeFilter, search]);

  const paged = usePagedRows(rows, `${search}|${statusFilter}|${typeFilter}`);

  const saveOpening = async (description, qty, rolls) => {
    try {
      await db.saveOpeningStock(description, qty, rolls);
      toast('Saved!', 'Opening stock updated successfully.', 'success');
      setOpeningRow(null);
      await reload();
    } catch (e) {
      console.error('Error saving opening stock:', e);
      toast('Error', 'Failed to save opening stock.', 'error');
    }
  };

  const deleteOpening = async (row) => {
    const ok = await confirm({
      title: 'Are you sure?',
      message: `Do you want to delete the opening stock for "${row.description}"?`,
      tone: 'danger',
      confirmText: 'Yes, delete it!',
    });
    if (!ok) return;
    try {
      await db.deleteOpeningStock(row.description);
      toast('Deleted!', 'Opening stock has been deleted.', 'success');
      await reload();
    } catch (e) {
      console.error('Error deleting opening stock:', e);
      toast('Error', 'Failed to delete opening stock.', 'error');
    }
  };

  const actionsFor = (row) => ({
    row,
    onViewHistory: () => setHistoryRow(row),
    onEditOpening: () => setOpeningRow(row),
    onDeleteOpening: () => void deleteOpening(row),
    onSetMinStock: () => {
      setMinStockValue(row.minStockLevel ? String(row.minStockLevel) : '');
      setMinStockRow(row);
    },
  });

  const columns = [
    {
      key: 'product',
      header: 'Product Description',
      className: 'min-w-44 font-semibold break-words text-brand-800',
      value: (r) => r.description,
    },
    {
      key: 'opening',
      header: 'Opening Stock',
      align: 'right',
      render: (r) => (
        <>
          <OpeningValue row={r} />
          <RollsLine row={r} rolls={r.openingRolls} />
        </>
      ),
    },
    {
      key: 'purchased',
      header: 'Total Purchased Qty',
      align: 'right',
      className: 'text-slate-700',
      render: (r) => (
        <>
          {r.purchased}
          <RollsLine row={r} rolls={r.purchasedRolls} />
        </>
      ),
    },
    {
      key: 'avgPurchaseRate',
      header: 'Average Purchase Rate',
      align: 'right',
      className: 'font-semibold text-brand-800',
      render: (r) => (r.avgPurchaseRate > 0 ? formatRupees(r.avgPurchaseRate) : '-'),
    },
    {
      key: 'sold',
      header: 'Total Sold Qty',
      align: 'right',
      className: 'text-slate-700',
      render: (r) => (
        <>
          {r.sold}
          <RollsLine row={r} rolls={r.soldRolls} />
        </>
      ),
    },
    {
      key: 'available',
      header: 'Available Stock',
      align: 'right',
      render: (r) => (
        <>
          <AvailableValue row={r} showLabel />
          <RollsLine row={r} rolls={r.availableRolls} strong />
        </>
      ),
    },
    {
      key: 'minStock',
      header: 'Min Stock',
      align: 'right',
      className: 'font-medium text-slate-700',
      value: (r) => r.minStockLevel || '-',
    },
    { key: 'actions', header: 'Details', nowrap: true, render: (r) => <StockActions {...actionsFor(r)} /> },
  ];

  let body;
  if (loading) body = <SkeletonRows count={4} height="h-36" />;
  else if (error) body = <ErrorState message={error} onRetry={() => void reload()} />;
  else {
    const empty =
      !data || data.rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No stock data available."
          message="Products appear here once you record purchases or sales."
        />
      ) : (
        <EmptyState icon={SearchX} title="No matching products" message="Try a different search." />
      );
    body = (
      <>
        {data ? <RestockDashboard rows={data.rows} /> : null}
        {data ? <FinancialSummary summary={data.summary} /> : null}
        <Card className="mb-4 space-y-3">
          {/* FABRIC CLASSIFICATION: All / Finished Goods / Raw Grey Rolls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Category:</span>
            <ChoiceChips value={typeFilter} onChange={setTypeFilter} options={CATEGORY_OPTIONS} />
          </div>

          {/* INVENTORY HEALTH STATUS (counts in the app-wide status colours) */}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Status:</span>
            <ChoiceChips
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    {o.label}
                    <Badge tone={o.tone}>{statusCounts[o.value]}</Badge>
                  </span>
                ),
              }))}
            />
          </div>

          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by Product Description..."
            aria-label="Search by product description"
          />
        </Card>
        <DataTable
          columns={columns}
          rows={paged.rows}
          rowKey={(r) => r.description}
          renderCard={(r) => <StockCard {...actionsFor(r)} />}
          empty={empty}
          dense
        />
        <ShowMore pager={paged.pager} noun="products" />
      </>
    );
  }

  return (
    <Page title="Available Stocks" icon={Boxes}>
      {body}
      <StockDetailModal row={historyRow} onClose={() => setHistoryRow(null)} />
      <OpeningStockModal row={openingRow} onClose={() => setOpeningRow(null)} onSave={saveOpening} />

      {/* Minimum stock alert */}
      <Modal
        open={minStockRow !== null}
        onClose={savingMinStock ? undefined : () => setMinStockRow(null)}
        title="Set Minimum Stock"
        size="sm"
        footer={
          <>
            <Button
              variant="neutral"
              disabled={savingMinStock}
              onClick={() => setMinStockRow(null)}
              className="max-sm:flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form={MIN_STOCK_FORM_ID}
              variant="success"
              icon={Save}
              loading={savingMinStock}
              className="max-sm:flex-1"
            >
              Save Alert
            </Button>
          </>
        }
      >
        {minStockRow ? (
          <form
            id={MIN_STOCK_FORM_ID}
            onSubmit={async (e) => {
              e.preventDefault();
              setSavingMinStock(true);
              try {
                await db.saveProductMetadata(minStockRow.description, {
                  minStockLevel: Number(minStockValue),
                });
                setMinStockRow(null);
                toast('Saved!', 'Minimum stock alert updated.', 'success');
                await reload();
              } catch (err) {
                console.error(err);
                toast('Error', 'Failed to save Min Stock Level', 'error');
              } finally {
                setSavingMinStock(false);
              }
            }}
          >
            <p className="mb-4 rounded-xl bg-gold-50/60 px-3.5 py-2.5 text-sm font-semibold break-words text-brand-800 ring-1 ring-gold-100">
              {minStockRow.description}
            </p>
            <NumberField
              name="minVal"
              label="Alert me when stock falls below:"
              value={minStockValue}
              onChange={setMinStockValue}
              required
              autoFocus
              disabled={savingMinStock}
            />
          </form>
        ) : null}
      </Modal>
    </Page>
  );
}
