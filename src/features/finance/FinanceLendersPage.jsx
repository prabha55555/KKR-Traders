import { Save, UserPlus, Users, Trash2, Edit } from 'lucide-react';
import { useState } from 'react';

import { db } from '@/core/db';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  Page,
  RefreshButton,
  SectionHeader,
  TextField,
  TextArea,
  useFeedback,
} from '@/ui';
import SkeletonRows from '../overview/components/SkeletonRows';
import FilterBar from '../overview/components/FilterBar';
import ShowMore from '../overview/components/ShowMore';
import FloatingAddButton from '../overview/components/FloatingAddButton';
import { usePagedRows } from '../overview/components/paging';
import { updateLenderWithReferences } from './financeLogic';
import FinanceNavTabs from './FinanceNavTabs';

export default function FinanceLendersPage() {
  const { toast, confirm } = useFeedback();
  const [lenders, setLenders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);

  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
    try {
      setLenders(await db.getAllLenders());
    } catch (e) {
      toast('Error', 'Failed to load lenders', 'error');
      throw e;
    }
  });

  const shown = lenders.filter(
    (l) =>
      !searchTerm ||
      (l.name && l.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.phone && l.phone.includes(searchTerm)),
  );

  const paged = usePagedRows(shown, searchTerm);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      toast('Warning', 'Name and Phone are required.', 'warning');
      return;
    }

    let phoneDigits = form.phone.replace(/[^0-9]/g, '');
    if (phoneDigits.length !== 10) {
      toast('Warning', 'Phone number must be exactly 10 digits.', 'warning');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await updateLenderWithReferences(db, editing, form);
        if (res === 'duplicate') {
          toast('Warning', 'A lender with this phone number already exists.', 'warning');
          setSaving(false);
          return;
        }
      } else {
        const existing = await db.getLender(form.phone);
        if (existing) {
          toast('Warning', 'A lender with this phone number already exists.', 'warning');
          setSaving(false);
          return;
        }
        await db.saveLender(form);
      }

      toast('Success', 'Lender saved successfully!', 'success');
      setIsAddOpen(false);
      setEditing(null);
      await reload();
    } catch (error) {
      toast('Error', 'Failed to save lender.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (lender) => {
    const ok = await confirm({
      title: 'Delete Lender?',
      message: `Are you sure you want to delete ${lender.name}?`,
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;

    try {
      await db.deleteLender(lender.phone);
      toast('Deleted!', 'Lender has been deleted.', 'success');
      await reload();
    } catch (error) {
      toast('Error', 'Failed to delete lender.', 'error');
    }
  };

  const openAdd = () => {
    setForm({ name: '', phone: '', address: '' });
    setIsAddOpen(true);
  };

  const openEdit = (lender) => {
    setForm({ name: lender.name, phone: lender.phone, address: lender.address || '' });
    setEditing(lender);
  };

  const columns = [
    { key: 'name', header: 'Name', value: (e) => e.name, className: 'font-bold text-slate-900' },
    { key: 'phone', header: 'Phone', value: (e) => e.phone, className: 'text-slate-600 font-mono text-xs' },
    { key: 'address', header: 'Address', value: (e) => e.address || '-', className: 'text-slate-600' },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      render: (e) => (
        <div className="flex items-center justify-center gap-2">
          <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" />
          <IconButton
            icon={Trash2}
            onClick={() => void remove(e)}
            label="Delete"
            className="text-red-500 hover:bg-red-50 hover:text-red-700"
          />
        </div>
      ),
    },
  ];

  let body;
  if (loading) body = <SkeletonRows count={4} height="h-16" />;
  else if (error) body = <ErrorState message={error} onRetry={() => void reload()} />;
  else
    body = (
      <>
        <DataTable
          columns={columns}
          rows={paged.rows}
          rowKey={(e) => e.phone}
          renderCard={(e) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-slate-900">{e.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-600">
                    <Phone className="size-3 text-slate-400" />
                    {e.phone}
                  </div>
                </div>
                <div className="flex gap-1">
                  <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" />
                  <IconButton
                    icon={Trash2}
                    onClick={() => void remove(e)}
                    label="Delete"
                    className="text-red-500 hover:text-red-700"
                  />
                </div>
              </div>
              {e.address && (
                <div className="mt-1 rounded-lg border border-line bg-slate-50/80 p-2 text-xs text-slate-600">
                  {e.address}
                </div>
              )}
            </div>
          )}
          empty={
            <EmptyState
              icon={Users}
              title="No lenders found."
              message="Add your first lender to use in finance records."
            />
          }
        />
        <ShowMore pager={paged.pager} noun="lenders" />
      </>
    );

  const formContent = (
    <div className="space-y-4">
      <TextField label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
      <TextField
        label="Phone Number"
        value={form.phone}
        onChange={(v) => setForm({ ...form, phone: v })}
        required
      />
      <TextArea
        label="Address (Optional)"
        value={form.address}
        onChange={(v) => setForm({ ...form, address: v })}
      />
    </div>
  );

  return (
    <Page
      title="Lender Details"
      icon={Users}
      actions={
        <>
          <RefreshButton onClick={refresh} loading={refreshing} />
          <Button icon={UserPlus} onClick={openAdd} className="max-sm:hidden">
            Add Lender
          </Button>
        </>
      }
    >
      <FinanceNavTabs />
      <FilterBar
        text={searchTerm}
        onTextChange={setSearchTerm}
        textPlaceholder="Search by Name or Phone..."
        onClear={() => setSearchTerm('')}
      />
      {body}

      <Modal
        open={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add New Lender"
        footer={
          <>
            <Button variant="outline" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Save} loading={saving} onClick={handleSave}>
              Save
            </Button>
          </>
        }
      >
        <form id="add-lender-form" onSubmit={handleSave}>
          <SectionHeader title="Lender Info" className="mb-2" />
          {formContent}
        </form>
      </Modal>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Lender"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button variant="success" icon={Save} loading={saving} onClick={handleSave}>
              Save
            </Button>
          </>
        }
      >
        <form id="edit-lender-form" onSubmit={handleSave}>
          {formContent}
        </form>
      </Modal>

      <FloatingAddButton label="Add Lender" onClick={openAdd} />
    </Page>
  );
}
