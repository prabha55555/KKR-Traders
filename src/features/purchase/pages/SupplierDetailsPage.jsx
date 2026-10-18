/**
 * Supplier Details — replaces original-app/supplier-details.html + js/supplier-details.js.
 * Same layout as Customer Details (shared `PartyDetailsPage`): per-supplier totals built from the purchase bills —
 * search toolbar, status cards, supplier list (table on desktop, cards on phones / tablets), revealable phone numbers
 * and CSV export. `?phone=` opens the page already searching for that supplier.
 */
import { useMemo, useState } from 'react';

import { PARTY_KINDS, PartyDetailsPage } from '@/components/party';
import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useRouteParams } from '@/hooks/useRouteParams';
import { useFeedback } from '@/ui';
import { buildSupplierStatTiles, toSupplierRow } from '../components/supplierParty';
import { aggregateSuppliers, filterSuppliers, supplierStats } from '../supplierDetails';
import { exportSuppliersCsv } from '../supplierExport';

const KIND = PARTY_KINDS.supplier;

export default function SupplierDetailsPage() {
  const { toast } = useFeedback();
  const { params } = useRouteParams();
  const [bills, setBills] = useState([]);
  const [returns, setReturns] = useState([]);
  const [directorySuppliers, setDirectorySuppliers] = useState([]);
  const [query, setQuery] = useState(() => (typeof params.phone === 'string' ? params.phone : ''));
  const [exporting, setExporting] = useState(false);

  const { loading, error, refresh } = useFocusLoad(async () => {
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
  const visible = useMemo(() => filterSuppliers(suppliers, query), [suppliers, query]);
  // the status cards sum the suppliers shown (follow the search), the same as on Customer Details
  const stats = useMemo(() => supplierStats(visible), [visible]);
  const tiles = useMemo(() => buildSupplierStatTiles(stats), [stats]);

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

  const noData = bills.length === 0 && directorySuppliers.length === 0;

  return (
    <PartyDetailsPage
      kind={KIND}
      // a background reload keeps showing the data already on screen
      loading={loading && noData}
      error={noData ? error : null}
      onRetry={refresh}
      onExport={onExport}
      exporting={exporting}
      term={query}
      onTermChange={setQuery}
      tiles={tiles}
      items={visible}
      toRow={toSupplierRow}
      resetKey={query}
    />
  );
}
