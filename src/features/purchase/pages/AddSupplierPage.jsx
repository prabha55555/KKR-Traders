/**
 * Add Supplier — replaces original-app/manage-suppliers.html + js/manage-suppliers.js.
 * Add form (the `?phone=` query pre-fills the phone), searchable supplier directory, edit sheet and delete (confirm).
 * Wide desktops (xl): add form as a side card; everything narrower: form on top, directory below.
 */
import { Save, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Modal,
  Page,
  Pagination,
  RefreshButton,
  SearchBar,
  SectionHeader,
  TwoPane,
  usePagination,
} from '@/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SupplierDirectory } from '../components/SupplierDirectory';
import { SupplierFormFields } from '../components/SupplierFormFields';
import { useSupplierDirectory } from '../hooks/useSupplierDirectory';

const EDIT_FORM_ID = 'edit-supplier-form';

export default function AddSupplierPage() {
  const dir = useSupplierDirectory();

  const { isExpanded } = useBreakpoint();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const pager = usePagination(dir.visible, { resetKey: dir.query });

  if (dir.loading && dir.suppliers.length === 0) {
    return (
      <Page title="Add Supplier" icon={UserPlus}>
        <LoadingState label="Loading suppliers…" />
      </Page>
    );
  }
  if (dir.error && dir.suppliers.length === 0) {
    return (
      <Page title="Add Supplier" icon={UserPlus}>
        <ErrorState message={dir.error} onRetry={dir.refresh} />
      </Page>
    );
  }

  const submitAdd = async (e) => {
    e.preventDefault();
    if (dir.adding) return;
    const success = await dir.add();
    if (success) {
      setIsAddOpen(false);
    }
  };
  const submitEdit = (e) => {
    e.preventDefault();
    if (!dir.savingEdit) dir.saveEdit();
  };

  const toolbar = (
    <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
      <SearchBar
        value={dir.query}
        onChange={dir.setQuery}
        placeholder="Search name, phone or address"
        aria-label="Search suppliers"
        className="min-w-0 flex-1"
      />
      <Badge tone="brand" className="self-start px-3 py-1 text-[13px] tabular-nums sm:self-auto">
        {dir.query.trim()
          ? `${dir.visible.length} of ${dir.suppliers.length} suppliers`
          : `${dir.suppliers.length} suppliers`}
      </Badge>
    </div>
  );

  const listSection = (
    <>
      {toolbar}
      <SupplierDirectory
        suppliers={pager.rows}
        onEdit={dir.startEdit}
        onDelete={dir.remove}
        empty={
          <EmptyState
            icon={Users}
            title="No suppliers found."
            message={dir.query.trim() ? 'No supplier matches your search.' : 'Add your first supplier.'}
          />
        }
      />
      <Pagination pager={pager} noun="suppliers" />
    </>
  );

  const formCard = (
    <Card as="form" onSubmit={submitAdd} className="relative overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-[2px] hairline-gold" aria-hidden />
      <SectionHeader title="Add New Supplier" icon={UserPlus} className="mb-1" />
      <p className="mb-4 text-[13px] text-slate-500">
        Phone number and name are required; address is optional.
      </p>
      <SupplierFormFields value={dir.newSupplier} onChange={dir.setNewSupplier} idPrefix="new-supplier" />
      <Button type="submit" icon={UserPlus} fullWidth loading={dir.adding} className="mt-5">
        Add Supplier
      </Button>
    </Card>
  );

  return (
    <Page
      title="Add Supplier"
      icon={UserPlus}
      actions={<RefreshButton loading={dir.refreshing} onClick={dir.refresh} />}
    >
      {isExpanded ? (
        <TwoPane main={listSection} side={formCard} />
      ) : (
        <>
          {listSection}

          <Modal
            open={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            title="Add New Supplier"
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsAddOpen(false)}
                  disabled={dir.adding}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="mobile-add-supplier"
                  variant="primary"
                  icon={UserPlus}
                  loading={dir.adding}
                  className="flex-1 sm:flex-none"
                >
                  Add Supplier
                </Button>
              </>
            }
          >
            <form id="mobile-add-supplier" onSubmit={submitAdd}>
              <SupplierFormFields
                value={dir.newSupplier}
                onChange={dir.setNewSupplier}
                idPrefix="mob-new-supplier"
              />
            </form>
          </Modal>
          {/* floating Add button: fixed bottom-right above the tab bar; opens the Add New Supplier popup */}
          <button
            type="button"
            onClick={() => setIsAddOpen(true)}
            aria-label="Add Supplier"
            title="Add Supplier"
            className="no-print fixed right-4 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-gold-sheen text-brand-900 shadow-gold ring-4 ring-white/80 transition hover:brightness-105 focus-visible:ring-gold-300 focus-visible:outline-none active:scale-95 sm:right-6"
          >
            <UserPlus className="size-6" aria-hidden />
          </button>
        </>
      )}

      <Modal
        open={!!dir.editing}
        onClose={() => dir.setEditing(null)}
        title="Edit Supplier"
        footer={
          <>
            <Button variant="outline" onClick={() => dir.setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form={EDIT_FORM_ID} variant="success" icon={Save} loading={dir.savingEdit}>
              Save
            </Button>
          </>
        }
      >
        {dir.editing ? (
          <form id={EDIT_FORM_ID} onSubmit={submitEdit}>
            <SupplierFormFields
              value={dir.editing.draft}
              onChange={(draft) => dir.setEditing({ ...dir.editing, draft })}
              idPrefix="edit-supplier"
            />
            <p className="mt-3 text-xs text-slate-500">
              The new details are also applied to every purchase bill of this supplier.
            </p>
          </form>
        ) : null}
      </Modal>
    </Page>
  );
}
