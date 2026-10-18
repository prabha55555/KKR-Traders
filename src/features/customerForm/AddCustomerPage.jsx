/**
 * Add Customer / Manage Customers — replaces original-app/manage-customers.html + js/manage-customers.js.
 * Desktop: directory table with the add / edit form card beside it. Phones & tablets: customer cards, a floating
 * "Add" button and the form in a bottom sheet. `?phone=` (sent by the Sales Bill) pre-fills the add form.
 */
import { Search, UserPlus, Users } from 'lucide-react';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  Pagination,
  SearchBar,
  TwoPane,
  usePagination,
} from '@/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import FloatingAddButton from '@/features/overview/components/FloatingAddButton';
import { CustomerFormCard } from './CustomerFormCard';
import { CustomerFormSheet } from './CustomerFormSheet';
import { CustomerTable } from './CustomerTable';
import { useCustomerManager } from './useCustomerManager';

export default function AddCustomerPage() {
  const manager = useCustomerManager();
  const { isExpanded } = useBreakpoint();
  const { customers, visible, query } = manager;
  const pager = usePagination(visible, { resetKey: query });

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
      <Page {...pageProps}>
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
    <Page
      {...pageProps}
      actions={
        // tablets: the add sheet opens from here (the floating button is phone-only)
        <Button variant="primary" icon={UserPlus} onClick={() => manager.openAdd()} className="max-sm:hidden">
          Add Customer
        </Button>
      }
    >
      {toolbar}
      {customers.length === 0 ? (
        <Card className="p-0!">
          <EmptyState
            icon={Users}
            title="No customers found."
            message="Add your first customer to start billing."
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-0!">
          <EmptyState
            icon={Search}
            title="No matching customers"
            message="Try a different name, phone number or address."
          />
        </Card>
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

      {/* phones: the shared floating Add button above the tab bar opens the add sheet */}
      <FloatingAddButton label="Add Customer" onClick={() => manager.openAdd()} />

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
