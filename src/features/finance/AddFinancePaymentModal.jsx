import { AlertTriangle, Banknote, Building2, Save } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { db } from '@/core/db';
import { Button, Modal, NumberField, DateField, SelectField, useFeedback } from '@/ui';
import { formatCurrency, todayISO } from '@/core/format';
import { calculateFinanceStats } from './financeLogic';
import { loadLiveAccountBalances } from './accountsLogic';

const FORM_ID = 'finance-payment-form';

export default function AddFinancePaymentModal({ record, onClose, onSave }) {
  const { toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [liveBalances, setLiveBalances] = useState(null);
  const [form, setForm] = useState({
    date: todayISO(),
    amount: '',
    mode: 'Cash',
    sourceAccount: 'cash',
  });

  useEffect(() => {
    if (record) {
      setForm({
        date: todayISO(),
        amount: '',
        mode: 'Cash',
        sourceAccount: 'cash',
      });
      loadLiveAccountBalances().then(setLiveBalances).catch(console.error);
    }
  }, [record]);

  const bankAccounts = liveBalances?.bankAccounts || [];
  const cashBalance = liveBalances?.cashBalance ?? 0;

  const stats = useMemo(() => {
    if (!record) return null;
    return calculateFinanceStats(record);
  }, [record]);

  if (!record) return null;

  const balancePayable = stats?.balancePayable ?? 0;
  const isCash = form.mode === 'Cash';
  const selectedBank = bankAccounts.find((b) => b.id === form.sourceAccount);
  const availableBalance = isCash ? cashBalance : (selectedBank?.currentBalance ?? 0);
  const amountNum = parseFloat(form.amount) || 0;
  const isOverdrawn = liveBalances !== null && amountNum > 0 && amountNum > availableBalance;

  const handleModeChange = (newMode) => {
    if (newMode === 'Cash') {
      setForm((prev) => ({ ...prev, mode: newMode, sourceAccount: 'cash' }));
    } else {
      const defaultBankId =
        form.sourceAccount && form.sourceAccount !== 'cash' ? form.sourceAccount : bankAccounts[0]?.id || '';
      setForm((prev) => ({ ...prev, mode: newMode, sourceAccount: defaultBankId }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || parseFloat(form.amount) <= 0) return;

    const isDuplicate = record.payments?.some(
      (p) => p.date === form.date && parseFloat(p.amount) === parseFloat(form.amount),
    );
    if (isDuplicate) {
      toast('Duplicate Entry', 'A payment of this exact amount is already recorded on this date.', 'error');
      return;
    }

    setSaving(true);
    try {
      const source = form.mode === 'Cash' ? 'cash' : form.sourceAccount || bankAccounts[0]?.id || 'cash';

      const newPayment = {
        id: crypto.randomUUID(),
        date: form.date,
        amount: parseFloat(form.amount),
        mode: form.mode,
        sourceAccount: source,
      };

      const updatedRecord = {
        ...record,
        payments: [...(record.payments || []), newPayment],
      };

      await db.saveFinanceRecord(updatedRecord);
      onSave(updatedRecord);
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to save payment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const paymentModeOptions = [
    {
      value: 'Cash',
      label: `Cash • Drawer: ₹${formatCurrency(cashBalance)}`,
    },
    {
      value: 'UPI',
      label: 'UPI (Bank Account)',
    },
    {
      value: 'Account',
      label: 'Account Transfer (Bank)',
    },
  ];

  const bankAccountOptions = bankAccounts.map((a) => ({
    value: a.id,
    label: `${a.accountName} (${a.bankName || a.accountType}) • Balance: ₹${formatCurrency(a.currentBalance)}`,
  }));

  const cashOption = [
    {
      value: 'cash',
      label: `Cash in Hand (Physical Cash) • Available: ₹${formatCurrency(cashBalance)}`,
    },
  ];

  return (
    <Modal
      open={true}
      onClose={saving ? undefined : onClose}
      title="Add Payment"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="success"
            icon={Save}
            loading={saving}
            className="max-sm:flex-1"
          >
            {saving ? 'Saving...' : 'Save Payment'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Lender</span>
              <div className="text-base font-bold text-slate-900">{record.lenderName}</div>
              {record.phone && <div className="mt-0.5 font-mono text-xs text-slate-500">{record.phone}</div>}
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                Balance Due
              </span>
              <div className="font-display text-lg font-black text-rose-700 tabular-nums">
                ₹{formatCurrency(balancePayable)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-2 text-xs">
            <div>
              <span className="text-slate-500">Principal:</span>{' '}
              <span className="font-bold text-slate-800">₹{formatCurrency(record.principal)}</span>
            </div>
            <div>
              <span className="text-slate-500">Accrued Int:</span>{' '}
              <span className="font-bold text-amber-700">
                ₹{formatCurrency(stats?.totalInterestAccrued || 0)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-500">Paid:</span>{' '}
              <span className="font-bold text-blue-700">₹{formatCurrency(stats?.totalPaid || 0)}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              label="Payment Date"
              value={form.date}
              onChange={(v) => setForm((f) => ({ ...f, date: v }))}
              required
            />
            <NumberField
              label="Amount Paid (Rs.)"
              value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
              required
            />
          </div>
          {balancePayable > 0 && (
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, amount: String(Math.round(balancePayable * 100) / 100) }))
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 hover:text-brand-800 hover:underline"
              >
                Pay Full Due (₹{formatCurrency(balancePayable)})
              </button>
            </div>
          )}
        </div>

        <SelectField
          label="Payment Mode"
          value={form.mode}
          onChange={handleModeChange}
          options={paymentModeOptions}
        />

        {isCash ? (
          <SelectField
            label="Deduct / Pay From"
            value="cash"
            onChange={() => {}}
            disabled
            options={cashOption}
          />
        ) : (
          <div className="space-y-1">
            <SelectField
              label="Deduct from Bank Account"
              value={form.sourceAccount}
              onChange={(v) => setForm((f) => ({ ...f, sourceAccount: v }))}
              options={bankAccountOptions}
              required
            />
            {bankAccounts.length === 0 && (
              <p className="text-[11px] font-semibold text-amber-700">
                No bank accounts found. Please add a bank account in Bank & Cash Balances.
              </p>
            )}
          </div>
        )}

        {/* Live balance indicator */}
        {liveBalances && (
          <div
            className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs transition ${
              isOverdrawn
                ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-xs'
                : 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900 shadow-xs'
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-semibold">
              <span
                className={`size-2 rounded-full ${
                  isOverdrawn ? 'animate-pulse bg-amber-500' : 'bg-emerald-500'
                }`}
              />
              {isCash ? (
                <>
                  <Banknote className="size-4 text-emerald-700" />
                  <span>Available Cash in Drawer:</span>
                </>
              ) : (
                <>
                  <Building2 className="size-4 text-brand-700" />
                  <span>Available in {selectedBank?.accountName || 'Bank Account'}:</span>
                </>
              )}
            </span>
            <span className="font-display text-sm font-extrabold tabular-nums">
              ₹{formatCurrency(availableBalance)}
            </span>
          </div>
        )}

        {isOverdrawn && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>
              Payment amount of ₹{formatCurrency(amountNum)} exceeds available balance (₹
              {formatCurrency(availableBalance)}).
            </span>
          </div>
        )}
      </form>
    </Modal>
  );
}
