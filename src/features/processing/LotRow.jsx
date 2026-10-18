/**
 * One processing lot as a full-width row (RecordRow: header strip with the DC, status and every action; then labelled
 * detail cells drawn like the app's bordered tables). The details depend on the STAGE being looked at, so each process
 * shows only its own information:
 *  - 'dyeing'    at the dyeing unit: my DC, what was sent (rolls / kg), what it becomes, the dyeing charge
 *  - 'combing'   at the combing unit: the dyeing unit's DC, what the combing unit received, dyeing loss, combing charge
 *  - 'completed' received back: the three DCs, rolls / kg at each step, weight loss, cost per kg
 */
import {
  CheckCircle2,
  History,
  ListRestart,
  Pencil,
  Printer,
  RotateCcw,
  Trash2,
  Truck,
  Undo2,
  Wallet,
} from 'lucide-react';
import { formatCurrency, formatDateIN, todayISO, toNum } from '@/core/format';
import { Badge, Button, cn } from '@/ui';
import { LOT_STATUS, formatDcNo, lotTotals } from './lotLogic';

const rupees = (n) => `₹${formatCurrency(n)}`;
const kg = (n) => `${Math.round(toNum(n) * 1000) / 1000} kg`;
const rollsKg = (rolls, qty) => `${toNum(rolls)} rolls · ${kg(qty)}`;

/** Whole days from an ISO date to today (0 when unknown). */
export function daysSince(iso, today = todayISO()) {
  const a = Date.parse(String(iso ?? '').slice(0, 10));
  const b = Date.parse(today);
  return Number.isNaN(a) || Number.isNaN(b) ? 0 : Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * A record as a full-width row, shared by the lots and the Old Batches archive: a header strip (the DC / batch number
 * chip and status badges on the left, the action buttons on the right; on phones the buttons share each line evenly),
 * then labelled detail cells laid out like the app's bordered tables (`.erp-table`): every cell outlined, a small-caps
 * header band per cell, text that wraps instead of clipping. One column of cells on phones, two on tablets, four on
 * desktop. `footer` = an optional line under the cells.
 */
export function RecordRow({ code, meta, actions, children, footer }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-card">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-slate-300 px-3.5 py-3 sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded bg-slate-900 px-2.5 py-1 font-mono text-sm font-bold text-white">
            {code}
          </span>
          {meta}
        </div>
        <div className="flex flex-wrap gap-1.5 max-sm:w-full max-sm:*:flex-auto">{actions}</div>
      </header>
      <dl className="grid grid-cols-1 gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
      {footer ? (
        <p className="border-t border-slate-200 px-3.5 py-2 text-xs wrap-anywhere text-slate-500 sm:px-4">
          {footer}
        </p>
      ) : null}
    </article>
  );
}

/** One labelled cell of a RecordRow: small-caps label band, value, optional grey `sub` line. */
export function Cell({ label, children, sub, tone }) {
  return (
    <div className="flex min-w-0 flex-col bg-white">
      <dt className="border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-[0.6875rem] leading-4 font-bold tracking-[0.06em] text-slate-600 uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          'px-3 py-2.5 text-sm font-semibold wrap-anywhere tabular-nums',
          tone ?? 'text-slate-800',
        )}
      >
        {children}
        {sub ? <span className="mt-0.5 block text-xs font-normal text-slate-500">{sub}</span> : null}
      </dd>
    </div>
  );
}

function Due({ charge, paid, due }) {
  return (
    <span className="tabular-nums">
      {rupees(charge)}
      <span className="block text-xs font-normal text-slate-500">
        Paid {rupees(paid)} ·{' '}
        <b className={due > 0 ? 'text-red-600' : 'text-emerald-700'}>
          {due > 0 ? `Due ${rupees(due)}` : 'Settled'}
        </b>
      </span>
    </span>
  );
}

function DyeingDetails({ lot, t }) {
  const returned = t.dyeingReturnedQty > 0 ? `Returned ${kg(t.dyeingReturnedQty)}` : null;
  return (
    <>
      <Cell label="Dyeing unit" sub={lot.dyer?.phone || null}>
        {lot.dyer?.name ?? '—'}
      </Cell>
      <Cell label="Sent on my DC" sub={[lot.grey?.description, returned].filter(Boolean).join(' · ')}>
        {rollsKg(lot.grey?.rolls, lot.grey?.qty)}
      </Cell>
      <Cell
        label="To become"
        sub={lot.combingUnit ? `Then to ${lot.combingUnit.name}` : 'Combing unit: not chosen yet'}
      >
        {lot.finishedDescription}
      </Cell>
      <Cell label={`Dyeing charge${lot.dyeingRate ? ` @ ${rupees(lot.dyeingRate)}/kg` : ''}`}>
        <Due charge={t.dyeingCharge} paid={t.dyeingPaid} due={t.dyeingDue} />
      </Cell>
    </>
  );
}

function CombingDetails({ lot, t }) {
  const returned = t.combingReturnedQty > 0 ? `Returned ${kg(t.combingReturnedQty)}` : null;
  return (
    <>
      <Cell label="Combing unit" sub={lot.combingUnit?.phone || null}>
        {lot.combingUnit?.name ?? '—'}
      </Cell>
      <Cell
        label="Received from dyeing unit"
        sub={[
          `${lot.dyer?.name ?? 'Dyer'} ${formatDcNo(lot.dyeing?.dcNo) || 'DC —'} · ${formatDateIN(lot.dyeing?.date)}`,
          returned,
        ]
          .filter(Boolean)
          .join(' · ')}
      >
        {rollsKg(lot.dyeing?.rolls, lot.dyeing?.qty)}
      </Cell>
      <Cell label="Loss at dyeing" sub={`${lot.grey?.description} → ${lot.finishedDescription}`}>
        {kg(t.dyeingLossQty)} ({t.dyeingLossPct}%)
      </Cell>
      <Cell label={`Combing charge${lot.combingRate ? ` @ ${rupees(lot.combingRate)}/kg` : ''}`}>
        <Due charge={t.combingCharge} paid={t.combingPaid} due={t.combingDue} />
      </Cell>
    </>
  );
}

function CompletedDetails({ lot, t }) {
  const due = Math.max(0, t.dyeingDue) + Math.max(0, t.combingDue);
  return (
    <>
      <Cell
        label="Units"
        sub={`DCs: ${formatDcNo(lot.dcNo)} · ${formatDcNo(lot.dyeing?.dcNo) || '—'} · ${formatDcNo(lot.received?.dcNo) || '—'}`}
      >
        {lot.dyer?.name} → {lot.combingUnit?.name}
      </Cell>
      <Cell label="Sent → dyed → received" sub={`${lot.grey?.description} → ${lot.finishedDescription}`}>
        {toNum(lot.grey?.rolls)} → {toNum(lot.dyeing?.rolls)} → {toNum(lot.received?.rolls)} rolls
      </Cell>
      <Cell
        label="Weight loss"
        tone="text-red-700"
        sub={`${kg(t.greyQty)} → ${kg(t.dyedQty)} → ${kg(t.finalQty)} · dyeing ${t.dyeingLossPct}% · combing ${t.combingLossPct}%`}
      >
        {kg(t.totalLossQty)} ({t.totalLossPct}%)
      </Cell>
      <Cell
        label="Cost per kg"
        sub={`Total ${rupees(t.totalCost)} · ${due > 0 ? `due ${rupees(due)}` : 'units settled'}`}
      >
        {rupees(t.unitCost)}
      </Cell>
    </>
  );
}

/** Stage label; its colour comes from the app-wide status map (at dyeing / at combing = blue, received = green). */
const STATUS = {
  dyeing: 'At dyeing',
  combing: 'At combing',
  completed: 'Received',
};

/** `stage`: 'dyeing' | 'combing' | 'completed'. */
export function LotRow({ lot, stage, onNext, onPrint, onAction }) {
  const t = lotTotals(lot);
  const since = stage === 'dyeing' ? lot.dcDate : stage === 'combing' ? lot.dyeing?.date : lot.received?.date;
  const days = daysSince(since);
  const due =
    stage === 'dyeing'
      ? t.dyeingDue
      : stage === 'combing'
        ? t.combingDue
        : Math.max(0, t.dyeingDue) + Math.max(0, t.combingDue);
  const next =
    lot.status === LOT_STATUS.AT_DYEING
      ? { label: "Dyer's DC", icon: Truck, title: "Enter the dyeing unit's DC (sent to combing)" }
      : lot.status === LOT_STATUS.AT_COMBING
        ? { label: 'Receive', icon: CheckCircle2, title: "Enter the combing unit's DC (received back)" }
        : null;
  const payments = (lot.dyeingPayments?.length ?? 0) + (lot.combingPayments?.length ?? 0);
  const returns = lot.returns?.length ?? 0;
  return (
    <RecordRow
      code={formatDcNo(lot.dcNo)}
      meta={
        <>
          <span className="text-xs font-medium text-slate-500 tabular-nums">{formatDateIN(lot.dcDate)}</span>
          <Badge status={STATUS[stage]}>
            {STATUS[stage]}
            {stage !== 'completed' && days ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}
          </Badge>
          {due > 0 ? <Badge status="Due">Due {rupees(due)}</Badge> : null}
        </>
      }
      actions={
        <>
          {next ? (
            <Button
              size="sm"
              variant="success"
              icon={next.icon}
              title={next.title}
              onClick={() => onNext(lot)}
            >
              {next.label}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" icon={Printer} onClick={() => onPrint(lot)} title="Print my DC">
            DC
          </Button>
          <Button size="sm" variant="outlineSuccess" icon={Wallet} onClick={() => onAction('pay', lot)}>
            + Pay
          </Button>
          <Button size="sm" variant="outlineInfo" icon={History} onClick={() => onAction('payHistory', lot)}>
            Payments{payments ? ` (${payments})` : ''}
          </Button>
          <Button size="sm" variant="outlineWarning" icon={RotateCcw} onClick={() => onAction('return', lot)}>
            + Return
          </Button>
          <Button
            size="sm"
            variant="outlineWarning"
            icon={ListRestart}
            onClick={() => onAction('returnHistory', lot)}
          >
            Returns{returns ? ` (${returns})` : ''}
          </Button>
          <Button size="sm" variant="edit" icon={Pencil} onClick={() => onAction('edit', lot)}>
            Edit
          </Button>
          {lot.status !== LOT_STATUS.AT_DYEING ? (
            <Button
              size="sm"
              variant="outlineWarning"
              icon={Undo2}
              onClick={() => onAction('undo', lot)}
              title={lot.status === LOT_STATUS.RECEIVED ? 'Undo the receipt' : "Undo the dyeing unit's DC"}
            >
              Undo
            </Button>
          ) : null}
          <Button size="sm" variant="outlineDanger" icon={Trash2} onClick={() => onAction('delete', lot)}>
            Delete
          </Button>
        </>
      }
      footer={lot.notes ? `Note: ${lot.notes}` : null}
    >
      {stage === 'dyeing' ? (
        <DyeingDetails lot={lot} t={t} />
      ) : stage === 'combing' ? (
        <CombingDetails lot={lot} t={t} />
      ) : (
        <CompletedDetails lot={lot} t={t} />
      )}
    </RecordRow>
  );
}
