/**
 * Saved / unsaved indicator and the edit-mode banner of the Sales Bill screen.
 * (The web page had no visual cue for `isBillSaved`, only the blocked-button toasts.)
 *
 * SaveBadge props:  saved: boolean
 * EditBanner props: saved: boolean · editingNo: string | null (renders nothing for a new bill) · onNewBill()
 */
import { FilePenLine, PlusCircle } from 'lucide-react';
import { formatInvoiceNo } from '@/core/format';
import { Badge, Button } from '@/ui';

export function SaveBadge({ saved }) {
  return (
    <Badge tone={saved ? 'success' : 'warning'}>
      <span
        aria-hidden
        className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${saved ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'}`}
      />
      {saved ? 'Saved' : 'Not saved'}
    </Badge>
  );
}

export function EditBanner({ saved, editingNo, onNewBill }) {
  if (editingNo === null) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold-200 bg-gold-50/80 p-3 pl-3.5 shadow-card"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-sheen text-brand-900 shadow-gold">
          <FilePenLine className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 font-display font-bold break-words text-brand-800">
              Editing Invoice No {formatInvoiceNo(editingNo)}
            </span>
            <SaveBadge saved={saved} />
          </div>
          <p className="text-xs text-slate-500">Changes are applied to the existing bill.</p>
        </div>
      </div>
      <Button variant="primary" size="sm" icon={PlusCircle} onClick={onNewBill}>
        New bill
      </Button>
    </div>
  );
}
