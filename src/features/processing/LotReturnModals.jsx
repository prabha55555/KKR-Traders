/**
 * Returns of a processing lot: fabric the dyeing or combing unit sent back unprocessed (rejected / excess).
 *  - AddReturnModal      records one return (back into stock; the unit's charge and the lot's loss follow)
 *  - ReturnHistoryModal  lists the returns and deletes a wrong one
 */
import { RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ProductDescriptionInput } from '@/components/bill/ProductDescriptionInput';
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
  TextField,
} from '@/ui';
import { DcNoField } from './LotForms';
import { formatDcNo, lotTotals, returnableQty } from './lotLogic';
import { addLotReturn, deleteLotReturn } from './processingService';

const kg = (n) => `${Math.round(toNum(n) * 1000) / 1000} kg`;
const rupees = (n) => `₹${formatCurrency(n)}`;
const errorText = (e) => (e instanceof Error ? e.message.replace(/^[^:]+:\s*/, '') : 'Could not save.');

export function AddReturnModal({ open, onClose, lot, shortcuts, stockMap, onSaved, toast }) {
  const formId = useId();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef(null);
  // a long form: bring a new error into view
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [error]);
  useEffect(() => {
    if (!open || !lot) return;
    setError('');
    // a lot at combing usually comes back from the combing unit
    const from = lot.dyeing && returnableQty(lot, 'combing') > 0 ? 'combing' : 'dyeing';
    setForm({
      from,
      date: todayISO(),
      dcNo: '',
      rolls: '',
      qty: '',
      description: from === 'dyeing' ? (lot.grey?.description ?? '') : '',
      notes: '',
    });
    // reset only when the form opens or another lot is picked: a background reload (new lot objects) must not wipe
    // what is being typed
  }, [open, lot?.id]);
  if (!lot) return null;
  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const pickFrom = (from) =>
    patch({ from, description: from === 'dyeing' ? (lot.grey?.description ?? '') : form.description });
  const limit = form.from ? returnableQty(lot, form.from) : 0;
  const unit = form.from === 'combing' ? lot.combingUnit?.name : lot.dyer?.name;

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      const updated = await addLotReturn(lot, form);
      toast('Return saved', `${kg(form.qty)} back into stock as ${form.description}`, 'success');
      onSaved(updated);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      title={`Add return — lot ${formatDcNo(lot.dcNo)}`}
      footer={
        <>
          <Button variant="neutral" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="warning" loading={saving} icon={RotateCcw}>
            Save return
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        {error ? (
          <p
            ref={errorRef}
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
          >
            {error}
          </p>
        ) : null}
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold tracking-wide text-slate-600">
            Returned by
          </span>
          <ChoiceChips
            value={form.from}
            onChange={pickFrom}
            options={[
              { value: 'dyeing', label: `Dyeing unit${lot.dyer?.name ? ` · ${lot.dyer.name}` : ''}` },
              ...(lot.dyeing
                ? [
                    {
                      value: 'combing',
                      label: `Combing unit${lot.combingUnit?.name ? ` · ${lot.combingUnit.name}` : ''}`,
                    },
                  ]
                : []),
            ]}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            {unit ?? 'The unit'} can return up to {kg(limit)} it has not passed on.
          </p>
        </div>
        <Grid cols={{ base: 1, sm: 2 }}>
          <DateField label="Return date" value={form.date ?? ''} onChange={(date) => patch({ date })} />
          <DcNoField
            label="Their DC No (optional)"
            value={form.dcNo ?? ''}
            onChange={(dcNo) => patch({ dcNo })}
          />
        </Grid>
        <Grid cols={{ base: 1, sm: 2 }}>
          <NumberField
            label="Rolls"
            inputMode="numeric"
            value={form.rolls ?? ''}
            onChange={(rolls) => patch({ rolls })}
          />
          <NumberField
            label="Quantity returned (kg)"
            value={form.qty ?? ''}
            onChange={(qty) => patch({ qty })}
          />
        </Grid>
        <div className="min-w-0">
          <span className="mb-1.5 block text-[13px] font-semibold tracking-wide text-slate-600">
            Goes back into stock as
          </span>
          <ProductDescriptionInput
            label="Goes back into stock as"
            value={form.description ?? ''}
            onChange={(description) => patch({ description })}
            shortcuts={shortcuts}
            stockMap={stockMap}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            {form.from === 'combing' ? 'The dyed fabric’s product name' : 'Unprocessed grey fabric'}
          </p>
        </div>
        <TextField
          label="Reason / note (optional)"
          value={form.notes ?? ''}
          onChange={(notes) => patch({ notes })}
        />
      </form>
    </Modal>
  );
}

export function ReturnHistoryModal({ open, onClose, lot, onChanged, confirm, toast }) {
  // one delete at a time: a second one started meanwhile would work on the lot from before the first
  const [busy, setBusy] = useState(false);
  if (!lot) return null;
  const t = lotTotals(lot);
  const returns = [...(lot.returns ?? [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const remove = async (r) => {
    const ok = await confirm({
      title: 'Delete return',
      message: `Delete the return of ${kg(r.qty)} (${formatDateIN(r.date)})? That fabric leaves stock again and the unit is charged for it.`,
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    setBusy(true);
    try {
      onChanged(await deleteLotReturn(lot, r.id));
    } catch (err) {
      toast('Cannot delete', errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Return history — lot ${formatDcNo(lot.dcNo)}`}
      footer={
        <Button variant="neutral" onClick={onClose}>
          Close
        </Button>
      }
    >
      {returns.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title="No returns"
          message="Fabric sent back unprocessed by a unit appears here."
        />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            Returned: {kg(t.dyeingReturnedQty)} by the dyeing unit
            {lot.dyeing ? `, ${kg(t.combingReturnedQty)} by the combing unit` : ''} · back in stock worth{' '}
            {rupees(t.returnedValue)}
          </p>
          <ul className="divide-y divide-slate-200 rounded-xl ring-1 ring-slate-300">
            {returns.map((r) => {
              const detail = [
                formatDateIN(r.date),
                r.from === 'combing'
                  ? (lot.combingUnit?.name ?? 'Combing unit')
                  : (lot.dyer?.name ?? 'Dyeing unit'),
                r.dcNo ? formatDcNo(r.dcNo) : '',
                r.description,
                r.notes,
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-brand-800 tabular-nums">
                      {kg(r.qty)}
                      {r.rolls ? ` · ${r.rolls} rolls` : ''}
                    </div>
                    <div className="truncate text-xs text-slate-500" title={detail}>
                      {detail}
                    </div>
                  </div>
                  <IconButton
                    icon={Trash2}
                    variant="outlineDanger"
                    label="Delete return"
                    disabled={busy}
                    onClick={() => remove(r)}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}
