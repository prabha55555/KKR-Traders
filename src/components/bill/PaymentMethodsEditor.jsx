/**
 * Cash / Account amounts paid on a bill (the web app's "Payment Methods" block) + the total paid. UPI, bank transfer,
 * cheque … are all Account; the bank account is picked below when an Account amount is entered.
 *
 * Props
 *  - values: { cash: string, account: string, bankAccountId: string|null }
 *  - onChange(patch)            receives only the changed keys (`cash`, `account` or `bankAccountId`), merged by the caller
 *  - totalPaid: number          shown as "Total Amount Paid" (includes any later payments, computed by the caller)
 *  - totalLabel?: string        default "Total Amount Paid"
 *  - readOnly?: boolean
 *  - mode?: 'sales' | 'purchase'  purchase warns when the cash / bank balance would go negative
 */
import { AlertTriangle, Banknote, Building2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { accountLabel } from '@/core/accountLabel';
import { formatCurrency } from '@/core/format';
import { NumberField, SelectField } from '@/ui';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';

const METHODS = [
  { key: 'cash', label: 'CASH', icon: Banknote, defaultHint: 'Cash in drawer' },
  { key: 'account', label: 'ACCOUNT', icon: Building2, defaultHint: 'Bank transfer' },
];

export function PaymentMethodsEditor({
  values,
  onChange,
  totalPaid,
  totalLabel = 'Total Amount Paid',
  readOnly,
  mode = 'sales', // 'sales' or 'purchase'
}) {
  const [liveBalances, setLiveBalances] = useState(null);

  useEffect(() => {
    loadLiveAccountBalances()
      .then((b) => setLiveBalances(b))
      .catch((err) => console.error('Failed to load live account balances:', err));
  }, []);

  const bankAccounts = liveBalances?.bankAccounts || [];
  const cashBalance = liveBalances?.cashBalance ?? 0;

  const cashAmount = parseFloat(values.cash) || 0;
  const accountAmount = parseFloat(values.account) || 0;
  const bankOutflow = accountAmount;
  const hasBankPayment = bankOutflow > 0;

  useEffect(() => {
    if (hasBankPayment && bankAccounts.length > 0 && !values.bankAccountId) {
      onChange({ bankAccountId: bankAccounts[0].id });
    }
  }, [hasBankPayment, bankAccounts, values.bankAccountId]);

  const selectedBankId = values.bankAccountId || bankAccounts[0]?.id || '';
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId);

  const isCashOverdraft = mode === 'purchase' && cashAmount > cashBalance;
  const isBankOverdraft = mode === 'purchase' && selectedBank && bankOutflow > selectedBank.currentBalance;

  return (
    <div>
      <div className="space-y-2">
        {METHODS.map(({ key, label, icon: Icon, defaultHint }) => (
          <div key={key}>
            <div
              className={`flex items-center gap-3 rounded-xl border bg-slate-50/70 p-2 pl-2.5 transition focus-within:ring-4 ${
                key === 'cash' && isCashOverdraft
                  ? 'border-amber-400 bg-amber-50/40 focus-within:border-amber-500 focus-within:ring-amber-100'
                  : 'border-line focus-within:border-gold-400 focus-within:bg-gold-50/50 focus-within:ring-gold-100'
              }`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-700 ring-1 ring-gold-200">
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-[13px] font-bold tracking-wide text-slate-800">{label}</span>
                <span className="block truncate text-[11px] text-slate-500">{defaultHint}</span>
              </span>
              <NumberField
                className="w-32 shrink-0 sm:w-36"
                inputClassName="font-semibold"
                aria-label={`${label.charAt(0)}${label.slice(1).toLowerCase()} amount paid`}
                value={values[key]}
                readOnly={readOnly}
                onChange={(v) => onChange({ [key]: v })}
              />
            </div>

            {key === 'cash' && liveBalances && (
              <div
                className={`mt-1.5 flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs transition ${
                  isCashOverdraft
                    ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-xs'
                    : 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900 shadow-xs'
                }`}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                  <span
                    className={`size-2 rounded-full ${
                      isCashOverdraft ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  {mode === 'purchase' ? 'Available Cash in Drawer' : 'Current Cash in Drawer'}
                </span>
                <span className="font-display text-[13px] font-extrabold tabular-nums">
                  ₹{formatCurrency(cashBalance)}
                </span>
              </div>
            )}

            {key === 'cash' && isCashOverdraft && (
              <div className="mt-1 flex items-center gap-1.5 px-2 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>Exceeds cash balance by ₹{formatCurrency(cashAmount - cashBalance)}.</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasBankPayment && bankAccounts.length > 0 && (
        <div className="mt-2.5 space-y-1.5 rounded-xl border border-line bg-brand-50/50 p-2.5">
          <SelectField
            label={
              mode === 'purchase' ? 'Deduct payment from Bank Account' : 'Deposit payment to Bank Account'
            }
            value={selectedBankId}
            onChange={(bankAccountId) => onChange({ bankAccountId })}
            options={bankAccounts.map((a) => ({ value: a.id, label: accountLabel(a) }))}
            disabled={readOnly}
          />
          {selectedBank && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <span>Account Available:</span>
              <span className="font-display font-bold text-slate-800 tabular-nums">
                ₹{formatCurrency(selectedBank.currentBalance)}
              </span>
            </div>
          )}
          {isBankOverdraft && (
            <div className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-amber-700">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>
                Bank payment (₹{formatCurrency(bankOutflow)}) exceeds available balance (₹
                {formatCurrency(selectedBank.currentBalance)}).
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-dashed border-slate-300 pt-3">
        <span className="text-sm font-bold text-slate-700">{totalLabel}</span>
        <span className="font-display text-lg font-extrabold text-emerald-600 tabular-nums">
          ₹{formatCurrency(totalPaid)}
        </span>
      </div>
    </div>
  );
}
