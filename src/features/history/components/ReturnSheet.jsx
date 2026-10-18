/**
 * ReturnSheet – "Process Return - Invoice #x": pick products from the invoice (or a custom one), qty, rate,
 * reason; live summary of the new adjusted balance. Errors are shown inside the sheet.
 *
 * Props:
 *   open (bool) · invoiceNo · labels ({ party }) · partyName · invoiceDate · onClose()
 *   products   the invoice's product lines [{ description, qty (sold), rate }]
 *   balanceDue the invoice balance before returns
 *   returns    returns already stored for the invoice (HistoryReturn[])
 *   onSubmit({ returnDate, items }) => Promise<string | null>   string = inline error, null = saved
 */
import { AlertTriangle, Banknote, Building2, Plus, ReceiptText, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatCurrency, formatDateIN, todayISO } from '@/core/format';
import { Button, DateField, SelectField, cn } from '@/ui';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { newReturnItem, returnSummary, returnedQtyByDescription } from '../lib/returns';
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

export function ReturnSheet({
  open,
  invoiceNo,
  labels,
  partyName,
  invoiceDate,
  products,
  balanceDue,
  returns,
  onClose,
  onSubmit,
}) {
  const isSales = labels?.party?.toLowerCase()?.includes('customer');
  const nextKey = useRef(1);
  const makeItem = useCallback(() => newReturnItem(`item-${nextKey.current++}`), []);
  const [returnDate, setReturnDate] = useState(todayISO());
  const [items, setItems] = useState(() => [makeItem()]);
  const [settlementType, setSettlementType] = useState('adjustment'); // 'adjustment' | 'cash' | 'bank'
  const [bankAccountId, setBankAccountId] = useState('');
  const [liveBalances, setLiveBalances] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReturnDate(todayISO());
      setItems([makeItem()]);
      setSettlementType('adjustment');
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
  const selectedBankId = bankAccountId || bankAccounts[0]?.id || '';
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId);

  const previousReturns = returns.reduce((sum, r) => sum + (Number(r.returnAmount) || 0), 0);
  const currentBalance = balanceDue - previousReturns;
  const { total, newAdjustedBalance } = returnSummary(items, currentBalance);
  const returned = returnedQtyByDescription(returns);
  const update = (key, next) => setItems((list) => list.map((i) => (i.key === key ? next : i)));

  const isCashOverdraft = isSales && settlementType === 'cash' && total > cashBalance;
  const isBankOverdraft =
    isSales && settlementType === 'bank' && selectedBank && total > selectedBank.currentBalance;

  const submit = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const failure = await onSubmit({
        returnDate,
        items,
        settlementType: settlementType === 'adjustment' ? 'adjustment' : 'refund',
        refundMethod: settlementType === 'adjustment' ? null : settlementType,
        bankAccountId: settlementType === 'bank' ? selectedBankId : null,
      });
      if (failure) setError(failure);
    } finally {
      setBusy(false);
    }
  };

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

      {/* Settlement / Refund Option */}
      <div className="my-4 space-y-2.5 rounded-2xl border border-line bg-slate-50/80 p-3 sm:p-3.5">
        <label className="block text-xs font-bold tracking-wider text-slate-700 uppercase">
          Settlement / Refund Method
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setSettlementType('adjustment')}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition',
              settlementType === 'adjustment'
                ? 'border-gold-500 bg-gold-50/80 text-brand-900 shadow-xs ring-1 ring-gold-400'
                : 'border-line bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <ReceiptText className="size-4 shrink-0 text-brand-700" />
            <span>Adjust Balance Due</span>
          </button>
          <button
            type="button"
            onClick={() => setSettlementType('cash')}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition',
              settlementType === 'cash'
                ? 'border-emerald-500 bg-emerald-50/80 text-emerald-900 shadow-xs ring-1 ring-emerald-400'
                : 'border-line bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <Banknote className="size-4 shrink-0 text-emerald-600" />
            <span>{isSales ? 'Refund via Cash' : 'Supplier Cash Refund'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSettlementType('bank')}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-semibold transition',
              settlementType === 'bank'
                ? 'border-brand-500 bg-brand-50/80 text-brand-900 shadow-xs ring-1 ring-brand-400'
                : 'border-line bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            <Building2 className="size-4 shrink-0 text-brand-700" />
            <span>{isSales ? 'Refund via Bank' : 'Supplier Bank Refund'}</span>
          </button>
        </div>

        {/* Cash Balance Indicator */}
        {settlementType === 'cash' && liveBalances && (
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

        {/* Bank Account Selector */}
        {settlementType === 'bank' && bankAccounts.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-line bg-white p-2.5">
            <SelectField
              label={
                isSales ? 'Refund Customer from Bank Account' : 'Receive Supplier Refund into Bank Account'
              }
              value={selectedBankId}
              onChange={(bId) => setBankAccountId(bId)}
              options={bankAccounts.map((a) => ({
                value: a.id,
                label: `${a.accountName} (${a.bankName || a.accountType}) • Balance: ₹${formatCurrency(a.currentBalance)}`,
              }))}
            />
            {selectedBank && (
              <div className="flex items-center justify-between rounded-lg border border-slate-200/60 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
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
                  Refund amount (₹{formatCurrency(total)}) exceeds available bank balance (₹
                  {formatCurrency(selectedBank.currentBalance)}).
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="my-4 rounded-2xl border border-gold-200 bg-gold-50/60 p-3 sm:p-3.5">
        <SummaryRow label="Original Balance:" value={rs(balanceDue)} />
        {previousReturns > 0 ? (
          <>
            <SummaryRow label="Previous Returns:" value={`-${rs(previousReturns)}`} tone="text-amber-700" />
            <SummaryRow label="Balance Before Return:" value={rs(currentBalance)} />
          </>
        ) : null}
        <SummaryRow label="This Return Amount:" value={rs(total)} />
        {settlementType === 'adjustment' ? (
          <SummaryRow label="New Adjusted Balance:" value={rs(newAdjustedBalance)} bold />
        ) : (
          <SummaryRow
            label={isSales ? 'Direct Refund to Customer:' : 'Direct Refund from Supplier:'}
            value={rs(total)}
            tone={isSales ? 'text-amber-700' : 'text-emerald-700'}
            bold
          />
        )}
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
