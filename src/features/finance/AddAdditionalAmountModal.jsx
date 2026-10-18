import { ArrowDownLeft, ArrowUpRight, PlusCircle, Save } from 'lucide-react';
import { useState } from 'react';

import { todayISO } from '@/core/format';
import { Button, DateField, Grid, Modal, NumberField, SelectField, TextField } from '@/ui';

const FORM_ID = 'add-additional-amount-form';

const REASON_OPTIONS_IN = [
  { value: 'Owner Capital / Personal Funds', label: 'Owner Capital / Personal Investment' },
  { value: 'Direct Cash Deposit', label: 'Direct Cash Deposit' },
  { value: 'Other Business Income', label: 'Other Business Income / Commission' },
  { value: 'Interest / Incentive / Cashback', label: 'Bank Interest / Cashback / Incentive' },
  { value: 'Counter Cash Top-Up', label: 'Counter Cash Top-Up / Change Added' },
  { value: 'Balance Correction / Adjustment', label: 'Balance Correction / Audit Adjustment' },
  { value: 'Other', label: 'Other (Specify in Remarks)' },
];

const REASON_OPTIONS_OUT = [
  { value: 'Owner Drawings / Personal Use', label: 'Owner Drawings / Personal Withdrawal' },
  { value: 'Bank Charges / Maintenance Fee', label: 'Bank Charges / SMS / Maintenance Fee' },
  { value: 'Cash Adjustment / Discrepancy', label: 'Cash Adjustment / Drawer Shortage' },
  { value: 'Other', label: 'Other (Specify in Remarks)' },
];

export default function AddAdditionalAmountModal({
  accounts = [],
  initialAccountId = 'cash',
  initialMode = 'in',
  onClose,
  onSave,
  saving,
}) {
  const [mode, setMode] = useState(initialMode); // 'in' (Add Amount) | 'out' (Deduct Amount)
  const [form, setForm] = useState({
    date: todayISO(),
    account: initialAccountId || 'cash',
    amount: '',
    reason: initialMode === 'out' ? REASON_OPTIONS_OUT[0].value : REASON_OPTIONS_IN[0].value,
    notes: '',
  });

  const accountOptions = [
    { value: 'cash', label: 'Cash in Hand (Drawer)' },
    ...accounts.map((a) => ({
      value: a.id,
      label: `${a.accountName} (${a.bankName || a.accountType})`,
    })),
  ];

  const reasonOptions = mode === 'in' ? REASON_OPTIONS_IN : REASON_OPTIONS_OUT;

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setForm((prev) => ({
      ...prev,
      reason: newMode === 'out' ? REASON_OPTIONS_OUT[0].value : REASON_OPTIONS_IN[0].value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return;

    if (mode === 'in') {
      onSave({
        date: form.date,
        fromAccount: null, // external / manual addition
        toAccount: form.account,
        amount: amt,
        type: 'Additional Amount',
        category: form.reason,
        notes: form.notes.trim(),
      });
    } else {
      onSave({
        date: form.date,
        fromAccount: form.account,
        toAccount: null, // external / manual deduction
        amount: amt,
        type: 'Manual Deduction',
        category: form.reason,
        notes: form.notes.trim(),
      });
    }
  };

  return (
    <Modal
      open={true}
      onClose={saving ? undefined : onClose}
      title={
        <div className="flex items-center gap-2">
          <div
            className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
              mode === 'in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {mode === 'in' ? <ArrowDownLeft className="size-4.5" /> : <ArrowUpRight className="size-4.5" />}
          </div>
          <div>
            <div className="text-base font-bold text-slate-900">
              {mode === 'in' ? 'Add Additional Amount' : 'Record Manual Deduction'}
            </div>
            <div className="text-xs font-normal text-slate-500">
              Manual balance adjustment for Bank Accounts or Cash in Hand
            </div>
          </div>
        </div>
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            icon={Save}
            loading={saving}
            className={`max-sm:flex-1 ${
              mode === 'in' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-rose-700 hover:bg-rose-800'
            }`}
          >
            {saving ? 'Saving...' : mode === 'in' ? 'Add Amount' : 'Record Deduction'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        {/* Toggle Mode: Inflow (+) vs Outflow (-) */}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => handleModeChange('in')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
              mode === 'in' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowDownLeft className="size-4" />
            <span>+ Add Amount (Inflow)</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeChange('out')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition ${
              mode === 'out' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowUpRight className="size-4" />
            <span>- Deduct Amount (Outflow)</span>
          </button>
        </div>

        <Grid>
          <SelectField
            label={mode === 'in' ? 'Deposit Into (Account)' : 'Deduct From (Account)'}
            value={form.account}
            onChange={(account) => setForm((prev) => ({ ...prev, account }))}
            options={accountOptions}
            required
          />

          <NumberField
            label="Amount (₹)"
            placeholder="0.00"
            value={form.amount}
            onChange={(amount) => setForm((prev) => ({ ...prev, amount }))}
            required
            autoFocus
          />

          <DateField
            label="Entry Date"
            value={form.date}
            onChange={(date) => setForm((prev) => ({ ...prev, date }))}
            required
          />

          <SelectField
            label="Reason / Category"
            value={form.reason}
            onChange={(reason) => setForm((prev) => ({ ...prev, reason }))}
            options={reasonOptions}
            required
          />

          <TextField
            label="Remarks / Reference (optional)"
            placeholder="e.g. Personal fund addition, counter top-up, cheque #12345"
            value={form.notes}
            onChange={(notes) => setForm((prev) => ({ ...prev, notes }))}
            className="sm:col-span-2"
          />
        </Grid>
      </form>
    </Modal>
  );
}
