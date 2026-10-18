/**
 * Dyeing units / Combing units directory (one screen, two lists): contact details and what I owe each unit — charges
 * minus payments over the processing lots plus the old (archived) batches.
 */
import { Factory, Pencil, Phone, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { db } from '@/core/db';
import { formatCurrency, formatDateIN, toNum } from '@/core/format';
import { calcProcessorBalanceSummary, validateProcessor } from '@/features/combing/combingLogic';
import { deleteProcessorRecord, saveProcessorRecord } from '@/features/combing/combingService';
import { calcDyerBalanceSummary, validateDyer } from '@/features/dyeing/dyeingLogic';
import { deleteDyerRecord, saveDyerRecord } from '@/features/dyeing/dyeingService';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Grid,
  IconButton,
  LoadingState,
  Modal,
  Page,
  RefreshButton,
  SearchBar,
  TextArea,
  TextField,
  cn,
  useFeedback,
} from '@/ui';
import {
  LOT_STATUS,
  lotTotals,
  sortLotsNewestFirst,
  unitLotAccount,
  unitLotStatus,
  unitName,
  formatDcNo,
} from './lotLogic';

const rupees = (n) => `₹${formatCurrency(n)}`;
const kg = (n) => `${Math.round(toNum(n) * 1000) / 1000} kg`;

const KINDS = {
  dyeing: {
    title: 'Dyeing Units',
    singular: 'dyeing unit',
    icon: Factory,
    nameKey: 'dyeingName',
    loadUnits: () => db.getAllDyers(),
    loadOld: () => db.getAllDyeingBatches().catch(() => []),
    oldBalance: (batches, name) => calcDyerBalanceSummary(batches, name),
    validate: validateDyer,
    save: saveDyerRecord,
    remove: deleteDyerRecord,
  },
  combing: {
    title: 'Combing Units',
    singular: 'combing unit',
    icon: Sparkles,
    nameKey: 'processorName',
    loadUnits: () => db.getAllProcessors(),
    loadOld: () => db.getAllCombingBatches().catch(() => []),
    oldBalance: (batches, name) => calcProcessorBalanceSummary(batches, name),
    validate: validateProcessor,
    save: saveProcessorRecord,
    remove: deleteProcessorRecord,
  },
};

function UnitForm({ open, onClose, kind, unit, onSaved }) {
  const cfg = KINDS[kind];
  const formId = useId();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    setError('');
    setForm({
      name: unit ? unitName(unit) : '',
      ownerName: unit?.ownerName ?? '',
      phone: unit?.phone ?? '',
      address: unit?.address ?? '',
    });
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }
  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const submit = async (e) => {
    e.preventDefault();
    const record = {
      ...(unit ?? {}),
      [cfg.nameKey]: form.name ?? '',
      ownerName: form.ownerName ?? '',
      phone: form.phone ?? '',
      address: form.address ?? '',
    };
    const problem = cfg.validate(record);
    if (problem) {
      setError(problem.message);
      return;
    }
    setSaving(true);
    try {
      await cfg.save(record);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^[^:]+:\s*/, '') : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={unit ? `Edit ${cfg.singular}` : `Add ${cfg.singular}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3.5" noValidate>
        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700"
          >
            {error}
          </p>
        ) : null}
        <TextField label="Unit name" value={form.name ?? ''} onChange={(name) => patch({ name })} autoFocus />
        <Grid cols={{ base: 1, sm: 2 }}>
          <TextField
            label="Owner / contact"
            value={form.ownerName ?? ''}
            onChange={(ownerName) => patch({ ownerName })}
          />
          <TextField
            label="Phone"
            inputMode="tel"
            value={form.phone ?? ''}
            onChange={(phone) => patch({ phone })}
          />
        </Grid>
        <TextArea
          label="Address"
          rows={2}
          value={form.address ?? ''}
          onChange={(address) => patch({ address })}
        />
      </form>
    </Modal>
  );
}

/**
 * The unit's orders (lots), each on its own row with ONLY this unit's part of the work: a dyeing unit sees what it
 * got on my DC and what it sent on; a combing unit sees what it got from the dyer and what came back. Lots at the unit
 * now — or still owed for — come first; finished and settled ones are shown on request.
 */
function UnitOrders({ kind, lots, oldBatches }) {
  const [showDone, setShowDone] = useState(false);
  const withStatus = lots.map((lot) => ({ lot, st: unitLotStatus(lot, kind), t: lotTotals(lot) }));
  const dueHere = (t) => (kind === 'dyeing' ? t.dyeingDue : t.combingDue) > 0;
  const current = withStatus.filter(
    (x) => x.st.active || x.lot.status === LOT_STATUS.AT_DYEING || dueHere(x.t),
  );
  const done = withStatus.filter((x) => !current.includes(x));
  const shown = showDone ? [...current, ...done] : current;
  if (!lots.length) {
    return (
      <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        No lots yet
        {oldBatches ? ` · ${oldBatches} old batch${oldBatches === 1 ? '' : 'es'} in Old Batches` : ''}.
      </p>
    );
  }
  const link = (lot) =>
    lot.status === LOT_STATUS.RECEIVED
      ? `/processing/completed?search=${encodeURIComponent(formatDcNo(lot.dcNo))}`
      : `/processing/lots?search=${encodeURIComponent(formatDcNo(lot.dcNo))}&stage=${lot.status === LOT_STATUS.AT_COMBING ? 'combing' : 'dyeing'}`;
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      {shown.length === 0 ? (
        <p className="text-xs text-slate-500">
          No lot at this unit right now — {done.length === 1 ? 'its lot is' : `all ${done.length} lots are`}{' '}
          finished and settled.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                <th className="py-1.5 pr-3">Lot / DC</th>
                {kind === 'dyeing' ? (
                  <>
                    <th className="py-1.5 pr-3">Received (my DC)</th>
                    <th className="py-1.5 pr-3">Sent to combing (its DC)</th>
                    <th className="py-1.5 pr-3">Dyeing loss</th>
                  </>
                ) : (
                  <>
                    <th className="py-1.5 pr-3">Received from dyer (dyer DC)</th>
                    <th className="py-1.5 pr-3">Delivered back (its DC)</th>
                    <th className="py-1.5 pr-3">Combing loss</th>
                  </>
                )}
                <th className="py-1.5 pr-3 text-right">Charge / due</th>
                <th className="py-1.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(({ lot, st, t }) => {
                const charge = kind === 'dyeing' ? t.dyeingCharge : t.combingCharge;
                const due = kind === 'dyeing' ? t.dyeingDue : t.combingDue;
                return (
                  <tr key={lot.id} className="align-top">
                    <td className="py-2 pr-3">
                      <Link
                        to={link(lot)}
                        className="font-mono font-bold text-brand-700 underline-offset-2 hover:underline"
                      >
                        {formatDcNo(lot.dcNo)}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {kind === 'dyeing' ? lot.grey?.description : lot.finishedDescription}
                      </div>
                    </td>
                    {kind === 'dyeing' ? (
                      <>
                        <td className="py-2 pr-3 tabular-nums">
                          {toNum(lot.grey?.rolls)} rolls · {kg(lot.grey?.qty)}
                          <div className="text-xs text-slate-500">{formatDateIN(lot.dcDate)}</div>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {lot.dyeing ? (
                            <>
                              {toNum(lot.dyeing.rolls)} rolls · {kg(lot.dyeing.qty)}
                              <div className="text-xs text-slate-500">
                                {formatDcNo(lot.dyeing.dcNo)} · {formatDateIN(lot.dyeing.date)}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {lot.dyeing ? `${kg(t.dyeingLossQty)} (${t.dyeingLossPct}%)` : '—'}
                          {t.dyeingReturnedQty > 0 ? (
                            <div className="text-xs text-slate-500">returned {kg(t.dyeingReturnedQty)}</div>
                          ) : null}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-3 tabular-nums">
                          {lot.dyeing ? (
                            <>
                              {toNum(lot.dyeing.rolls)} rolls · {kg(lot.dyeing.qty)}
                              <div className="text-xs text-slate-500">
                                {lot.dyer?.name} {formatDcNo(lot.dyeing.dcNo)} ·{' '}
                                {formatDateIN(lot.dyeing.date)}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">Still at {lot.dyer?.name ?? 'the dyer'}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {lot.received ? (
                            <>
                              {toNum(lot.received.rolls)} rolls · {kg(lot.received.qty)}
                              <div className="text-xs text-slate-500">
                                {formatDcNo(lot.received.dcNo)} · {formatDateIN(lot.received.date)}
                              </div>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {lot.received ? `${kg(t.combingLossQty)} (${t.combingLossPct}%)` : '—'}
                          {t.combingReturnedQty > 0 ? (
                            <div className="text-xs text-slate-500">returned {kg(t.combingReturnedQty)}</div>
                          ) : null}
                        </td>
                      </>
                    )}
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {rupees(charge)}
                      <div
                        className={cn('text-xs font-semibold', due > 0 ? 'text-red-600' : 'text-emerald-700')}
                      >
                        {due > 0 ? `Due ${rupees(due)}` : 'Settled'}
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {done.length ? (
        <button
          type="button"
          onClick={() => setShowDone((v) => !v)}
          className="mt-2 min-h-9 text-xs font-semibold text-brand-700 hover:underline"
        >
          {showDone
            ? 'Hide finished lots'
            : `Show ${done.length} finished lot${done.length === 1 ? '' : 's'}`}
        </button>
      ) : null}
      {oldBatches ? (
        <p className="mt-1 text-xs text-slate-500">
          + {oldBatches} old batch{oldBatches === 1 ? '' : 'es'} (see Old Batches)
        </p>
      ) : null}
    </div>
  );
}

/**
 * Both lists are this one component on two routes: keyed by kind so moving between them starts fresh (otherwise React
 * kept the dyeing units on the Combing Units page and matched them against the combing lots).
 */
export default function UnitsPage({ kind }) {
  return <UnitsScreen key={kind} kind={kind} />;
}

function UnitsScreen({ kind }) {
  const cfg = KINDS[kind];
  const { toast, confirm } = useFeedback();
  const [state, setState] = useState({ units: [], lots: [], old: [] });
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null | { unit }
  const load = useCallback(async () => {
    const [units, lots, old] = await Promise.all([cfg.loadUnits(), db.getAllProcessingLots(), cfg.loadOld()]);
    setState({ units: units || [], lots: lots || [], old: old || [] });
  }, [cfg]);
  const { loading, error, refreshing, refresh, reload } = useFocusLoad(load);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.units
      .map((u) => {
        const fromLots = unitLotAccount(state.lots, u.id, kind);
        // (the old helpers return EVERY batch for an empty name)
        const fromOld = unitName(u)
          ? cfg.oldBalance(state.old, unitName(u))
          : { batchCount: 0, balanceDue: 0 };
        const lotList = sortLotsNewestFirst(fromLots.lots);
        return {
          unit: u,
          name: unitName(u),
          lots: fromLots.lots.length,
          lotList,
          active: lotList.filter((l) => unitLotStatus(l, kind).active).length,
          oldBatches: fromOld.batchCount ?? 0,
          due: Math.round((fromLots.due + (fromOld.balanceDue ?? 0)) * 100) / 100,
        };
      })
      .filter(
        (r) =>
          !q ||
          [r.name, r.unit.ownerName, r.unit.phone, r.unit.address].some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(q),
          ),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [state, query, kind, cfg]);

  const remove = async (row) => {
    if (row.lots > 0) {
      toast('Cannot delete', `${row.name} has ${row.lots} lot(s). Delete those lots first.`, 'warning');
      return;
    }
    const ok = await confirm({
      title: `Delete ${cfg.singular}`,
      message: `Delete ${row.name} from the list?`,
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await cfg.remove(row.unit.id);
      void reload();
    } catch {
      toast('Error', 'Could not delete.', 'error');
    }
  };

  const Icon = cfg.icon;
  return (
    <Page
      title={cfg.title}
      icon={Icon}
      max="5xl"
      actions={
        <>
          <RefreshButton onClick={refresh} loading={refreshing} />
          <Button icon={Plus} onClick={() => setEditing({ unit: null })}>
            <span className="max-sm:sr-only">Add unit</span>
          </Button>
        </>
      }
    >
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <div className="space-y-4">
          <SearchBar value={query} onChange={setQuery} placeholder="Search name, phone or address…" />
          {rows.length === 0 ? (
            <EmptyState
              icon={Icon}
              title={query ? 'No unit matches the search' : `No ${cfg.singular}s yet`}
              message={`Add the ${cfg.singular}s you send fabric to; they are picked on the lot forms.`}
              action={
                query ? null : (
                  <Button icon={Plus} onClick={() => setEditing({ unit: null })}>
                    Add {cfg.singular}
                  </Button>
                )
              }
            />
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <Card key={r.unit.id} className="p-3.5 sm:p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-brand-800">{r.name}</span>
                        {r.active ? (
                          <Badge tone={kind === 'dyeing' ? 'info' : 'warning'}>
                            {r.active} lot{r.active === 1 ? '' : 's'}{' '}
                            {kind === 'dyeing' ? 'in dyeing' : 'in combing'}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {[r.unit.ownerName, r.unit.address].filter(Boolean).join(' · ') || '—'}
                      </div>
                      {r.unit.phone ? (
                        <a
                          href={`tel:${r.unit.phone}`}
                          className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-brand-700"
                        >
                          <Phone className="size-4" aria-hidden />
                          {r.unit.phone}
                        </a>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase">Due</div>
                      <div
                        className={cn(
                          'font-display font-extrabold tabular-nums',
                          r.due > 0 ? 'text-red-600' : 'text-emerald-700',
                        )}
                      >
                        {rupees(r.due)}
                      </div>
                      <div className="mt-1 flex justify-end gap-1">
                        <IconButton
                          icon={Pencil}
                          label={`Edit ${r.name}`}
                          onClick={() => setEditing({ unit: r.unit })}
                        />
                        <IconButton icon={Trash2} label={`Delete ${r.name}`} onClick={() => remove(r)} />
                      </div>
                    </div>
                  </div>
                  <UnitOrders kind={kind} lots={r.lotList} oldBatches={r.oldBatches} />
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      <UnitForm
        open={!!editing}
        onClose={() => setEditing(null)}
        kind={kind}
        unit={editing?.unit ?? null}
        onSaved={() => {
          setEditing(null);
          toast('Saved', undefined, 'success');
          void reload();
        }}
      />
    </Page>
  );
}
