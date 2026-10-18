import { MapPin, Pencil, Phone, Trash2 } from 'lucide-react';
import { InitialAvatar } from '@/features/customerForm/InitialAvatar';
import { Button } from '@/ui';

/** One supplier of the directory on phones (a row of the desktop table) with its Edit / Delete actions. */
export function SupplierAdminCard({ supplier, onEdit, onDelete }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <InitialAvatar name={supplier.name} size="lg" />
        <div className="min-w-0 flex-1 text-[17px] leading-snug font-bold break-words text-brand-800">
          {supplier.name}
        </div>
      </div>
      <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50/70 p-3 text-sm text-slate-600">
        <div className="flex items-start gap-2">
          <Phone className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
          <span className="tabular-nums">{supplier.phone || 'N/A'}</span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
          <span className="min-w-0 break-words">{supplier.address || 'N/A'}</span>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <Button
          variant="edit"
          icon={Pencil}
          onClick={() => onEdit(supplier)}
          aria-label={`Edit ${supplier.name}`}
        >
          Edit
        </Button>
        <Button
          variant="outlineDanger"
          icon={Trash2}
          onClick={() => onDelete(supplier)}
          aria-label={`Delete ${supplier.name}`}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
