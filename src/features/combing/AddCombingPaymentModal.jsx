import { AlertTriangle, Banknote, Landmark, Save, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { formatCurrency, todayISO } from '@/core/format';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { Button, DateField, Modal, NumberField, SelectField, TextField, useFeedback } from '@/ui';

import { calcCombingBatchPaymentStats } from './combingLogic';
import { addCombingBatchPayment } from './combingService';

const FORM_ID = 'combing-payment-form';

export function AddCombingPaymentModal({ open, batch, onClose, onPaymentAdded }) {
  const { toast } = useFeedback();
  const [saving, setSaving] = useState(false);
  const [liveBalances, setLiveBalances] = useState(null);

  const stats = useMemo(() => {
    return calcCombingBatchPaymentStats(batch);
  }, [batch]);

  const [form, setForm] = useState({
    date: todayISO(),
    amount: '',
    mode: 'Cash', // 'Cash' | 'Bank' | 'UPI'
    bankAccountId: '',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    if (open && batch) {
      const currentStats = calcCombingBatchPaymentStats(batch);
      setForm({
        date: todayISO(),
        amount: currentStats.balanceDue > 0 ? String(currentStats.balanceDue) : '',
        mode: 'Cash',
        bankAccountId: '',
        reference: '',
        notes: '',
      });
      loadLiveAccountBalances()
        .then((b) => setLiveBalances(b))
        .catch(console.error);
    }
  }, [open, batch]);

  const bankAccounts = liveBalances?.bankAccounts || [];
  const cashBalance = liveBalances?.cashBalance ?? 0;

  const isCash = form.mode === 'Cash';
  const selectedBankId = form.bankAccountId || (bankAccounts[0]?.id ?? '');
  const selectedBank = bankAccounts.find((b) => b.id === selectedBankId);

  const availableBalance = isCash ? cashBalance : (selectedBank?.currentBalance ?? 0);
  const amountNum = parseFloat(form.amount) || 0;
  const isOverdrawn = liveBalances !== null && amountNum > 0 && amountNum > availableBalance;

  const bankAccountOptions = useMemo(() => {
    if (bankAccounts.length === 0) {
      return [{ value: '', label: 'No bank accounts configured' }];
    }
    return bankAccounts.map((b) => ({
      value: b.id,
      label: `${b.accountName} (${b.bankName || b.accountType || 'Bank'}) • Balance: ₹${formatCurrency(b.currentBalance)}`,
    }));
  }, [bankAccounts]);

  if (!open || !batch) return null;

  const handleFillBalance = () => {
    if (stats.balanceDue > 0) {
      setForm((prev) => ({ ...prev, amount: String(stats.balanceDue) }));
    }
  };

  const handleModeChange = (mode) => {
    setForm((prev) => ({
      ...prev,
      mode,
      bankAccountId: mode === 'Cash' ? '' : prev.bankAccountId || bankAccounts[0]?.id || '',
    }));
  };

  const handleBankChange = (val) => {
    const nextId = typeof val === 'object' && val?.target ? val.target.value : (val || '');
    setForm((prev) => ({ ...prev, bankAccountId: nextId }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    if (!amountNum || amountNum <= 0) {
      toast('Invalid Amount', 'Please enter a payment amount greater than zero.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        date: form.date || todayISO(),
        amount: amountNum,
        mode: form.mode,
        bankAccountId: form.mode === 'Cash' ? null : selectedBankId || null,
        bankAccountName: form.mode === 'Cash' ? '' : selectedBank?.accountName || '',
        reference: form.reference.trim(),
        notes: form.notes.trim(),
      };

      const result = await addCombingBatchPayment(batch.batchId, payload);
      toast(
        'Payment Recorded',
        `₹${formatCurrency(amountNum)} paid to ${batch.processorName} for Batch #${batch.batchId}.`,
        'success',
      );
      if (onPaymentAdded) {
        onPaymentAdded(result.batch, result.payment);
      }
      onClose();
    } catch (err) {
      console.error('Failed to add combing payment:', err);
      toast('Payment Failed', err.message || 'Could not record payment.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={
        <div className="flex items-center gap-2">
          <Banknote className="size-5 text-emerald-600" />
          <span>Pay Mill / Processor — Batch #{batch.batchId}</span>
        </div>
      }
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
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
            {saving ? 'Recording...' : 'Record Payment'}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {/* Processor & Balance Summary Banner */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5 space-y-2.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Mill / Processing Unit
              </div>
              <div className="font-bold text-slate-900 text-sm">{batch.processorName}</div>
              {batch.processorPhone && (
                <div className="text-xs font-mono text-slate-500 mt-0.5">{batch.processorPhone}</div>
              )}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Balance Due
              </div>
              <div className="font-display text-base font-extrabold text-rose-700 tabular-nums">
                ₹{formatCurrency(stats.balanceDue)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-slate-200/70 pt-2 text-xs">
            <div>
              <span className="text-slate-500">Processing Charges:</span>{' '}
              <span className="font-bold text-slate-800">₹{formatCurrency(stats.totalCharges)}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500">Already Paid:</span>{' '}
              <span className="font-bold text-emerald-700">₹{formatCurrency(stats.totalPaid)}</span>
            </div>
          </div>
        </div>

        {/* Date Field */}
        <DateField
          label="Payment Date *"
          value={form.date}
          onChange={(v) => setForm((p) => ({ ...p, date: v }))}
          required
        />

        {/* Amount Field + Fill Balance shortcut */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">Amount to Pay (₹) *</label>
            {stats.balanceDue > 0 && amountNum !== stats.balanceDue && (
              <button
                type="button"
                onClick={handleFillBalance}
                className="text-xs font-semibold text-brand-700 hover:text-brand-900 underline underline-offset-2"
              >
                Pay Full Balance (₹{formatCurrency(stats.balanceDue)})
              </button>
            )}
          </div>
          <NumberField
            value={form.amount}
            onChange={(v) => setForm((p) => ({ ...p, amount: v }))}
            placeholder={`Enter amount (Due: ₹${formatCurrency(stats.balanceDue)})`}
            required
            min={1}
            step="0.01"
          />
        </div>

        {/* Payment Mode Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-700">Payment Mode *</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('Cash')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-xs font-bold transition shadow-2xs ${
                form.mode === 'Cash'
                  ? 'border-emerald-500 bg-emerald-50/80 text-emerald-900 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Banknote className="size-4 text-emerald-600" />
              <span>Cash</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('Bank')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-xs font-bold transition shadow-2xs ${
                form.mode === 'Bank'
                  ? 'border-blue-500 bg-blue-50/80 text-blue-900 ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Landmark className="size-4 text-blue-600" />
              <span>Bank</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('UPI')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-xs font-bold transition shadow-2xs ${
                form.mode === 'UPI'
                  ? 'border-purple-500 bg-purple-50/80 text-purple-900 ring-2 ring-purple-500/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Smartphone className="size-4 text-purple-600" />
              <span>UPI</span>
            </button>
          </div>
        </div>

        {/* Bank Account Selection (if Bank or UPI) */}
        {!isCash && (
          <div className="space-y-1.5">
            <SelectField
              label="Select Bank Account *"
              value={selectedBankId}
              onChange={handleBankChange}
              options={bankAccountOptions}
            />
          </div>
        )}

        {/* Cash in Hand indicator (if Cash) */}
        {isCash && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <span className="text-slate-600">Physical Cash Drawer:</span>
            <span className="font-bold text-slate-900 tabular-nums">
              ₹{formatCurrency(cashBalance)} available
            </span>
          </div>
        )}

        {/* Overdraft Warning Banner */}
        {isOverdrawn && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
            <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <span className="font-bold">Insufficient Balance Warning:</span> The entered amount (₹
              {formatCurrency(amountNum)}) exceeds the available account balance (₹
              {formatCurrency(availableBalance)}). The balance will show negative.
            </div>
          </div>
        )}

        {/* Optional Cheque/UTR Reference */}
        <TextField
          label="Reference / Cheque No / UTR (Optional)"
          value={form.reference}
          onChange={(v) => setForm((p) => ({ ...p, reference: v }))}
          placeholder="e.g. UTR12345678, Cheque #004521"
        />

        {/* Optional Notes */}
        <TextField
          label="Notes / Remarks (Optional)"
          value={form.notes}
          onChange={(v) => setForm((p) => ({ ...p, notes: v }))}
          placeholder="e.g. Paid combing and processing charges"
        />
      </form>
    </Modal>
  );
}
