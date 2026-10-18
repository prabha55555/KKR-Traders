/**
 * Invoice number + date block with the "Last Invoice / Suggested Next / Apply Suggestion" strip. Shared by the
 * Sales and Purchase bill screens.
 *
 * Props
 *  - lastLabel?: string                 default "Last Invoice"
 *  - last: string                       last invoice number of the financial year ('-' when none)
 *  - suggested: string                  suggested next number ('-' when none)
 *  - cycleRestarted?: boolean           shows "(Cycle Restarted)"
 *  - onApplySuggestion()                the "Apply Suggestion" button
 *  - invoiceNo: string, onInvoiceNoChange(value)
 *  - invoiceNoLabel?: string            default "Invoice No"
 *  - invoiceNoReadOnly?: boolean        edit mode: the number cannot change (the suggestion strip is hidden)
 *  - date: string (YYYY-MM-DD), onDateChange(value)
 *  - dateLabel?: string                 default "Invoice Date"
 *  - dateReadOnly?: boolean
 *  - hideSuggestion?: boolean
 */
import { Sparkles } from 'lucide-react';
import { Button, DateField, TextField } from '@/ui';

export function InvoiceHeaderFields({
  lastLabel = 'Last Invoice',
  last,
  suggested,
  cycleRestarted,
  onApplySuggestion,
  invoiceNo,
  onInvoiceNoChange,
  invoiceNoLabel = 'Invoice No',
  invoiceNoReadOnly,
  date,
  onDateChange,
  dateLabel = 'Invoice Date',
  dateReadOnly,
  hideSuggestion,
}) {
  const noSuggestion = !suggested || suggested === '-';
  return (
    <div className="space-y-4">
      {!invoiceNoReadOnly && !hideSuggestion ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gold-50/70 p-3 ring-1 ring-gold-200/80">
          <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600">
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                {lastLabel}
              </div>
              <strong className="font-display text-base font-bold text-brand-800 tabular-nums">
                {last || '-'}
              </strong>
            </div>
            <div>
              <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Suggested Next
              </div>
              <strong className="font-display text-base font-bold text-gold-700 tabular-nums">
                {suggested || '-'}
              </strong>
              {cycleRestarted ? <span className="ml-1 text-xs text-red-600">(Cycle Restarted)</span> : null}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Sparkles}
            disabled={noSuggestion}
            onClick={onApplySuggestion}
          >
            Apply Suggestion
          </Button>
        </div>
      ) : null}
      <div className="grid gap-3.5 sm:grid-cols-2">
        <TextField
          label={invoiceNoLabel}
          placeholder="Invoice no."
          value={invoiceNo}
          readOnly={invoiceNoReadOnly}
          onChange={onInvoiceNoChange}
          inputClassName="font-display font-bold tracking-wide"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
        />
        <DateField label={dateLabel} value={date} readOnly={dateReadOnly} onChange={onDateChange} />
      </div>
    </div>
  );
}
