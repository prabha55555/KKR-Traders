/**
 * One processing lot as a full-width row (header strip with the DC, status and every action; then labelled detail
 * columns). The details depend on the STAGE being looked at, so each process shows only its own information:
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

function Cell({ label, children, sub, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">{label}</div>
      <div className={cn('mt-0.5 truncate text-sm font-semibold text-slate-800', tone)}>{children}</div>
      {sub ? <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div> : null}
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

const STATUS = {
  dyeing: { label: 'At dyeing', tone: 'info' },
  combing: { label: 'At combing', tone: 'warning' },
  completed: { label: 'Received', tone: 'success' },
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
    <article className="rounded-2xl border border-line bg-white p-3.5 shadow-card sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded bg-slate-900 px-2.5 py-1 font-mono text-sm font-bold text-white">
            {formatDcNo(lot.dcNo)}
          </span>
          <span className="text-xs font-medium text-slate-500">{formatDateIN(lot.dcDate)}</span>
          <Badge tone={STATUS[stage].tone}>
            {STATUS[stage].label}
            {stage !== 'completed' && days ? ` · ${days} day${days === 1 ? '' : 's'}` : ''}
          </Badge>
          {due > 0 ? <Badge tone="danger">Due {rupees(due)}</Badge> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {next ? (
            <Button size="sm" icon={next.icon} title={next.title} onClick={() => onNext(lot)}>
              {next.label}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" icon={Printer} onClick={() => onPrint(lot)} title="Print my DC">
            DC
          </Button>
          <Button size="sm" variant="outline" icon={Wallet} onClick={() => onAction('pay', lot)}>
            + Pay
          </Button>
          <Button size="sm" variant="outline" icon={History} onClick={() => onAction('payHistory', lot)}>
            Payments{payments ? ` (${payments})` : ''}
          </Button>
          <Button size="sm" variant="outline" icon={RotateCcw} onClick={() => onAction('return', lot)}>
            + Return
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={ListRestart}
            onClick={() => onAction('returnHistory', lot)}
          >
            Returns{returns ? ` (${returns})` : ''}
          </Button>
          <Button size="sm" variant="outline" icon={Pencil} onClick={() => onAction('edit', lot)}>
            Edit
          </Button>
          {lot.status !== LOT_STATUS.AT_DYEING ? (
            <Button
              size="sm"
              variant="ghost"
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
        </div>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stage === 'dyeing' ? (
          <DyeingDetails lot={lot} t={t} />
        ) : stage === 'combing' ? (
          <CombingDetails lot={lot} t={t} />
        ) : (
          <CompletedDetails lot={lot} t={t} />
        )}
      </div>
      {lot.notes ? <p className="mt-2 text-xs text-slate-500">Note: {lot.notes}</p> : null}
    </article>
  );
}
