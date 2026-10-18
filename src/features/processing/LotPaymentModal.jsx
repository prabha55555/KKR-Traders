/**
 * Payments of one lot to its dyeing unit and its combing unit (Cash or Account; mirrored into Finance by
 * processingService):
 *  - LotPaymentModal         add a payment (shows what each unit charged, paid and still has due)
 *  - LotPaymentHistoryModal  the payments made, with delete
 */
import { Trash2, Wallet } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { accountLabel } from '@/core/accountLabel';
import { formatCurrency, formatDateIN, todayISO, toNum } from '@/core/format';
import {
  Button,
  ChoiceChips,
  DateField,
  EmptyState,
  Grid,
  IconButton,
  Modal,
  NumberField,
  SelectField,
  TextField,
  cn,
} from '@/ui';
import { formatDcNo, lotTotals } from './lotLogic';
import { addLotPayment, deleteLotPayment } from './processingService';

const rupees = (n) => `₹${formatCurrency(n)}`;

function UnitTile({ title, name, charge, paid, due, active, onPick, disabled }) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'min-w-0 rounded-2xl p-3 text-left ring-1 transition',
        active ? 'bg-gold-50 ring-gold-300' : 'bg-white ring-line hover:bg-slate-50',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">{title}</div>
      <div className="truncate font-semibold text-brand-800" title={name || undefined}>
        {name || '—'}
      </div>
      <div className="mt-1 text-xs text-slate-600 tabular-nums">
        Charge {rupees(charge)} · Paid {rupees(paid)}
      </div>
      <div className={cn('mt-0.5 font-bold tabular-nums', due > 0 ? 'text-red-600' : 'text-emerald-700')}>
        {due > 0 ? `Due ${rupees(due)}` : due < 0 ? `Advance ${rupees(-due)}` : 'Settled'}
      </div>
    </button>
  );
}

export function LotPaymentModal({ open, onClose, lot, bankAccounts = [], onSaved, toast }) {
  const formId = useId();
  const [role, setRole] = useState('dyeing');
  const [form, setForm] = useState({
    amount: '',
    date: todayISO(),
    method: 'cash',
    bankAccountId: '',
    reference: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const t = lot ? lotTotals(lot) : null;
  useEffect(() => {
    if (!open || !lot) return;
    const totals = lotTotals(lot);
    const start = totals.dyeingDue > 0 || !lot.combingUnit ? 'dyeing' : 'combing';
    setRole(start);
    setError('');
    setForm({
      amount: String(Math.max(0, start === 'dyeing' ? totals.dyeingDue : totals.combingDue) || ''),
      date: todayISO(),
      method: 'cash',
      bankAccountId: bankAccounts[0]?.id ?? '',
      reference: '',
    });
    // reset only when the sheet opens for a lot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lot?.id]);
  if (!lot) return null;
  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const pick = (r) => {
    setRole(r);
    patch({ amount: String(Math.max(0, r === 'dyeing' ? t.dyeingDue : t.combingDue) || '') });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const bank = bankAccounts.find((b) => b.id === form.bankAccountId);
      const updated = await addLotPayment(lot, role, {
        ...form,
        bankAccountName: bank ? accountLabel(bank) : '',
      });
      toast(
        'Payment saved',
        `${rupees(toNum(form.amount))} to ${role === 'dyeing' ? lot.dyer?.name : lot.combingUnit?.name}`,
        'success',
      );
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      size="md"
      title={`Add payment — lot ${formatDcNo(lot.dcNo)}`}
      footer={
        <>
          <Button variant="neutral" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="success" loading={saving}>
            Save payment
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2.5">
        <UnitTile
          title="Dyeing unit"
          name={lot.dyer?.name}
          charge={t.dyeingCharge}
          paid={t.dyeingPaid}
          due={t.dyeingDue}
          active={role === 'dyeing'}
          onPick={() => pick('dyeing')}
        />
        <UnitTile
          title="Combing unit"
          name={lot.combingUnit?.name}
          charge={t.combingCharge}
          paid={t.combingPaid}
          due={t.combingDue}
          active={role === 'combing'}
          onPick={() => pick('combing')}
          disabled={!lot.combingUnit}
        />
      </div>

      <form id={formId} onSubmit={submit} className="mt-4 space-y-3.5" noValidate>
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
          >
            {error}
          </p>
        ) : null}
        <Grid cols={{ base: 1, sm: 2 }}>
          <NumberField label="Amount (₹)" value={form.amount} onChange={(amount) => patch({ amount })} />
          <DateField label="Date" value={form.date} onChange={(date) => patch({ date })} />
        </Grid>
        <ChoiceChips
          value={form.method}
          onChange={(method) => patch({ method })}
          options={[
            { value: 'cash', label: 'Cash' },
            { value: 'account', label: 'Account' },
          ]}
        />
        {form.method === 'account' ? (
          bankAccounts.length ? (
            <SelectField
              label="From account"
              value={form.bankAccountId}
              onChange={(bankAccountId) => patch({ bankAccountId })}
              options={bankAccounts.map((b) => ({ value: b.id, label: accountLabel(b) }))}
            />
          ) : (
            <p className="text-xs font-medium text-amber-700">
              Add a bank account in Finance first, or pay by Cash.
            </p>
          )
        ) : null}
        <TextField
          label="Reference (optional)"
          value={form.reference}
          onChange={(reference) => patch({ reference })}
          placeholder="Cheque / transaction no."
        />
      </form>
    </Modal>
  );
}

export function LotPaymentHistoryModal({ open, onClose, lot, onChanged, onAddPayment, confirm, toast }) {
  // one delete at a time: a second one started meanwhile would work on the lot from before the first
  const [busy, setBusy] = useState(false);
  if (!lot) return null;
  const t = lotTotals(lot);
  const history = [
    ...(lot.dyeingPayments ?? []).map((p) => ({ ...p, role: 'dyeing', unit: lot.dyer?.name })),
    ...(lot.combingPayments ?? []).map((p) => ({ ...p, role: 'combing', unit: lot.combingUnit?.name })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const remove = async (p) => {
    const ok = await confirm({
      title: 'Delete payment',
      message: `Delete the payment of ${rupees(p.amount)} dated ${formatDateIN(p.date)}? It is removed from Cash / bank balances too.`,
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    setBusy(true);
    try {
      onChanged(await deleteLotPayment(lot, p.role, p.id));
    } catch {
      toast('Error', 'Could not delete the payment.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Payment history — lot ${formatDcNo(lot.dcNo)}`}
      footer={
        <>
          <Button variant="neutral" onClick={onClose}>
            Close
          </Button>
          <Button variant="success" icon={Wallet} onClick={onAddPayment}>
            Add payment
          </Button>
        </>
      }
    >
      <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
        {[
          ['Dyeing unit', t.dyeingCharge, t.dyeingPaid, t.dyeingDue],
          ['Combing unit', t.combingCharge, t.combingPaid, t.combingDue],
        ].map(([label, charge, paid, due]) => (
          <div key={label} className="min-w-0 rounded-xl bg-slate-50 p-2.5 ring-1 ring-line">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-xs text-slate-600 tabular-nums">
              Charge {rupees(charge)} · Paid {rupees(paid)}
            </dd>
            <dd className={cn('font-bold tabular-nums', due > 0 ? 'text-red-600' : 'text-emerald-700')}>
              {due > 0 ? `Due ${rupees(due)}` : 'Settled'}
            </dd>
          </div>
        ))}
      </dl>
      {history.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payments yet"
          message="Payments to the dyeing and combing units appear here."
        />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl ring-1 ring-slate-300">
          {history.map((p) => {
            const detail = [
              formatDateIN(p.date),
              p.unit,
              p.mode === 'Cash' ? 'Cash' : `Account${p.bankAccountName ? `: ${p.bankAccountName}` : ''}`,
              p.reference,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-brand-800 tabular-nums">{rupees(p.amount)}</div>
                  <div className="truncate text-xs text-slate-500" title={detail}>
                    {detail}
                  </div>
                </div>
                <IconButton
                  icon={Trash2}
                  variant="outlineDanger"
                  label="Delete payment"
                  disabled={busy}
                  onClick={() => remove(p)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
