/**
 * Available Stocks — replaces original-app/stocks.html + js/stocks.js.
 * Financial summary tiles, searchable per-product stock (table → cards on phones), "Stock Details" history dialog and
 * the opening ("old") stock add / edit / delete flow.
 */
import { Boxes, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';

import { formatRupees } from '@/core/format';
import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Card, DataTable, EmptyState, ErrorState, Page, SearchBar, useFeedback, Button } from '@/ui';

import RefreshButton from '../components/RefreshButton';
import ShowMore from '../components/ShowMore';
import SkeletonRows from '../components/SkeletonRows';
import { usePagedRows } from '../components/paging';
import FinancialSummary from './FinancialSummary';
import OpeningStockModal from './OpeningStockModal';
import StockDetailModal from './StockDetailModal';
import RestockDashboard from './RestockDashboard';
import { AvailableValue, OpeningValue, StockActions, StockCard } from './StockRowParts';
import { filterStocks } from './stocksLogic';
import { loadStocks } from './stocksService';

export default function StocksPage() {
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [historyRow, setHistoryRow] = useState(null);
  const [openingRow, setOpeningRow] = useState(null);
  const [minStockRow, setMinStockRow] = useState(null);
  const [savingMinStock, setSavingMinStock] = useState(false);

  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
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

  const saveOpening = async (description, qty) => {
    try {
      await db.saveOpeningStock(description, qty);
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
    onSetMinStock: () => setMinStockRow(row),
  });

  const columns = [
    {
      key: 'product',
      header: 'Product Description',
      className: 'min-w-44 font-semibold text-brand-800',
      value: (r) => r.description,
    },
    { key: 'opening', header: 'Opening Stock', align: 'right', render: (r) => <OpeningValue row={r} /> },
    {
      key: 'purchased',
      header: 'Total Purchased Qty',
      align: 'right',
      className: 'tabular-nums text-slate-700',
      value: (r) => r.purchased,
    },
    {
      key: 'avgPurchaseRate',
      header: 'Average Purchase Rate',
      align: 'right',
      className: 'tabular-nums font-semibold text-brand-800',
      render: (r) => (r.avgPurchaseRate > 0 ? formatRupees(r.avgPurchaseRate) : '-'),
    },
    {
      key: 'sold',
      header: 'Total Sold Qty',
      align: 'right',
      className: 'tabular-nums text-slate-700',
      value: (r) => r.sold,
    },
    {
      key: 'available',
      header: 'Available Stock',
      align: 'right',
      render: (r) => <AvailableValue row={r} showLabel />,
    },
    {
      key: 'minStock',
      header: 'Min Stock',
      align: 'right',
      className: 'tabular-nums text-slate-700 font-medium',
      value: (r) => r.minStockLevel || '-',
    },
    { key: 'actions', header: 'Details', render: (r) => <StockActions {...actionsFor(r)} compact /> },
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
        {data ? <RestockDashboard rows={data.rows} onReload={() => void reload()} /> : null}
        {data ? <FinancialSummary summary={data.summary} /> : null}
        <Card className="mb-4 space-y-3 bg-white/80 p-3 sm:p-3.5">
          {/* FABRIC CLASSIFICATION TABS: All / Finished Goods / Raw Grey Rolls */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="mr-1 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Category:
              </span>
              {[
                { id: 'all', label: 'All Items' },
                { id: 'finished', label: 'Finished Fabric' },
                { id: 'rawGrey', label: 'Raw Grey Fabric' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTypeFilter(tab.id)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
                    typeFilter === tab.id
                      ? 'bg-brand-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* INVENTORY HEALTH STATUS TABS */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition ${
                statusFilter === 'all'
                  ? 'bg-brand-900 text-gold-300 shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>All Products</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  statusFilter === 'all' ? 'bg-brand-800 text-gold-200' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {statusCounts.all}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('inStock')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition ${
                statusFilter === 'inStock'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="inline-block size-2 rounded-full bg-emerald-400" />
              <span>In Stock</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  statusFilter === 'inStock' ? 'bg-emerald-800 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {statusCounts.inStock}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('lowStock')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition ${
                statusFilter === 'lowStock'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="inline-block size-2 rounded-full bg-amber-400" />
              <span>Low Stock</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  statusFilter === 'lowStock'
                    ? 'bg-amber-700 text-white'
                    : statusCounts.lowStock > 0
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-200 text-slate-700'
                }`}
              >
                {statusCounts.lowStock}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('outOfStock')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold whitespace-nowrap transition ${
                statusFilter === 'outOfStock'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="inline-block size-2 rounded-full bg-rose-400" />
              <span>Out of Stock</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  statusFilter === 'outOfStock'
                    ? 'bg-rose-800 text-white'
                    : statusCounts.outOfStock > 0
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-slate-200 text-slate-700'
                }`}
              >
                {statusCounts.outOfStock}
              </span>
            </button>
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
    <Page
      title="Available Stocks"
      icon={Boxes}
      actions={<RefreshButton onClick={refresh} refreshing={refreshing} />}
    >
      {body}
      <StockDetailModal row={historyRow} onClose={() => setHistoryRow(null)} />
      <OpeningStockModal row={openingRow} onClose={() => setOpeningRow(null)} onSave={saveOpening} />

      {/* Mini-modal for setting min stock */}
      {minStockRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="animate-in fade-in zoom-in-95 w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl duration-200">
            <div className="border-b border-line px-5 py-4">
              <h3 className="text-lg font-bold text-brand-900">Set Minimum Stock</h3>
              <p className="mt-1 text-sm text-slate-500">{minStockRow.description}</p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSavingMinStock(true);
                try {
                  await db.saveProductMetadata(minStockRow.description, {
                    minStockLevel: Number(e.target.minVal.value),
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
              className="p-5"
            >
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Alert me when stock falls below:
              </label>
              <input
                name="minVal"
                type="number"
                min="0"
                step="any"
                required
                defaultValue={minStockRow.minStockLevel || ''}
                className="w-full rounded-lg border-slate-300 py-2 text-lg shadow-sm focus:border-brand-500 focus:ring-brand-500"
                autoFocus
                disabled={savingMinStock}
              />
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={savingMinStock}
                  onClick={() => setMinStockRow(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="success" loading={savingMinStock}>
                  Save Alert
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Page>
  );
}
