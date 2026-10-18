import { IndianRupee, MapPin, Pencil, Phone, Trash2, Wallet } from 'lucide-react';
import { memo } from 'react';

import { Button } from '@/ui';
import { InitialAvatar } from './InitialAvatar';

function InfoRow({ icon: Icon, text }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-600">
      <Icon className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
      <span className="min-w-0 break-words tabular-nums">{text}</span>
    </div>
  );
}

/** One row of the "Customer Directory" table as a card body (DataTable draws the card frame): name, phone, address, Edit / Delete. */
export const CustomerCard = memo(function CustomerCard({ customer, onEdit, onDelete }) {
  const openingBal = parseFloat(customer.openingBalance || 0);
  return (
    <div>
      <div className="flex items-center gap-3">
        <InitialAvatar name={customer.name} size="lg" />
        <h3 className="min-w-0 flex-1 text-[17px] leading-snug font-bold break-words text-brand-800">
          {customer.name || '(no name)'}
        </h3>
      </div>
      <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50/70 p-3">
        <InfoRow icon={Phone} text={customer.phone || 'N/A'} />
        <InfoRow icon={MapPin} text={customer.address || 'N/A'} />
        <div className="mt-1 flex items-center justify-between border-t border-slate-200/60 pt-2 text-xs">
          <span className="flex items-center gap-1.5 font-medium text-slate-600">
            <Wallet className="size-3.5 text-gold-600" aria-hidden />
            Opening Balance:
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${openingBal > 0 ? 'text-amber-800' : 'text-slate-700'}`}
          >
            ₹{openingBal.toFixed(2)}
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-2.5" onClick={(e) => e.stopPropagation()}>
        <Button
          variant="edit"
          icon={Pencil}
          onClick={() => onEdit(customer)}
          aria-label={`Edit ${customer.name}`}
          className="flex-1"
        >
          Edit
        </Button>
        {customer.phone ? (
          <Button
            variant="outlineDanger"
            icon={Trash2}
            onClick={() => onDelete(customer)}
            aria-label={`Delete ${customer.name}`}
            className="flex-1"
          >
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
});
