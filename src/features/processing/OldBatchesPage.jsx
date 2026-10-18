/**
 * Archive of the batches made with the old separate Dyeing / Combing screens. Read-only (they keep counting in stock
 * and finance exactly as before); payments to the units can still be added or removed.
 */
import { Archive, History, Trash2, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { db } from '@/core/db';
import { formatCurrency, formatDateIN, toNum } from '@/core/format';
import { AddCombingPaymentModal } from '@/features/combing/AddCombingPaymentModal';
import { CombingPaymentHistoryModal } from '@/features/combing/CombingPaymentHistoryModal';
import { calcCombingBatchPaymentStats } from '@/features/combing/combingLogic';
import { deleteCombingBatchRecord } from '@/features/combing/combingService';
import { AddDyeingPaymentModal } from '@/features/dyeing/AddDyeingPaymentModal';
import { DyeingPaymentHistoryModal } from '@/features/dyeing/DyeingPaymentHistoryModal';
import { calcBatchPaymentStats } from '@/features/dyeing/dyeingLogic';
import { deleteDyeingBatchRecord } from '@/features/dyeing/dyeingService';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Badge,
  Button,
  ChoiceChips,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  SearchBar,
  useFeedback,
} from '@/ui';
import { Cell, RecordRow } from './LotRow';

const rupees = (n) => `₹${formatCurrency(n)}`;
const qtyText = (qty, unit) =>
  `${Math.round(toNum(qty) * 1000) / 1000} ${unit && unit !== 'Kgs' ? unit : 'kg'}`;
/** Old batch status text; its colour comes from the app-wide status map (completed green, in process blue). */
const statusText = (status) =>
  status === 'COMPLETED' ? 'Completed' : status === 'CANCELLED' ? 'Cancelled' : 'In process';

export default function OldBatchesPage() {
  const { toast, confirm } = useFeedback();
  const [state, setState] = useState({ dyeing: [], combing: [] });
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null); // { kind: 'pay'|'history', type: 'dyeing'|'combing', batch }
  const load = useCallback(async () => {
    const [dyeing, combing] = await Promise.all([
      db.getAllDyeingBatches().catch(() => []),
      db.getAllCombingBatches().catch(() => []),
    ]);
    setState({ dyeing: dyeing || [], combing: combing || [] });
  }, []);
  const { loading, error, refresh, reload } = useFocusLoad(load);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [
      ...state.dyeing.map((b) => ({ type: 'dyeing', batch: b, stats: calcBatchPaymentStats(b) })),
      ...state.combing.map((b) => ({ type: 'combing', batch: b, stats: calcCombingBatchPaymentStats(b) })),
    ];
    return all
      .filter((r) => filter === 'all' || r.type === filter || (filter === 'due' && r.stats.balanceDue > 0))
      .filter(
        (r) =>
          !q ||
          [
            r.batch.batchId,
            r.batch.processorName,
            r.batch.input?.description,
            ...(r.batch.output ?? []).map((o) => o.description),
          ].some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(q),
          ),
      )
      .sort((a, b) => String(b.batch.batchDate ?? '').localeCompare(String(a.batch.batchDate ?? '')));
  }, [state, filter, query]);

  const replace = (type, batch) =>
    setState((s) => ({
      ...s,
      [type]: s[type].map((b) => (b.id === batch.id || b.batchId === batch.batchId ? batch : b)),
    }));
  const close = () => {
    setModal(null);
    void reload();
  };
  /** Deletes an old batch for good: its stock effect disappears and its payments leave Cash / bank balances. */
  const remove = async (type, batch, stats) => {
    const paid =
      stats.totalPaid > 0
        ? ` Its payments (${rupees(stats.totalPaid)}) are removed from Cash / bank too.`
        : '';
    const ok = await confirm({
      title: 'Delete old batch',
      message: `Delete ${type} batch ${batch.batchId} (${batch.processorName || 'unit'}) permanently? Its ${qtyText(batch.input?.qty, batch.input?.unit)} of ${batch.input?.description ?? 'fabric'} goes back to stock.${paid} This cannot be undone.`,
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      if (type === 'combing') await deleteCombingBatchRecord(batch.batchId ?? batch.id);
      else await deleteDyeingBatchRecord(batch.batchId ?? batch.id);
      setState((s) => ({ ...s, [type]: s[type].filter((b) => b !== batch) }));
      toast('Batch deleted', `Batch ${batch.batchId}`, 'success');
      void reload();
    } catch {
      toast('Error', 'Could not delete the batch.', 'error');
    }
  };
  const PayModal = modal?.type === 'combing' ? AddCombingPaymentModal : AddDyeingPaymentModal;
  const HistoryModal = modal?.type === 'combing' ? CombingPaymentHistoryModal : DyeingPaymentHistoryModal;

  return (
    <Page title="Old Batches" icon={Archive}>
      <p className="mb-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-800 ring-1 ring-sky-200">
        Batches from the old separate Dyeing and Combing screens. They still count in stock and finance; here
        you can pay them or delete them. New work is done as Processing Lots.
      </p>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Search batch, unit or product…"
              className="flex-1"
            />
            <ChoiceChips
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'dyeing', label: 'Dyeing' },
                { value: 'combing', label: 'Combing' },
                { value: 'due', label: 'Payment due' },
              ]}
            />
          </div>
          {rows.length === 0 ? (
            <EmptyState
              icon={Archive}
              title="No old batches"
              message="Nothing matches — or there were none."
            />
          ) : (
            <div className="space-y-3">
              {rows.map(({ type, batch, stats }) => {
                const output =
                  batch.status === 'COMPLETED' && batch.output?.length
                    ? batch.output.map((o) => `${o.description} ${qtyText(o.qty, o.unit)}`).join(', ')
                    : '';
                return (
                  <RecordRow
                    key={`${type}-${batch.id ?? batch.batchId}`}
                    code={batch.batchId}
                    meta={
                      <>
                        <span className="text-xs font-medium text-slate-500 tabular-nums">
                          {formatDateIN(batch.batchDate)}
                        </span>
                        <Badge tone="neutral">{type === 'dyeing' ? 'Dyeing' : 'Combing'}</Badge>
                        <Badge status={statusText(batch.status)} />
                        {stats.balanceDue > 0 ? (
                          <Badge status="Due">Due {rupees(stats.balanceDue)}</Badge>
                        ) : (
                          <Badge status="Settled" />
                        )}
                      </>
                    }
                    actions={
                      <>
                        {stats.balanceDue > 0 ? (
                          <Button
                            size="sm"
                            variant="outlineSuccess"
                            icon={Wallet}
                            onClick={() => setModal({ kind: 'pay', type, batch })}
                          >
                            Pay
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outlineInfo"
                          icon={History}
                          onClick={() => setModal({ kind: 'history', type, batch })}
                        >
                          Payments ({stats.paymentsCount ?? (batch.payments ?? []).length})
                        </Button>
                        <Button
                          size="sm"
                          variant="outlineDanger"
                          icon={Trash2}
                          onClick={() => remove(type, batch, stats)}
                        >
                          Delete
                        </Button>
                      </>
                    }
                  >
                    <Cell
                      label={type === 'dyeing' ? 'Dyeing unit' : 'Combing unit'}
                      sub={batch.processorPhone || null}
                    >
                      {batch.processorName || '—'}
                    </Cell>
                    <Cell label="Sent" sub={batch.input?.description || null}>
                      {qtyText(batch.input?.qty, batch.input?.unit)}
                    </Cell>
                    <Cell label="Received back">{output || '—'}</Cell>
                    <Cell label="Charges" sub={`Paid ${rupees(stats.totalPaid)}`}>
                      {rupees(stats.totalCharges)}
                    </Cell>
                  </RecordRow>
                );
              })}
            </div>
          )}
        </div>
      )}
      <PayModal
        open={modal?.kind === 'pay'}
        batch={modal?.kind === 'pay' ? modal.batch : null}
        onClose={close}
        onPaymentAdded={(batch) => {
          replace(modal.type, batch);
          close();
        }}
      />
      <HistoryModal
        open={modal?.kind === 'history'}
        batch={modal?.kind === 'history' ? modal.batch : null}
        onClose={close}
        onPaymentDeleted={(batch) => {
          replace(modal.type, batch);
          setModal((m) => (m ? { ...m, batch } : m));
        }}
        onOpenAddPayment={(batch) => setModal((m) => ({ ...m, kind: 'pay', batch }))}
      />
    </Page>
  );
}
