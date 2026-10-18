/**
 * The three stage forms of a processing lot:
 *  - IssueModal    my DC: grey fabric out of stock to the dyeing unit (also used to correct it later)
 *  - DyedModal     the dyeing unit's DC: dyed fabric sent on to the combing unit
 *  - ReceiveModal  the combing unit's DC: processed fabric received back -> into stock
 * Each form shows the weight loss / cost it implies while typing, so mistakes are visible before saving.
 */
import { Link } from 'react-router';
import { useEffect, useId, useMemo, useState } from 'react';
import { ProductDescriptionInput } from '@/components/bill/ProductDescriptionInput';
import { formatCurrency, todayISO, toNum } from '@/core/format';
import { Button, DateField, Grid, Modal, NumberField, SelectField, TextField, cn } from '@/ui';
import {
  LOT_STATUS,
  dcNumberPart,
  emptyLot,
  formatDcNo,
  lotTotals,
  stageCharge,
  suggestNextDcNo,
  unitName,
} from './lotLogic';
import { availableGrey, availableGreyRolls, saveDyed, saveIssue, saveReceived } from './processingService';

const rupees = (n) => `₹${formatCurrency(n)}`;
const kg = (n) => `${Math.round(toNum(n) * 1000) / 1000} kg`;
const unitOptions = (units, placeholder) => [
  { value: '', label: placeholder },
  ...units
    .map((u) => ({ value: u.id, label: unitName(u) || u.phone || 'Unnamed' }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];

/** Field label + the shared product autocomplete (it only carries an aria-label of its own). */
function ProductField({ label, hint, error, ...props }) {
  return (
    <div className="min-w-0">
      <span className="mb-1.5 block text-[13px] font-semibold tracking-wide text-slate-600">{label}</span>
      <ProductDescriptionInput label={label} {...props} />
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

const DcPrefix = () => (
  <span
    aria-hidden
    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[13px] font-semibold text-slate-500"
  >
    DC-
  </span>
);

/** A DC number box with a fixed "DC-" in front (my DC and the units' DCs alike): only the number is typed. */
export function DcNoField({ label, value, onChange, hint }) {
  return (
    <TextField
      label={label}
      leftIcon={DcPrefix}
      value={dcNumberPart(value)}
      onChange={(v) => onChange(formatDcNo(v))}
      hint={hint}
      autoComplete="off"
    />
  );
}

/** A charge that follows rate × kg until the user types an amount of their own. */
function ChargeField({ label, rate, qty, value, onChange }) {
  const auto = stageCharge(rate, qty);
  const typed = value !== '' && value !== undefined && value !== null;
  return (
    <NumberField
      label={label}
      value={typed ? String(value) : auto ? String(auto) : ''}
      onChange={(v) => onChange(v === String(auto) ? '' : v)}
      hint={typed ? 'Adjusted by hand' : `Rate × kg = ${rupees(auto)}`}
    />
  );
}

function Summary({ rows }) {
  return (
    <dl className="grid gap-1.5 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-line">
      {rows.map(([label, value, tone]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="min-w-0 text-slate-600">{label}</dt>
          <dd
            className={cn(
              'min-w-0 text-right wrap-anywhere',
              tone ?? 'font-semibold text-brand-800 tabular-nums',
            )}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FormModal({ open, onClose, title, formId, saving, submitLabel, error, children }) {
  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissable={!saving}
      size="lg"
      title={title}
      footer={
        <>
          <Button variant="neutral" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="success" loading={saving}>
            {submitLabel}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      ) : null}
      {children}
    </Modal>
  );
}

/** A hand-typed charge as the form text ('' = follow rate × kg). */
const typedText = (v) => (v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : '');

const messageOf = (e) =>
  e instanceof Error ? e.message.replace(/^[^:]+:\s*/, '') : 'Could not save. Please try again.';

// ------------------------------------------------------------------ 1. Issue (my DC)
export function IssueModal({ open, onClose, data, existing = null, onSaved, confirm }) {
  const formId = useId();
  const [form, setForm] = useState(() => emptyLot(todayISO()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(
      existing
        ? {
            dcNo: existing.dcNo ?? '',
            dcDate: existing.dcDate ?? todayISO(),
            greyDescription: existing.grey?.description ?? '',
            greyRolls: String(existing.grey?.rolls ?? ''),
            greyQty: String(existing.grey?.qty ?? ''),
            finishedDescription: existing.finishedDescription ?? '',
            dyerId: existing.dyer?.id ?? '',
            dyeingRate: existing.dyeingRate ? String(existing.dyeingRate) : '',
            dyeingCharge: typedText(existing.dyeingChargeTyped),
            // not on this form any more (the combing unit is chosen on the dyeing unit's DC); an older lot keeps its own
            combingUnitId: existing.combingUnit?.id ?? '',
            combingRate: existing.combingRate ? String(existing.combingRate) : '',
            notes: existing.notes ?? '',
          }
        : { ...emptyLot(todayISO()), dcNo: suggestNextDcNo(data.lots), dyeingCharge: '' },
    );
    // reset only when the form opens or another lot is picked: a background reload (new lot objects) must not wipe
    // what is being typed
  }, [open, existing?.id]);
  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const available = useMemo(
    () => (form.greyDescription ? availableGrey(data.stockMap, form.greyDescription, existing) : null),
    [data.stockMap, form.greyDescription, existing],
  );
  const availableRolls = useMemo(
    () => (form.greyDescription ? availableGreyRolls(data.stockMap, form.greyDescription, existing) : null),
    [data.stockMap, form.greyDescription, existing],
  );

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const shortKg = available !== null && toNum(form.greyQty) > available;
    const shortRolls = availableRolls !== null && toNum(form.greyRolls) > availableRolls;
    if (shortKg || shortRolls) {
      const inStock = `${kg(available ?? 0)}${availableRolls !== null ? ` / ${availableRolls} rolls` : ''}`;
      const ok = await confirm({
        title: 'More than in stock',
        message: `Only ${inStock} of ${form.greyDescription} is in stock. Send ${kg(form.greyQty)} / ${toNum(form.greyRolls)} rolls anyway? Stock will go negative.`,
        tone: 'warning',
        confirmText: 'Send anyway',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const lot = await saveIssue(form, {
        dyers: data.dyers,
        combingUnits: data.combingUnits,
        stockMap: data.stockMap,
        catalogue: data.shortcuts,
        existing,
      });
      onSaved(lot, { isNew: !existing });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={existing ? `Edit my DC — ${formatDcNo(existing.dcNo)}` : 'New lot — my DC to the dyeing unit'}
      formId={formId}
      saving={saving}
      submitLabel={existing ? 'Save changes' : 'Save & print DC'}
      error={error}
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <Grid cols={{ base: 1, sm: 2 }}>
          <DcNoField label="My DC No" value={form.dcNo} onChange={(dcNo) => patch({ dcNo })} />
          <DateField label="DC Date" value={form.dcDate} onChange={(dcDate) => patch({ dcDate })} />
        </Grid>
        <ProductField
          label="Grey fabric sent"
          value={form.greyDescription}
          onChange={(greyDescription) => patch({ greyDescription })}
          shortcuts={data.shortcuts}
          stockMap={data.stockMap}
          hint={
            available !== null
              ? `In stock: ${kg(available)}${availableRolls !== null ? ` · ${availableRolls} rolls` : ''}`
              : 'Pick the grey fabric from the list'
          }
        />
        <Grid cols={{ base: 1, sm: 2 }}>
          <NumberField
            label="Rolls"
            inputMode="numeric"
            value={form.greyRolls}
            onChange={(greyRolls) => patch({ greyRolls })}
          />
          <NumberField
            label="Quantity (kg)"
            value={form.greyQty}
            onChange={(greyQty) => patch({ greyQty })}
          />
        </Grid>
        <ProductField
          label="Finished product (after dyeing & combing)"
          value={form.finishedDescription}
          onChange={(finishedDescription) => patch({ finishedDescription })}
          shortcuts={data.shortcuts}
          hint="The name it will have in stock when it comes back"
        />
        <Grid cols={{ base: 1, sm: 3 }}>
          <SelectField
            label="Dyeing unit"
            value={form.dyerId}
            onChange={(dyerId) => patch({ dyerId })}
            options={unitOptions(data.dyers, 'Select dyeing unit')}
          />
          <NumberField
            label="Dyeing rate (₹/kg)"
            value={form.dyeingRate}
            onChange={(dyeingRate) => patch({ dyeingRate })}
          />
          <ChargeField
            label="Dyeing charge (₹)"
            rate={form.dyeingRate}
            qty={toNum(form.greyQty) - (existing ? lotTotals(existing).dyeingReturnedQty : 0)}
            value={form.dyeingCharge}
            onChange={(dyeingCharge) => patch({ dyeingCharge })}
          />
        </Grid>
        {data.dyers.length === 0 ? (
          <p className="text-xs text-slate-500">
            No dyeing units yet —{' '}
            <Link to="/processing/dyeing-units" className="font-semibold text-brand-700 underline">
              add one
            </Link>
            .
          </p>
        ) : null}
      </form>
    </FormModal>
  );
}

// ------------------------------------------------------------------ 2. Dyed (dyeing unit's DC)
export function DyedModal({ open, onClose, lot, data, onSaved }) {
  const formId = useId();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !lot) return;
    setError('');
    const d = lot.dyeing;
    setForm({
      dcNo: d?.dcNo ?? '',
      date: d?.date ?? todayISO(),
      rolls: d ? String(d.rolls ?? '') : String(lot.grey?.rolls ?? ''),
      qty: d ? String(d.qty ?? '') : '',
      combingUnitId: lot.combingUnit?.id ?? '',
      combingRate: lot.combingRate ? String(lot.combingRate) : '',
      combingCharge: d ? typedText(lot.combingChargeTyped) : '',
    });
    // reset only when the form opens or another lot is picked: a background reload (new lot objects) must not wipe
    // what is being typed
  }, [open, lot?.id]);
  if (!lot) return null;
  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const greyQty = toNum(lot.grey?.qty);
  const loss = toNum(form.qty) > 0 ? greyQty - toNum(form.qty) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      onSaved(await saveDyed(lot, form, { combingUnits: data.combingUnits }));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Dyeing unit's DC — lot ${formatDcNo(lot.dcNo)}`}
      formId={formId}
      saving={saving}
      submitLabel={lot.dyeing ? 'Save changes' : 'Sent to combing'}
      error={error}
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <Summary
          rows={[
            ['Dyeing unit', lot.dyer?.name ?? '—'],
            ['Grey sent on my DC', `${kg(greyQty)} · ${toNum(lot.grey?.rolls)} rolls`],
          ]}
        />
        <Grid cols={{ base: 1, sm: 2 }}>
          <DcNoField
            label="Dyeing unit's DC No"
            value={form.dcNo ?? ''}
            onChange={(dcNo) => patch({ dcNo })}
          />
          <DateField label="DC Date" value={form.date ?? ''} onChange={(date) => patch({ date })} />
        </Grid>
        <Grid cols={{ base: 1, sm: 2 }}>
          <NumberField
            label="Rolls"
            inputMode="numeric"
            value={form.rolls ?? ''}
            onChange={(rolls) => patch({ rolls })}
          />
          <NumberField
            label="Dyed quantity sent (kg)"
            value={form.qty ?? ''}
            onChange={(qty) => patch({ qty })}
          />
        </Grid>
        <Grid cols={{ base: 1, sm: 3 }}>
          <SelectField
            label="Sent to combing unit"
            value={form.combingUnitId ?? ''}
            onChange={(combingUnitId) => patch({ combingUnitId })}
            options={unitOptions(data.combingUnits, 'Select combing unit')}
          />
          <NumberField
            label="Combing rate (₹/kg)"
            value={form.combingRate ?? ''}
            onChange={(combingRate) => patch({ combingRate })}
          />
          <ChargeField
            label="Combing charge (₹)"
            rate={form.combingRate}
            qty={toNum(form.qty) - lotTotals(lot).combingReturnedQty}
            value={form.combingCharge}
            onChange={(combingCharge) => patch({ combingCharge })}
          />
        </Grid>
        {data.combingUnits.length === 0 ? (
          <p className="text-xs text-slate-500">
            No combing units yet —{' '}
            <Link to="/processing/combing-units" className="font-semibold text-brand-700 underline">
              add one
            </Link>
            .
          </p>
        ) : null}
        {loss !== null ? (
          <Summary
            rows={[
              [
                'Weight loss at dyeing',
                `${kg(loss)} (${greyQty > 0 ? Math.round((loss / greyQty) * 10000) / 100 : 0}%)`,
                loss < 0 ? 'font-semibold text-red-600' : undefined,
              ],
            ]}
          />
        ) : null}
      </form>
    </FormModal>
  );
}

// ------------------------------------------------------------------ 3. Received (combing unit's DC)
export function ReceiveModal({ open, onClose, lot, data, onSaved }) {
  const formId = useId();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !lot) return;
    setError('');
    const r = lot.received;
    setForm({
      dcNo: r?.dcNo ?? '',
      date: r?.date ?? todayISO(),
      rolls: r ? String(r.rolls ?? '') : String(lot.dyeing?.rolls ?? ''),
      qty: r ? String(r.qty ?? '') : '',
      finishedDescription: lot.finishedDescription ?? '',
    });
    // reset only when the form opens or another lot is picked: a background reload (new lot objects) must not wipe
    // what is being typed
  }, [open, lot?.id]);
  const preview = useMemo(
    () =>
      lot && toNum(form.qty) > 0
        ? lotTotals({
            ...lot,
            status: LOT_STATUS.RECEIVED,
            received: { qty: toNum(form.qty), rolls: toNum(form.rolls) },
          })
        : null,
    [lot, form.qty, form.rolls],
  );
  if (!lot) return null;
  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try {
      onSaved(await saveReceived(lot, form));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Receive processed fabric — lot ${formatDcNo(lot.dcNo)}`}
      formId={formId}
      saving={saving}
      submitLabel={lot.received ? 'Save changes' : 'Receive & add to stock'}
      error={error}
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <Summary
          rows={[
            ['My DC', `${formatDcNo(lot.dcNo)} · ${kg(lot.grey?.qty)} grey`],
            ["Dyeing unit's DC", `${formatDcNo(lot.dyeing?.dcNo)} · ${kg(lot.dyeing?.qty)} sent to combing`],
            ['Combing unit', lot.combingUnit?.name ?? '—'],
          ]}
        />
        <Grid cols={{ base: 1, sm: 2 }}>
          <DcNoField
            label="Combing unit's DC No"
            value={form.dcNo ?? ''}
            onChange={(dcNo) => patch({ dcNo })}
          />
          <DateField label="Received on" value={form.date ?? ''} onChange={(date) => patch({ date })} />
        </Grid>
        <Grid cols={{ base: 1, sm: 2 }}>
          <NumberField
            label="Final rolls"
            inputMode="numeric"
            value={form.rolls ?? ''}
            onChange={(rolls) => patch({ rolls })}
          />
          <NumberField
            label="Final quantity (kg)"
            value={form.qty ?? ''}
            onChange={(qty) => patch({ qty })}
          />
        </Grid>
        <ProductField
          label="Finished product (goes into stock as)"
          value={form.finishedDescription ?? ''}
          onChange={(finishedDescription) => patch({ finishedDescription })}
          shortcuts={data.shortcuts}
        />
        {preview ? (
          <Summary
            rows={[
              ['Loss at dyeing', `${kg(preview.dyeingLossQty)} (${preview.dyeingLossPct}%)`],
              ['Loss at combing', `${kg(preview.combingLossQty)} (${preview.combingLossPct}%)`],
              [
                'Total weight loss',
                `${kg(preview.totalLossQty)} (${preview.totalLossPct}%)`,
                'font-bold text-red-700 tabular-nums',
              ],
              ['Grey value + dyeing + combing', rupees(preview.totalCost)],
              [
                'Cost per kg of finished fabric',
                rupees(preview.unitCost),
                'font-bold text-emerald-700 tabular-nums',
              ],
            ]}
          />
        ) : null}
      </form>
    </FormModal>
  );
}
