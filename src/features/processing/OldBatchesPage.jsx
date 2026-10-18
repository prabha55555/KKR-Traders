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
  Card,
  ChoiceChips,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  RefreshButton,
  SearchBar,
  cn,
  useFeedback,
} from '@/ui';

const rupees = (n) => `₹${formatCurrency(n)}`;
const qtyText = (qty, unit) =>
  `${Math.round(toNum(qty) * 1000) / 1000} ${unit && unit !== 'Kgs' ? unit : 'kg'}`;

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
  const { loading, error, refreshing, refresh, reload } = useFocusLoad(load);

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
    <Page
      title="Old Batches"
      icon={Archive}
      actions={<RefreshButton onClick={refresh} loading={refreshing} />}
    >
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
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map(({ type, batch, stats }) => (
                <Card key={`${type}-${batch.id ?? batch.batchId}`} className="p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-brand-800">{batch.batchId}</span>
                        <Badge tone={type === 'dyeing' ? 'info' : 'brand'}>
                          {type === 'dyeing' ? 'Dyeing' : 'Combing'}
                        </Badge>
                        <Badge
                          tone={
                            batch.status === 'COMPLETED'
                              ? 'success'
                              : batch.status === 'CANCELLED'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {batch.status === 'COMPLETED'
                            ? 'Completed'
                            : batch.status === 'CANCELLED'
                              ? 'Cancelled'
                              : 'In process'}
                        </Badge>
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {formatDateIN(batch.batchDate)} · {batch.processorName || '—'}
                      </div>
                      <div className="mt-1 truncate text-sm text-slate-700">
                        {batch.input?.description} · {qtyText(batch.input?.qty, batch.input?.unit)}
                        {batch.status === 'COMPLETED' && batch.output?.length
                          ? ` → ${batch.output.map((o) => `${o.description} ${qtyText(o.qty, o.unit)}`).join(', ')}`
                          : ''}
                      </div>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <div className="text-xs text-slate-500">Charges {rupees(stats.totalCharges)}</div>
                      <div
                        className={cn(
                          'font-bold',
                          stats.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700',
                        )}
                      >
                        {stats.balanceDue > 0 ? `Due ${rupees(stats.balanceDue)}` : 'Settled'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {stats.balanceDue > 0 ? (
                      <Button size="sm" icon={Wallet} onClick={() => setModal({ kind: 'pay', type, batch })}>
                        Pay
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      icon={History}
                      onClick={() => setModal({ kind: 'history', type, batch })}
                    >
                      Payments ({stats.paymentsCount ?? (batch.payments ?? []).length})
                    </Button>
                    <Button
                      size="sm"
                      variant="outlineDanger"
                      icon={Trash2}
                      className="ml-auto"
                      onClick={() => remove(type, batch, stats)}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
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
