/**
 * AddPaymentSheet – "Add Payment - Invoice #x": Cash / Account split + payment date (addPayment dialog).
 * Validation and save errors are shown inside the sheet.
 *
 * Props:
 *   open (bool) · invoiceNo · balanceDue? (number, shows "Current Balance Due") · onClose()
 *   title?                 default `Add Payment - Invoice #<no>`
 *   invalidAmountMessage?  shown when no amount was entered (default: the sales wording)
 *   mode?                  'sales' | 'purchase' (default: 'sales')
 *   onSubmit({ cash, account, bankAccountId, paymentDate }) => Promise<string | null>
 *                          string = inline error, null = saved (the caller closes the sheet);
 *                          bankAccountId is set only when there is an Account amount
 */
import { AlertTriangle, Banknote, Check, Landmark } from 'lucide-react';
import { useEffect, useState } from 'react';
import { accountLabel } from '@/core/accountLabel';
import { formatCurrency, todayISO } from '@/core/format';
import { Button, DateField, NumberField, SelectField } from '@/ui';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { parsePaymentAmounts, totalOf, validatePaymentInput } from '../lib/payments';
import { HistorySheet } from './HistorySheet';

const EMPTY = { cash: '0', account: '0', bankAccountId: '' };

export function AddPaymentSheet({
  open,
  invoiceNo,
  balanceDue,
  title,
  invalidAmountMessage,
  mode = 'sales',
  onClose,
  onSubmit,
}) {
  const [values, setValues] = useState(EMPTY);
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [liveBalances, setLiveBalances] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setPaymentDate(todayISO());
      setError(null);
      setBusy(false);
      loadLiveAccountBalances()
        .then((b) => setLiveBalances(b))
        .catch(console.error);
    }
  }, [open]);

  const bankAccounts = liveBalances?.bankAccounts || [];
  const cashBalance = liveBalances?.cashBalance ?? 0;

  const amounts = parsePaymentAmounts(values);
  const cashAmount = amounts.cash;
  const accountAmount = amounts.account;

  const selectedBankId = values.bankAccountId || bankAccounts[0]?.id || '';
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId);

  const isCashOverdraft = mode === 'purchase' && cashAmount > cashBalance;
  const isBankOverdraft = mode === 'purchase' && selectedBank && accountAmount > selectedBank.currentBalance;

  const set = (key) => (v) => setValues((cur) => ({ ...cur, [key]: v }));

  const submit = async () => {
    if (busy) return;
    const invalid = validatePaymentInput(amounts, paymentDate, invalidAmountMessage);
    if (invalid) {
      setError(invalid.message);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const finalBankId = accountAmount > 0 ? selectedBankId || null : null;
      const failure = await onSubmit({ ...amounts, bankAccountId: finalBankId, paymentDate });
      if (failure) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const defaultTitle =
    mode === 'purchase' ? `Pay Supplier - Invoice #${invoiceNo}` : `Add Payment - Invoice #${invoiceNo}`;

  return (
    <HistorySheet
      open={open}
      onClose={onClose}
      title={title ?? defaultTitle}
      size="sm"
      actions={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            variant="success"
            icon={Check}
            onClick={submit}
            loading={busy}
            className="flex-1 sm:flex-none"
          >
            {mode === 'purchase' ? 'Pay Supplier' : 'Add Payment'}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-4"
      >
        {balanceDue !== undefined ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 surface-ink px-4 py-3.5 text-white shadow-lift">
            <span className="text-sm font-medium text-brand-200">Current Balance Due</span>
            <span className="font-display text-2xl font-extrabold text-gold-300 tabular-nums">
              ₹{formatCurrency(balanceDue)}
            </span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-slate-50/70 p-3">
          <NumberField
            label={
              <span className="flex items-center gap-1 text-xs font-semibold">
                <Banknote className="size-3.5 text-emerald-600" aria-hidden /> CASH
              </span>
            }
            aria-label="Cash amount"
            value={values.cash}
            onChange={set('cash')}
          />
          <NumberField
            label={
              <span className="flex items-center gap-1 text-xs font-semibold">
                <Landmark className="size-3.5 text-violet-600" aria-hidden /> ACCOUNT
              </span>
            }
            aria-label="Account amount"
            value={values.account}
            onChange={set('account')}
          />
          <div className="col-span-2 flex items-center justify-between rounded-xl border border-gold-200 bg-gold-50/70 px-3.5 py-2.5 text-sm font-bold">
            <span className="text-slate-700">Total:</span>
            <span
              className="font-display text-lg font-extrabold text-brand-800 tabular-nums"
              aria-live="polite"
            >
              ₹{formatCurrency(totalOf(amounts))}
            </span>
          </div>
        </div>

        {/* Live Cash Drawer indicator */}
        {liveBalances && (
          <div
            className={`flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs transition ${
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

        {isCashOverdraft && (
          <div className="flex items-center gap-1.5 px-2 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>Cash payment exceeds drawer balance by ₹{formatCurrency(cashAmount - cashBalance)}.</span>
          </div>
        )}

        {/* Bank Account Selection for the Account amount */}
        {accountAmount > 0 && bankAccounts.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-line bg-brand-50/50 p-2.5">
            <SelectField
              label={mode === 'purchase' ? 'Pay from Account' : 'Deposit received payment to Account'}
              value={selectedBankId}
              onChange={(bankAccountId) => setValues((cur) => ({ ...cur, bankAccountId }))}
              options={bankAccounts.map((a) => ({
                value: a.id,
                label: `${accountLabel(a)} • Balance: ₹${formatCurrency(a.currentBalance)}`,
              }))}
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
                  Account payment (₹{formatCurrency(accountAmount)}) exceeds available balance (₹
                  {formatCurrency(selectedBank.currentBalance)}).
                </span>
              </div>
            )}
          </div>
        )}

        <DateField label="Payment Date" value={paymentDate} onChange={setPaymentDate} />
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold whitespace-pre-line text-red-700"
          >
            {error}
          </p>
        ) : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </HistorySheet>
  );
}
