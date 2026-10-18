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
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  Pagination,
  RefreshButton,
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
  const { visible, stats, refreshing, refresh, setTerm, setReminderFor, openExport } = model;
  // a new search / refreshed data starts again from page 1
  const pager = usePagination(visible, { resetKey: visible });

  const actions = (
    <>
      <Button variant="secondary" icon={Download} onClick={openExport}>
        Export
      </Button>
      <RefreshButton loading={refreshing} onClick={() => void refresh()} />
    </>
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
      <div className="rounded-2xl border border-line bg-white shadow-card">
        <EmptyState
          icon={Users}
          title="No Customers Found"
          message="Add customers or create invoices to see customer data here"
        />
      </div>
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-brand-800">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-200">
            <ListChecks className="size-[18px]" aria-hidden />
          </span>
          Customer List
        </h2>
        <Badge tone="brand" className="tabular-nums">
          {visible.length}
        </Badge>
      </div>
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
