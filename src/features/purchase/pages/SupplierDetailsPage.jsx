/**
 * Supplier Details — replaces original-app/supplier-details.html + js/supplier-details.js.
 * Per-supplier totals built from the purchase bills: stats grid, search, table (desktop) / cards (phones, tablets),
 * revealable phone numbers and CSV export. `?phone=` opens the page already searching for that supplier.
 */
import { Download, FileText, Search, Truck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useRouteParams } from '@/hooks/useRouteParams';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  Pagination,
  RefreshButton,
  SearchBar,
  SectionHeader,
  useFeedback,
  usePagination,
} from '@/ui';
import { SupplierList } from '../components/SupplierList';
import { SupplierStatsGrid } from '../components/SupplierStatsGrid';
import { aggregateSuppliers, filterSuppliers, supplierStats } from '../supplierDetails';
import { exportSuppliersCsv } from '../supplierExport';

export default function SupplierDetailsPage() {
  const { toast } = useFeedback();
  const { params } = useRouteParams();
  const [bills, setBills] = useState([]);
  const [returns, setReturns] = useState([]);
  const [directorySuppliers, setDirectorySuppliers] = useState([]);
  const [query, setQuery] = useState(() => (typeof params.phone === 'string' ? params.phone : ''));
  const [exporting, setExporting] = useState(false);

  const { loading, refreshing, error, refresh } = useFocusLoad(async () => {
    const [b, r, s] = await Promise.all([
      db.getAllPurchaseBills(),
      db.getAllPurchaseReturns(),
      db.getAllSuppliers(),
    ]);
    setBills(b);
    setReturns(r);
    setDirectorySuppliers(s);
  });

  const suppliers = useMemo(
    () => aggregateSuppliers(bills, returns, directorySuppliers),
    [bills, returns, directorySuppliers],
  );
  const stats = useMemo(() => supplierStats(suppliers), [suppliers]);
  const visible = useMemo(() => filterSuppliers(suppliers, query), [suppliers, query]);
  const pager = usePagination(visible, { resetKey: query });

  const onExport = async () => {
    if (suppliers.length === 0) {
      toast('Nothing to export', 'No supplier data to export.', 'warning');
      return;
    }
    setExporting(true);
    try {
      // like the original, the export covers every supplier, not just the searched ones
      await exportSuppliersCsv(suppliers);
    } catch (e) {
      console.error('Error exporting suppliers:', e);
      toast('Export failed', 'Could not export the supplier list.', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (loading && bills.length === 0 && directorySuppliers.length === 0) {
    return (
      <Page title="Supplier Details" icon={Truck}>
        <LoadingState label="Loading supplier data…" />
      </Page>
    );
  }
  if (error && bills.length === 0 && directorySuppliers.length === 0) {
    return (
      <Page title="Supplier Details" icon={Truck}>
        <ErrorState message={`Error loading supplier data: ${error}`} onRetry={refresh} />
      </Page>
    );
  }

  const actions = (
    <>
      <Button variant="secondary" icon={Download} loading={exporting} onClick={onExport}>
        Export
      </Button>
      <RefreshButton loading={refreshing} onClick={refresh} />
    </>
  );

  return (
    <Page title="Supplier Details" icon={Truck} max="7xl" actions={actions}>
      <div className="space-y-5">
        <form
          role="search"
          className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-2.5 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search by supplier name, phone, or address..."
            aria-label="Search suppliers"
            className="min-w-0 basis-full sm:flex-1 sm:basis-64"
          />
          <Button type="submit" icon={Search} className="flex-1 sm:flex-none">
            Search
          </Button>
          <Button variant="outline" icon={X} onClick={() => setQuery('')} className="flex-1 sm:flex-none">
            Clear
          </Button>
        </form>
        <SupplierStatsGrid stats={stats} />
        <SectionHeader
          title="Supplier List"
          icon={FileText}
          className="mb-0"
          right={
            <Badge tone="brand" className="tabular-nums">
              {visible.length}
            </Badge>
          }
        />
        <div ref={pager.anchorRef} className="scroll-mt-32" />
        <SupplierList
          suppliers={pager.rows}
          empty={
            <EmptyState
              icon={Truck}
              title="No Suppliers Found"
              message={
                query.trim()
                  ? 'No supplier matches your search.'
                  : 'Add suppliers or create purchase bills to see supplier data here'
              }
            />
          }
        />
        <Pagination pager={pager} noun="suppliers" />
      </div>
    </Page>
  );
}
