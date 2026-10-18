/**
 * Premium totals panel shared by the Sales Bill ("Calculation") and Purchase Bill ("Bill Summary") screens.
 * Top: dark ink block with subtotal, previous balance and the gold "Total Amount Due". Bottom: opening balance,
 * discount, payment methods and the balance still due (semantic colour + badge).
 * Purely presentational: all values and handlers come from the caller.
 *
 * Props
 *  - title: string                         "Calculation" | "Bill Summary"
 *  - form: { previousBalance, manualPreviousBalance, discountAmount, cash, account, bankAccountId }
 *  - totals: { subtotal, grandTotal, totalPaid, balanceDue }
 *  - onChange(patch)                       merged into the form
 *  - balanceLabel: string                  "New Balance Due" | "Balance Due"
 *  - note?: string                         small line under the payment methods
 */
import { Calculator } from 'lucide-react';
import { formatCurrency } from '@/core/format';
import { Badge, NumberField } from '@/ui';
import { cn } from '@/ui/cn';
import { PaymentMethodsEditor } from './PaymentMethodsEditor';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function BillTotalsPanel({ title, form, totals, onChange, balanceLabel, note, mode }) {
  const effectiveMode = mode || (title === 'Bill Summary' ? 'purchase' : 'sales');
  const due = totals.balanceDue > 0;
  const credit = totals.balanceDue < 0;
  return (
    <section
      aria-label={title}
      className="animate-rise overflow-hidden rounded-2xl border border-line bg-white shadow-lift"
      style={{ animationDelay: '120ms' }}
    >
      <div className="relative surface-ink p-4 text-white sm:p-5">
        <span className="absolute inset-x-0 top-0 h-px hairline-gold" aria-hidden />
        <h2 className="mb-4 flex items-center gap-2.5 text-[15px] font-bold text-white">
          <span className="flex size-8 items-center justify-center rounded-lg bg-white/10 text-gold-300 ring-1 ring-white/15">
            <Calculator className="size-[18px]" aria-hidden />
          </span>
          {title}
        </h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-brand-300">Current Bill Subtotal</span>
            <span className="font-semibold text-white tabular-nums">{rupees(totals.subtotal)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-brand-300">Previous Balance Due</span>
            <span className="font-semibold text-red-300 tabular-nums">{rupees(form.previousBalance)}</span>
          </div>
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-gold-300 uppercase">
            Total Amount Due
          </div>
          <div className="mt-1 text-gold-gradient font-display text-3xl leading-tight font-extrabold [overflow-wrap:anywhere] tabular-nums sm:text-[34px]">
            {rupees(totals.grandTotal)}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField
            label="Opening Balance"
            allowNegative
            value={String(form.manualPreviousBalance)}
            onChange={(manualPreviousBalance) => onChange({ manualPreviousBalance })}
          />
          <NumberField
            label="Discount Amount"
            value={String(form.discountAmount)}
            onChange={(discountAmount) => onChange({ discountAmount })}
          />
        </div>

        <div>
          <h3 className="mb-2 text-[13px] font-bold tracking-wide text-slate-600 uppercase">
            Payment Methods
          </h3>
          <PaymentMethodsEditor
            mode={effectiveMode}
            values={{
              cash: String(form.cash),
              account: String(form.account),
              bankAccountId: form.bankAccountId,
            }}
            totalPaid={totals.totalPaid}
            onChange={onChange}
          />

          {note ? <p className="mt-2 text-xs text-slate-500">{note}</p> : null}
        </div>

        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-xl p-3.5 ring-1 transition-colors',
            due ? 'bg-red-50 ring-red-200' : 'bg-emerald-50 ring-emerald-200',
          )}
        >
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-700">{balanceLabel}</div>
            <Badge tone={due ? 'danger' : 'success'} className="mt-1">
              {due ? 'Payment pending' : credit ? 'Credit' : 'Settled'}
            </Badge>
          </div>
          <div
            className={cn(
              'text-right font-display text-xl font-extrabold [overflow-wrap:anywhere] tabular-nums sm:text-2xl',
              due ? 'text-red-600' : 'text-emerald-700',
            )}
          >
            {rupees(totals.balanceDue)}
          </div>
        </div>
      </div>
    </section>
  );
}
