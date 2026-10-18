import { ArrowDownLeft, ArrowUpRight, Save, Scale } from 'lucide-react';
import { useState } from 'react';

import { accountLabel, CASH_LABEL } from '@/core/accountLabel';
import { formatCurrency, todayISO, toNum } from '@/core/format';
import { Button, DateField, Grid, Modal, NumberField, SelectField, TextField } from '@/ui';

import { buildCashBalanceEdit } from './accountsLogic';

const FORM_ID = 'add-additional-amount-form';

const rs = (n) => {
  const val = toNum(n);
  return val < 0 ? `-₹${formatCurrency(Math.abs(val))}` : `₹${formatCurrency(val)}`;
};

const TITLES = {
  in: 'Add Amount',
  out: 'Deduct Amount',
  set: 'Edit Cash Balance',
};

/**
 * Manual entries on an account, saved as ONE account_transactions doc through `onSave`:
 *  - 'in'  (+ Add)        → { fromAccount: null, toAccount: account, type: 'Additional Amount' }
 *  - 'out' (− Deduct)     → { fromAccount: account, toAccount: null, type: 'Manual Deduction' }
 *  - 'set' (Edit Balance, Cash only) → the difference between the counted cash and `cashBalance`
 *    (see buildCashBalanceEdit).
 */
export default function AddAdditionalAmountModal({
  accounts = [],
  cashBalance = 0,
  initialAccountId = 'cash',
  initialMode = 'in',
  onClose,
  onSave,
  saving,
}) {
  const [mode, setMode] = useState(initialMode); // 'in' | 'out' | 'set'
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    date: todayISO(),
    account: initialMode === 'set' ? 'cash' : initialAccountId || 'cash',
    amount: '',
    target: '',
    notes: '',
  });

  const isCash = form.account === 'cash';
  const accountOptions = [
    { value: 'cash', label: CASH_LABEL },
    ...accounts.map((a) => ({ value: a.id, label: accountLabel(a) })),
  ];

  const targetNum = parseFloat(form.target);
  const hasTarget = form.target !== '' && Number.isFinite(targetNum);
  const delta = hasTarget ? Math.round((targetNum - toNum(cashBalance)) * 100) / 100 : 0;

  const changeMode = (next) => {
    setMode(next);
    setError('');
    if (next === 'set') setForm((prev) => ({ ...prev, account: 'cash' }));
  };

  const changeAccount = (account) => {
    setForm((prev) => ({ ...prev, account }));
    // Edit Balance is a cash-only action
    if (account !== 'cash' && mode === 'set') setMode('in');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'set') {
      if (!hasTarget || targetNum < 0) {
        setError('Enter the cash you actually have (0 or more)');
        return;
      }
      const tx = buildCashBalanceEdit({
        cashBalance,
        target: targetNum,
        date: form.date,
        notes: form.notes,
      });
      if (!tx) {
        setError('Balance unchanged');
        return;
      }
      onSave(tx);
      return;
    }

    const amt = parseFloat(form.amount);
    if (!amt || amt <= 0) return;
    onSave(
      mode === 'in'
        ? {
            date: form.date,
            fromAccount: null, // added from outside the system
            toAccount: form.account,
            amount: amt,
            type: 'Additional Amount',
            notes: form.notes.trim(),
          }
        : {
            date: form.date,
            fromAccount: form.account,
            toAccount: null, // removed to outside the system
            amount: amt,
            type: 'Manual Deduction',
            notes: form.notes.trim(),
          },
    );
  };

  const modes = [
    { value: 'in', label: '+ Add', icon: ArrowDownLeft, active: 'bg-emerald-600 text-white shadow-sm' },
    { value: 'out', label: '− Deduct', icon: ArrowUpRight, active: 'bg-rose-600 text-white shadow-sm' },
    ...(isCash
      ? [{ value: 'set', label: 'Edit Balance', icon: Scale, active: 'bg-brand-800 text-white shadow-sm' }]
      : []),
  ];

  return (
    <Modal
      open={true}
      onClose={saving ? undefined : onClose}
      title={TITLES[mode] || TITLES.in}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant={mode === 'out' ? 'danger' : mode === 'set' ? 'secondary' : 'success'}
            icon={Save}
            loading={saving}
            className="max-sm:flex-1"
          >
            {saving
              ? 'Saving...'
              : mode === 'in'
                ? 'Add Amount'
                : mode === 'out'
                  ? 'Record Deduction'
                  : 'Update Balance'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div
          className={`grid gap-2 rounded-xl bg-slate-100 p-1 ${modes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}
        >
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => changeMode(m.value)}
              className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-1 text-xs font-bold transition sm:text-sm ${
                mode === m.value ? m.active : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <m.icon className="size-4 shrink-0" aria-hidden />
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {mode === 'set' ? (
          <>
            <div className="flex items-center justify-between rounded-xl border border-line bg-slate-50/80 px-3.5 py-2.5 text-sm">
              <span className="font-semibold text-slate-600">Current cash (system)</span>
              <span className="font-display font-extrabold text-slate-900 tabular-nums">
                {rs(cashBalance)}
              </span>
            </div>
            <Grid cols={{ base: 1, sm: 2 }}>
              <NumberField
                label="Actual cash in hand (₹)"
                value={form.target}
                onChange={(target) => {
                  setForm((prev) => ({ ...prev, target }));
                  setError('');
                }}
                error={error}
                hint={
                  hasTarget && Math.abs(delta) >= 0.01
                    ? `Difference: ${delta > 0 ? '+' : '−'}₹${formatCurrency(Math.abs(delta))}`
                    : 'Only the difference is recorded, as one entry you can undo.'
                }
                required
                autoFocus
              />
              <DateField
                label="Entry Date"
                value={form.date}
                onChange={(date) => setForm((prev) => ({ ...prev, date }))}
                required
              />
              <TextField
                label="Remarks (optional)"
                placeholder="e.g. Cash counted at closing"
                value={form.notes}
                onChange={(notes) => setForm((prev) => ({ ...prev, notes }))}
                className="sm:col-span-2"
              />
            </Grid>
          </>
        ) : (
          <Grid cols={{ base: 1, sm: 2 }}>
            <SelectField
              label={mode === 'in' ? 'Add To' : 'Deduct From'}
              value={form.account}
              onChange={changeAccount}
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
            <TextField
              label="Remarks / Reference (optional)"
              placeholder="e.g. Owner capital, bank charges, cheque #12345"
              value={form.notes}
              onChange={(notes) => setForm((prev) => ({ ...prev, notes }))}
            />
          </Grid>
        )}
      </form>
    </Modal>
  );
}
