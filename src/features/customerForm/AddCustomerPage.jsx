/**
 * Add Customer / Manage Customers — replaces original-app/manage-customers.html + js/manage-customers.js.
 * Desktop: directory table with the add / edit form card beside it. Phones & tablets: customer cards, a floating
 * "Add" button and the form in a bottom sheet. `?phone=` (sent by the Sales Bill) pre-fills the add form.
 */
import { Search, UserPlus, Users } from 'lucide-react';

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
  TwoPane,
  usePagination,
} from '@/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { CustomerFormCard } from './CustomerFormCard';
import { CustomerFormSheet } from './CustomerFormSheet';
import { CustomerTable } from './CustomerTable';
import { useCustomerManager } from './useCustomerManager';

export default function AddCustomerPage() {
  const manager = useCustomerManager();
  const { isExpanded } = useBreakpoint();
  const { customers, visible, query } = manager;
  const pager = usePagination(visible, { resetKey: query });

  const refreshButton = <RefreshButton onClick={() => void manager.refresh()} loading={manager.refreshing} />;
  const pageProps = { title: 'Manage Customers', icon: Users };

  if (manager.loading) {
    return (
      <Page {...pageProps}>
        <LoadingState label="Loading customers..." />
      </Page>
    );
  }
  if (manager.error && customers.length === 0) {
    return (
      <Page {...pageProps}>
        <ErrorState message={manager.error} onRetry={() => void manager.reload()} />
      </Page>
    );
  }

  const toolbar = (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <SearchBar
        value={query}
        onChange={manager.setQuery}
        placeholder="Search name, phone or address"
        aria-label="Search customers"
        className="min-w-0 flex-1"
      />
      <Badge tone="brand" className="self-start px-3 py-1 text-[13px] tabular-nums sm:self-auto">
        {query.trim()
          ? `${visible.length} of ${customers.length} customers`
          : `${customers.length} customers`}
      </Badge>
    </div>
  );

  if (isExpanded) {
    return (
      <Page {...pageProps} actions={refreshButton}>
        <TwoPane
          main={
            <>
              {toolbar}
              <div ref={pager.anchorRef} className="scroll-mt-32" />
              <CustomerTable
                customers={pager.rows}
                emptyText={customers.length === 0 ? 'No customers found.' : 'No matching customers.'}
                onEdit={manager.openEdit}
                onDelete={manager.remove}
              />
              <Pagination pager={pager} noun="customers" />
            </>
          }
          side={
            <CustomerFormCard
              mode={manager.form.mode}
              initial={manager.form.initial}
              onCancel={manager.form.reset}
              onSubmit={manager.form.submit}
            />
          }
        />
      </Page>
    );
  }

  return (
    <Page {...pageProps} actions={refreshButton}>
      {toolbar}
      {customers.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white shadow-card">
          <EmptyState
            icon={Users}
            title="No customers found."
            message="Add your first customer to start billing."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl border border-line bg-white shadow-card">
          <EmptyState
            icon={Search}
            title="No matching customers"
            message="Try a different name, phone number or address."
          />
        </div>
      ) : (
        <>
          <div ref={pager.anchorRef} className="scroll-mt-32" />
          <CustomerTable
            customers={pager.rows}
            emptyText="No matching customers."
            onEdit={manager.openEdit}
            onDelete={manager.remove}
          />
          <Pagination pager={pager} noun="customers" />
        </>
      )}

      {/* floating Add button: fixed bottom-right above the tab bar (Page leaves room below the list) */}
      <button
        type="button"
        onClick={() => manager.openAdd()}
        aria-label="Add Customer"
        title="Add Customer"
        className="no-print fixed right-4 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-gold-sheen text-brand-900 shadow-gold ring-4 ring-white/80 transition hover:brightness-105 focus-visible:ring-gold-300 focus-visible:outline-none active:scale-95 sm:right-6"
      >
        <UserPlus className="size-6" aria-hidden />
      </button>

      <CustomerFormSheet
        visible={manager.form.open}
        mode={manager.form.mode}
        initial={manager.form.initial}
        onClose={manager.form.close}
        onSubmit={manager.form.submit}
      />
    </Page>
  );
}
