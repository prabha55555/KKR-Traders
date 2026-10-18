/**
 * Customer Details — replaces original-app/customer-details.html + js/customer-details.js.
 * Same layout as Supplier Details (shared `PartyDetailsPage`): search toolbar, status cards, customer list (table on
 * desktop, cards on phones / tablets) with the WhatsApp reminder as the row action, plus the export and reminder
 * dialogs. Customers are derived from the sales invoices (see aggregate.js).
 */
import { useCallback, useMemo } from 'react';

import { PARTY_KINDS, PartyDetailsPage } from '@/components/party';
import { toCustomerRow } from './customerRow';
import { ExportSheet } from './ExportSheet';
import { ReminderAction } from './ReminderAction';
import { ReminderSheet } from './ReminderSheet';
import { buildStatTiles } from './statTiles';
import { useCustomerDetails } from './useCustomerDetails';

const KIND = PARTY_KINDS.customer;

export default function CustomerDetailsPage() {
  const model = useCustomerDetails();
  const { visible, stats, refresh, term, setTerm, setReminderFor, openExport } = model;
  const tiles = useMemo(() => buildStatTiles(stats), [stats]);
  const renderActions = useCallback(
    (row, { dense }) => <ReminderAction customer={row.source} onRemind={setReminderFor} dense={dense} />,
    [setReminderFor],
  );

  return (
    <PartyDetailsPage
      kind={KIND}
      loading={model.loading}
      error={model.error}
      onRetry={() => void refresh()}
      onExport={openExport}
      term={term}
      onTermChange={setTerm}
      tiles={tiles}
      items={visible}
      toRow={toCustomerRow}
      // a new search / refreshed data starts again from page 1
      resetKey={visible}
      renderActions={renderActions}
      actionsHeader="Reminder"
    >
      <ReminderSheet customer={model.reminderFor} onClose={() => setReminderFor(null)} />
      <ExportSheet
        visible={model.exportOpen}
        customers={model.customers}
        onClose={() => model.setExportOpen(false)}
        onExport={model.runExport}
      />
    </PartyDetailsPage>
  );
}
