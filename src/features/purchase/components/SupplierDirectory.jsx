import { Pencil, Trash2 } from 'lucide-react';
import { InitialAvatar } from '@/features/customerForm/InitialAvatar';
import { Button, DataTable } from '@/ui';
import { SupplierAdminCard } from './SupplierAdminCard';

/** The Supplier Directory: a table on tablets / desktops, cards on phones. */
export function SupplierDirectory({ suppliers, empty, onEdit, onDelete }) {
  const columns = [
    {
      key: 'name',
      header: 'Supplier Name',
      mobile: 'title',
      render: (s) => (
        <div className="flex items-center gap-3">
          <InitialAvatar name={s.name} size="sm" />
          <span className="min-w-0 font-semibold text-brand-800">{s.name}</span>
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      className: 'whitespace-nowrap text-slate-600 tabular-nums',
      value: (s) => s.phone || 'N/A',
    },
    {
      key: 'address',
      header: 'Address',
      className: 'max-w-xs text-slate-600',
      value: (s) => s.address || 'N/A',
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (s) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="edit"
            icon={Pencil}
            onClick={() => onEdit(s)}
            aria-label={`Edit ${s.name}`}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="outlineDanger"
            icon={Trash2}
            onClick={() => onDelete(s)}
            aria-label={`Delete ${s.name}`}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={suppliers}
      rowKey={(s, i) => s.phone || String(i)}
      renderCard={(s) => <SupplierAdminCard supplier={s} onEdit={onEdit} onDelete={onDelete} />}
      empty={empty}
      dense
    />
  );
}
