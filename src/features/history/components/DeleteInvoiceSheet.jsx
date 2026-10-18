/**
 * DeleteInvoiceSheet – deleteInvoice() confirmation: the Invoice No has to be typed before the delete button
 * is enabled. The invoice goes to the Recycle Bin (restorable), so the wording says that.
 *
 * Props: open (bool) · invoiceNo (the number as shown = what must be typed) · onClose() · onConfirm() ·
 *        noun (default "Invoice": the sheet title "Delete Invoice"; the number is always called "Invoice No") ·
 *        note? (string shown in the amber note box; default: later invoices are recalculated).
 */
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, TextField } from '@/ui';
import { HistorySheet } from './HistorySheet';

export function DeleteInvoiceSheet({
  open,
  invoiceNo,
  onClose,
  onConfirm,
  noun = 'Invoice',
  note = 'Later invoices of this party are recalculated without it.',
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const confirmed = typed.trim() === String(invoiceNo);

  return (
    <HistorySheet
      open={open}
      onClose={onClose}
      title={`Delete ${noun}`}
      size="sm"
      actions={
        <>
          <Button variant="outline" icon={X} onClick={onClose} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            variant="danger"
            icon={Trash2}
            disabled={!confirmed}
            onClick={onConfirm}
            className="flex-1 sm:flex-none"
          >
            Move to Recycle Bin
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (confirmed) onConfirm();
        }}
        className="space-y-4"
      >
        <div className="flex justify-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-red-50 text-red-600 shadow-sm ring-4 ring-red-100/70 ring-inset">
            <Trash2 className="size-8" aria-hidden />
          </span>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-3.5 text-center">
          <p className="text-sm text-slate-700">
            You are about to delete Invoice No{' '}
            <strong className="font-display text-base font-extrabold text-red-700">{invoiceNo}</strong>. It
            will be moved to the Recycle Bin, and you can restore it from there.
          </p>
        </div>
        {note ? (
          <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {note}
          </p>
        ) : null}
        <TextField
          label={`Type the Invoice No ${invoiceNo} to confirm:`}
          placeholder="Enter Invoice No"
          value={typed}
          onChange={setTyped}
          autoComplete="off"
          autoCapitalize="none"
          error={typed.length > 0 && !confirmed ? 'Invoice No does not match' : undefined}
        />
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </HistorySheet>
  );
}
