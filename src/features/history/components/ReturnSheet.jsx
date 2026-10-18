/**
 * ReturnSheet – "Process Return - Invoice #x": pick products (from the party's bills, or a custom one), qty, rate,
 * reason, and how the money goes back: Cash (default) or Account. A return is always a direct refund — the bill's
 * balance due does not change. Errors are shown inside the sheet.
 *
 * Props:
 *   open (bool) · invoiceNo · labels ({ party }) · partyName · invoiceDate · onClose()
 *   products      the returnable product lines [{ description, qty (sold), rate }] (lib/returns partyReturnProducts)
 *   balanceDue    what the bill still owes (shown as "stays ₹x")
 *   returns       returns already stored for the invoice (HistoryReturn[])
 *   partyReturns? returns of all the party's bills, for the "Already returned" hints (default: `returns`)
 *   onSubmit({ returnDate, items, settlementType: 'refund', refundMethod: 'cash' | 'bank', bankAccountId })
 *                 => Promise<string | null>   string = inline error, null = saved
 */
import { AlertTriangle, Banknote, Landmark, Plus, Save } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { accountLabel } from '@/core/accountLabel';
import { formatCurrency, formatDateIN, todayISO } from '@/core/format';
import { Button, DateField, SelectField, cn } from '@/ui';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { newReturnItem, returnTotal, returnedQtyByDescription } from '../lib/returns';
import { sumReturnAmounts } from '../lib/lookups';
import { HistorySheet } from './HistorySheet';
import { ReturnItemEditor } from './ReturnItemEditor';

const rs = (n) => `₹${formatCurrency(n)}`;

function SummaryRow({ label, value, tone, bold }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 py-0.5 text-xs sm:text-sm',
        bold && 'mt-1.5 border-t border-gold-200 pt-2 font-bold',
      )}
    >
      <span className={cn('min-w-0 text-slate-600', bold && 'font-bold text-brand-800')}>{label}</span>
      <span
        className={cn(
          'shrink-0 tabular-nums',
          bold ? 'font-display text-base font-extrabold sm:text-lg' : 'font-semibold',
          tone ?? 'text-brand-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MethodButton({ active, disabled, icon: Icon, label, tone, onClick }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border p-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        active ? tone : 'border-line bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{label}</span>
    </button>
  );
}

export function ReturnSheet({
  open,
  invoiceNo,
  labels,
  partyName,
  invoiceDate,
  products,
  balanceDue,
  returns,
  partyReturns,
  onClose,
  onSubmit,
}) {
  const isSales = labels?.party?.toLowerCase()?.includes('customer');
  const methodLabelId = useId();
  const nextKey = useRef(1);
  const makeItem = useCallback(() => newReturnItem(`item-${nextKey.current++}`), []);
  const [returnDate, setReturnDate] = useState(todayISO());
  const [items, setItems] = useState(() => [makeItem()]);
  const [method, setMethod] = useState('cash'); // 'cash' | 'account'
  const [bankAccountId, setBankAccountId] = useState('');
  const [liveBalances, setLiveBalances] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReturnDate(todayISO());
      setItems([makeItem()]);
      setMethod('cash');
      setBankAccountId('');
      setError(null);
      setBusy(false);
      loadLiveAccountBalances()
        .then((b) => setLiveBalances(b))
        .catch(console.error);
    }
  }, [open, makeItem]);

  const bankAccounts = liveBalances?.bankAccounts || [];
  const cashBalance = liveBalances?.cashBalance ?? 0;
  const noAccounts = liveBalances !== null && bankAccounts.length === 0;
  const selectedBankId = bankAccountId || bankAccounts[0]?.id || '';
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId);

  const previousReturns = sumReturnAmounts(returns);
  const total = returnTotal(items);
  const returned = returnedQtyByDescription(partyReturns ?? returns);
  const update = (key, next) => setItems((list) => list.map((i) => (i.key === key ? next : i)));

  const isCashOverdraft = isSales && method === 'cash' && total > cashBalance;
  const isBankOverdraft =
    isSales && method === 'account' && selectedBank && total > selectedBank.currentBalance;

  const submit = async () => {
    if (busy) return;
    if (method === 'account' && !selectedBankId) {
      setError('Add a bank account in Finance to refund to an account, or choose Cash.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const failure = await onSubmit({
        returnDate,
        items,
        settlementType: 'refund',
        refundMethod: method === 'cash' ? 'cash' : 'bank',
        bankAccountId: method === 'cash' ? null : selectedBankId,
      });
      if (failure) setError(failure);
    } finally {
      setBusy(false);
    }
  };

  const methodLabel = method === 'cash' ? 'Cash' : 'Account';

  return (
    <HistorySheet
      open={open}
      onClose={onClose}
      title={`Process Return - Invoice #${invoiceNo}`}
      size="lg"
      actions={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            variant="warning"
            icon={Save}
            onClick={submit}
            loading={busy}
            className="flex-1 sm:flex-none"
          >
            Save Return
          </Button>
        </>
      }
    >
      <div className="mb-4 rounded-2xl border border-line bg-slate-50/70 p-3.5">
        <p className="font-display text-base font-bold text-brand-800">{`${labels.party}: ${partyName}`}</p>
        <p className="text-sm text-slate-500">Invoice Date: {formatDateIN(invoiceDate)}</p>
        {previousReturns > 0 ? (
          <p className="mt-0.5 text-sm font-bold text-amber-700">Previous Returns: {rs(previousReturns)}</p>
        ) : null}
      </div>

      <DateField label="Return Date" value={returnDate} onChange={setReturnDate} className="mb-4 max-w-xs" />

      <h3 className="mb-2 font-display text-base font-bold text-brand-800">Return Products</h3>
      {items.map((item, index) => (
        <ReturnItemEditor
          key={item.key}
          index={index}
          item={item}
          products={products}
          returnedQty={returned}
          onChange={(next) => update(item.key, next)}
          onRemove={() => setItems((list) => list.filter((i) => i.key !== item.key))}
        />
      ))}
      <Button
        variant="warning"
        icon={Plus}
        fullWidth
        onClick={() => setItems((list) => [...list, makeItem()])}
      >
        Add Return Item
      </Button>

      {/* Refund method */}
      <div className="my-4 space-y-2.5 rounded-2xl border border-line bg-slate-50/80 p-3 sm:p-3.5">
        <p id={methodLabelId} className="text-xs font-bold tracking-wider text-slate-700 uppercase">
          {isSales ? 'Refund to customer' : 'Refund from supplier'}
        </p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={methodLabelId}>
          <MethodButton
            active={method === 'cash'}
            icon={Banknote}
            label="Cash"
            tone="border-emerald-500 bg-emerald-50/80 text-emerald-900 shadow-xs ring-1 ring-emerald-400"
            onClick={() => setMethod('cash')}
          />
          <MethodButton
            active={method === 'account'}
            disabled={noAccounts}
            icon={Landmark}
            label="Account"
            tone="border-brand-500 bg-brand-50/80 text-brand-900 shadow-xs ring-1 ring-brand-400"
            onClick={() => setMethod('account')}
          />
        </div>
        {noAccounts ? (
          <p className="px-1 text-[11px] font-medium text-slate-500">
            No bank account yet — add one in Finance to refund to an account.
          </p>
        ) : null}

        {/* Cash Balance Indicator (money leaves the drawer only for sales refunds) */}
        {isSales && method === 'cash' && liveBalances && (
          <div
            className={cn(
              'flex items-center justify-between rounded-xl border px-3 py-1.5 text-xs transition',
              isCashOverdraft
                ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-xs'
                : 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900 shadow-xs',
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold">
              <span
                className={cn(
                  'size-2 rounded-full',
                  isCashOverdraft ? 'animate-pulse bg-amber-500' : 'bg-emerald-500',
                )}
              />
              Current Cash in Drawer
            </span>
            <span className="font-display text-[13px] font-extrabold tabular-nums">
              ₹{formatCurrency(cashBalance)}
            </span>
          </div>
        )}

        {isCashOverdraft && (
          <div className="flex items-center gap-1.5 px-2 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              Refund amount (₹{formatCurrency(total)}) exceeds available cash drawer balance (₹
              {formatCurrency(cashBalance)}).
            </span>
          </div>
        )}

        {/* Bank account: a picker only when there is a choice to make */}
        {method === 'account' && selectedBank && (
          <div className="space-y-1.5 rounded-xl border border-line bg-white p-2.5">
            {bankAccounts.length > 1 ? (
              <SelectField
                label={isSales ? 'Refund from Account' : 'Receive refund into Account'}
                value={selectedBankId}
                onChange={(bId) => setBankAccountId(bId)}
                options={bankAccounts.map((a) => ({
                  value: a.id,
                  label: `${accountLabel(a)} • Balance: ₹${formatCurrency(a.currentBalance)}`,
                }))}
              />
            ) : null}
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              <span className="min-w-0 truncate">{accountLabel(selectedBank)} available:</span>
              <span className="font-display font-bold text-slate-800 tabular-nums">
                ₹{formatCurrency(selectedBank.currentBalance)}
              </span>
            </div>
            {isBankOverdraft && (
              <div className="flex items-center gap-1.5 pt-1 text-[11px] font-semibold text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>
                  Refund amount (₹{formatCurrency(total)}) exceeds available account balance (₹
                  {formatCurrency(selectedBank.currentBalance)}).
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="my-4 rounded-2xl border border-gold-200 bg-gold-50/60 p-3 sm:p-3.5">
        <SummaryRow label="Return Amount:" value={rs(total)} />
        <SummaryRow
          label={`Refund (${methodLabel}):`}
          value={rs(total)}
          tone={isSales ? 'text-amber-700' : 'text-emerald-700'}
          bold
        />
        {balanceDue !== undefined && balanceDue !== null ? (
          <p className="mt-1.5 text-xs text-slate-500">Bill balance due stays {rs(balanceDue)}</p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}
    </HistorySheet>
  );
}
