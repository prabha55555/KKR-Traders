import { Pencil, Trash2, Users } from 'lucide-react';
import { useMemo } from 'react';

import { Button, DataTable, EmptyState } from '@/ui';
import { CustomerCard } from './CustomerCard';
import { InitialAvatar } from './InitialAvatar';

/**
 * The website's "Customer Directory" table (Name, Phone, Address, Actions). Clicking a row edits it; the pencil / bin
 * icons do the same explicitly. On phones `DataTable` falls back to `CustomerCard`s.
 */
export function CustomerTable({ customers, emptyText, onEdit, onDelete }) {
  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Customer Name',
        value: (c) => c.name || '(no name)',
        render: (c) => (
          <div className="flex items-center gap-3">
            <InitialAvatar name={c.name} size="sm" />
            <span className="min-w-0 font-semibold break-words text-brand-800">{c.name || '(no name)'}</span>
          </div>
        ),
      },
      {
        key: 'phone',
        header: 'Phone',
        value: (c) => c.phone || 'N/A',
        nowrap: true,
        className: 'text-slate-600 tabular-nums',
      },
      {
        key: 'address',
        header: 'Address',
        value: (c) => c.address || 'N/A',
        className: 'max-w-[16rem] text-slate-600',
      },
      {
        key: 'openingBalance',
        header: 'Opening Balance',
        align: 'right',
        value: (c) => (c.openingBalance ? `₹${Number(c.openingBalance).toFixed(2)}` : '₹0.00'),
        className: 'font-semibold text-slate-700',
      },
      {
        key: 'actions',
        header: 'Actions',
        align: 'center',
        render: (c) => (
          <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
            <Button icon={Pencil} size="sm" variant="edit" onClick={() => onEdit(c)}>
              Edit
            </Button>
            {c.phone ? (
              <Button icon={Trash2} size="sm" variant="outlineDanger" onClick={() => onDelete(c)}>
                Delete
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [onDelete, onEdit],
  );

  return (
    <DataTable
      rows={customers}
      rowKey={(c, i) => c.phone || `customer_${i}`}
      columns={columns}
      renderCard={(c) => <CustomerCard customer={c} onEdit={onEdit} onDelete={onDelete} />}
      onRowClick={onEdit}
      empty={<EmptyState icon={Users} title={emptyText} />}
    />
  );
}
