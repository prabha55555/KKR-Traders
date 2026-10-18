/**
 * Customer Details — replaces original-app/customer-details.html + js/customer-details.js.
 * Search toolbar, stat tiles, customer list (table on desktop, cards on phones / tablets), export and WhatsApp
 * reminder dialogs. Customers are derived from the sales invoices (see aggregate.js).
 */
import { Download, ListChecks, Users } from 'lucide-react';

import { useBreakpoint } from '@/hooks/useBreakpoint';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  Pagination,
  SectionHeader,
  usePagination,
} from '@/ui';
import { CustomerCard } from './CustomerCard';
import { CustomerTable } from './CustomerTable';
import { ExportSheet } from './ExportSheet';
import { ReminderSheet } from './ReminderSheet';
import { SearchToolbar } from './SearchToolbar';
import { StatsGrid } from './StatsGrid';
import { useCustomerDetails } from './useCustomerDetails';

export default function CustomerDetailsPage() {
  const model = useCustomerDetails();
  const { isExpanded, isMedium } = useBreakpoint();
  const { visible, stats, refresh, setTerm, setReminderFor, openExport } = model;
  // a new search / refreshed data starts again from page 1
  const pager = usePagination(visible, { resetKey: visible });

  const actions = (
    <Button variant="secondary" icon={Download} onClick={openExport}>
      Export
    </Button>
  );
  const head = {
    title: 'Sales Customer Details',
    icon: Users,
  };

  if (model.loading) {
    return (
      <Page {...head} max="7xl">
        <LoadingState label="Loading customers…" />
      </Page>
    );
  }
  if (model.error) {
    return (
      <Page {...head} max="7xl">
        <ErrorState message={`Error loading customer data: ${model.error}`} onRetry={() => void refresh()} />
      </Page>
    );
  }

  let list;
  if (isExpanded) {
    list = <CustomerTable rows={pager.rows} onRemind={setReminderFor} />;
  } else if (visible.length === 0) {
    list = (
      <Card>
        <EmptyState
          icon={Users}
          title="No Customers Found"
          message="Add customers or create invoices to see customer data here"
        />
      </Card>
    );
  } else {
    list = (
      <ul className={isMedium ? 'grid grid-cols-2 gap-3.5' : 'space-y-3'}>
        {pager.rows.map((c, i) => (
          <li key={c.name} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
            <CustomerCard customer={c} onRemind={setReminderFor} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Page {...head} max="7xl" actions={actions}>
      <SearchToolbar onTermChange={setTerm} />
      <StatsGrid stats={stats} />
      <SectionHeader
        title="Customer List"
        icon={ListChecks}
        className="mb-3"
        right={
          <Badge tone="info" className="tabular-nums">
            {visible.length}
          </Badge>
        }
      />
      <div ref={pager.anchorRef} className="scroll-mt-32" />
      {list}
      <Pagination pager={pager} noun="customers" />

      <ReminderSheet customer={model.reminderFor} onClose={() => setReminderFor(null)} />
      <ExportSheet
        visible={model.exportOpen}
        customers={model.customers}
        onClose={() => model.setExportOpen(false)}
        onExport={model.runExport}
      />
    </Page>
  );
}
