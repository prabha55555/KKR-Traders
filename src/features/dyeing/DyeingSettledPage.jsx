import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Layers,
  Percent,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { formatCurrency, formatDateShort } from '@/core/format';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Page,
  RefreshButton,
  SearchBar,
  StatCard,
  useFeedback,
} from '@/ui';

import { AddDyeingPaymentModal } from './AddDyeingPaymentModal';
import { DyeingBatchModal } from './DyeingBatchModal';
import { DyeingChallanModal } from './DyeingChallanModal';
import { DyeingPaymentHistoryModal } from './DyeingPaymentHistoryModal';
import { calcBatchPaymentStats, DYEING_STATUS } from './dyeingLogic';
import { deleteDyeingBatchRecord, loadDyeingData } from './dyeingService';

export default function DyeingSettledPage() {
  const { confirm, toast } = useFeedback();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    batches: [],
    shortcuts: [],
    bankAccounts: [],
    stockMap: new Map(),
    purchaseBills: [],
    dyers: [],
  });

  const [searchTerm, setSearchTerm] = useState(searchParams.get('search') || '');
  const [paymentFilter, setPaymentFilter] = useState('ALL'); // 'ALL' | 'DUE' | 'PAID'

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [challanBatch, setChallanBatch] = useState(null);
  const [isChallanOpen, setIsChallanOpen] = useState(false);
  const [payingBatch, setPayingBatch] = useState(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [historyBatch, setHistoryBatch] = useState(null);
  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadDyeingData();
      setData(res);
    } catch (err) {
      console.error('Failed to load dyeing settled data:', err);
      setError(err.message || 'Could not load settled batches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // All completed/settled batches
  const settledBatches = useMemo(() => {
    return (data.batches || []).filter((b) => b.status === DYEING_STATUS.COMPLETED);
  }, [data.batches]);

  const ongoingCount = useMemo(() => {
    return (data.batches || []).filter((b) => b.status !== DYEING_STATUS.COMPLETED).length;
  }, [data.batches]);

  // Search and payment filtered batches
  const filteredBatches = useMemo(() => {
    let result = settledBatches;

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      result = result.filter(
        (b) =>
          b.batchId?.toLowerCase().includes(q) ||
          b.processorName?.toLowerCase().includes(q) ||
          b.input?.description?.toLowerCase().includes(q) ||
          (b.output || []).some((o) => o.productName?.toLowerCase().includes(q)),
      );
    }

    if (paymentFilter === 'DUE') {
      result = result.filter((b) => calcBatchPaymentStats(b).hasBalanceDue);
    } else if (paymentFilter === 'PAID') {
      result = result.filter((b) => calcBatchPaymentStats(b).isPaid);
    }

    return result;
  }, [settledBatches, searchTerm, paymentFilter]);

  // Aggregated KPIs across all completed batches
  const kpis = useMemo(() => {
    let finishedQty = 0;
    let totalDyeingCost = 0;
    let totalPaid = 0;
    let balanceDue = 0;
    let totalInputForShrinkage = 0;
    let totalShrinkageQty = 0;

    for (const b of settledBatches) {
      const stats = calcBatchPaymentStats(b);
      totalDyeingCost += stats.totalCharges;
      totalPaid += stats.totalPaid;
      balanceDue += stats.balanceDue;

      const outQty =
        (b.output || []).reduce((acc, cur) => acc + (parseFloat(cur.qty) || 0), 0) || b.totalOutputQty || 0;
      finishedQty += outQty;

      const inQty = parseFloat(b.input?.qty) || 0;
      if (inQty > 0) {
        totalInputForShrinkage += inQty;
        totalShrinkageQty += parseFloat(b.shrinkageQty) || 0;
      }
    }

    const avgShrinkagePct =
      totalInputForShrinkage > 0 ? (totalShrinkageQty / totalInputForShrinkage) * 100 : 0;

    return {
      settledCount: settledBatches.length,
      finishedQty,
      totalDyeingCost,
      totalPaid,
      balanceDue,
      avgShrinkagePct,
    };
  }, [settledBatches]);

  const handleEdit = (batch) => {
    setEditingBatch(batch);
    setIsModalOpen(true);
  };

  const handleViewChallan = (batch) => {
    setChallanBatch(batch);
    setIsChallanOpen(true);
  };

  const handleOpenPayment = (batch) => {
    setPayingBatch(batch);
    setIsPaymentOpen(true);
  };

  const handleOpenHistory = (batch) => {
    setHistoryBatch(batch);
    setIsPaymentHistoryOpen(true);
  };

  const handleDelete = async (batch) => {
    const ok = await confirm({
      title: `Delete Settled Batch #${batch.batchId}?`,
      message:
        'Are you sure you want to delete this completed dyeing batch? Stock converted by this batch will be reverted.',
      tone: 'danger',
      confirmText: 'Delete Batch',
    });
    if (!ok) return;

    try {
      await deleteDyeingBatchRecord(batch.batchId);
      toast('Batch Deleted', `Settled Batch #${batch.batchId} has been removed.`, 'success');
      loadData();
    } catch (err) {
      toast('Delete Failed', err.message || 'Could not delete batch.', 'error');
    }
  };

  if (loading && data.batches.length === 0) {
    return (
      <Page title="Settled Dyeing Batches" icon={CheckCircle2}>
        <LoadingState label="Loading settled dyeing batches…" />
      </Page>
    );
  }

  if (error && data.batches.length === 0) {
    return (
      <Page title="Settled Dyeing Batches" icon={CheckCircle2}>
        <ErrorState message={error} onRetry={loadData} />
      </Page>
    );
  }

  return (
    <Page
      title="Settled Dyeing Batches"
      icon={CheckCircle2}
      actions={<RefreshButton onClick={loadData} loading={loading} title="Refresh batches" />}
    >
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Settled Batches" value={kpis.settledCount} tint="green" icon={CheckCircle2} />
          <StatCard
            label="Finished Output"
            value={`${kpis.finishedQty.toLocaleString()} Qty`}
            tint="brand"
            icon={Layers}
          />
          <StatCard
            label="Total Dyeing Cost"
            value={`₹${formatCurrency(kpis.totalDyeingCost)}`}
            tint="brand"
            icon={Banknote}
          />
          <StatCard
            label="Avg Weight Loss"
            value={`${kpis.avgShrinkagePct.toFixed(1)}%`}
            tint="amber"
            icon={Percent}
          />
          <StatCard
            label="Total Paid"
            value={`₹${formatCurrency(kpis.totalPaid)}`}
            tint="green"
            icon={Banknote}
          />
          <StatCard
            label="Balance Due"
            value={`₹${formatCurrency(kpis.balanceDue)}`}
            tint={kpis.balanceDue > 0 ? 'red' : 'green'}
            icon={AlertCircle}
          />
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-md">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search batch #, dyer, grey roll or finished fabric..."
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="mr-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Payment:
            </span>
            <button
              type="button"
              onClick={() => setPaymentFilter('ALL')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                paymentFilter === 'ALL'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Settled ({settledBatches.length})
            </button>
            <button
              type="button"
              onClick={() => setPaymentFilter('DUE')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                paymentFilter === 'DUE'
                  ? 'bg-rose-700 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              Balance Due ({settledBatches.filter((b) => calcBatchPaymentStats(b).hasBalanceDue).length})
            </button>
            <button
              type="button"
              onClick={() => setPaymentFilter('PAID')}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                paymentFilter === 'PAID'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Fully Paid ({settledBatches.filter((b) => calcBatchPaymentStats(b).isPaid).length})
            </button>
          </div>
        </div>

        {/* Batches List */}
        {filteredBatches.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={searchTerm.trim() ? 'No matching settled batches found' : 'No settled batches yet'}
            message={
              searchTerm.trim()
                ? 'Try adjusting your search terms or payment filters.'
                : 'Batches will appear here once they return from dyeing and are marked as completed.'
            }
            action={
              ongoingCount > 0 ? (
                <Link
                  to="/dyeing/batches"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  <Layers className="size-4" />
                  <span>View {ongoingCount} Ongoing Batches</span>
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredBatches.map((batch) => {
              const paymentStats = calcBatchPaymentStats(batch);
              const outputTotalQty =
                (batch.output || []).reduce((acc, cur) => acc + (parseFloat(cur.qty) || 0), 0) ||
                batch.totalOutputQty ||
                0;

              return (
                <div
                  key={batch.batchId}
                  className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs transition hover:border-slate-300"
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-6">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-slate-900 sm:text-base">
                        #{batch.batchId}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-600">
                        Completed {formatDateShort(batch.completedAt || batch.batchDate)}
                      </span>
                      {paymentStats.isPaid && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          Paid
                        </span>
                      )}
                      {paymentStats.isPartial && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
                          Part Paid (Due: ₹{formatCurrency(paymentStats.balanceDue)})
                        </span>
                      )}
                      {paymentStats.isUnpaid && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                          Due: ₹{formatCurrency(paymentStats.balanceDue)}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        icon={Banknote}
                        onClick={() => handleOpenPayment(batch)}
                        disabled={paymentStats.balanceDue <= 0}
                        title={
                          paymentStats.balanceDue <= 0
                            ? 'All dyeing charges settled'
                            : `Record payment (Due: ₹${formatCurrency(paymentStats.balanceDue)})`
                        }
                      >
                        + Pay
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        icon={Clock}
                        onClick={() => handleOpenHistory(batch)}
                        title="View payment history"
                      >
                        History {paymentStats.paymentsCount > 0 ? `(${paymentStats.paymentsCount})` : ''}
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        icon={FileText}
                        onClick={() => handleViewChallan(batch)}
                        title="Print Challan"
                      >
                        Challan
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        icon={Edit}
                        onClick={() => handleEdit(batch)}
                        className="border-slate-200 text-slate-700 hover:bg-slate-100"
                      >
                        Edit
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        icon={Trash2}
                        onClick={() => handleDelete(batch)}
                        className="border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        title="Delete Batch"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Card Content Grid */}
                  <div className="space-y-4 p-4 sm:p-6">
                    <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Dye House / Processor
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-slate-800">{batch.processorName}</div>
                        {batch.processorPhone && (
                          <div className="mt-0.5 text-slate-500">{batch.processorPhone}</div>
                        )}
                      </div>

                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Grey Consumed
                        </div>
                        <div className="mt-0.5 font-bold text-slate-800">
                          {batch.input?.qty} {batch.input?.unit || 'Rolls'}
                        </div>
                        <div className="text-slate-500">
                          @ ₹{formatCurrency(batch.input?.avgGreyRate || batch.input?.greyRate)} / unit
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Finished Output Produced
                        </div>
                        <div className="mt-0.5 font-bold text-emerald-700">
                          {outputTotalQty} {batch.input?.unit || 'Rolls'}
                        </div>
                        <div className="text-slate-500">
                          Avg: ₹{formatCurrency(batch.avgFinishedUnitCost)} / unit
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Actual Weight Loss
                        </div>
                        <div className="mt-0.5 font-bold text-amber-700">
                          {batch.shrinkagePct || 0}% ({batch.shrinkageQty || 0} {batch.input?.unit || 'Rolls'}
                          )
                        </div>
                        <div className="text-slate-400">Measured on completion</div>
                      </div>
                    </div>

                    {/* Output Products Breakdown */}
                    {Array.isArray(batch.output) && batch.output.length > 0 && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs">
                        <div className="mb-1.5 text-[10px] font-bold tracking-wider text-emerald-800 uppercase">
                          Finished Stock Converted:
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {batch.output.map((out, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-950 shadow-2xs"
                            >
                              <span className="font-bold">{out.productName || 'Finished Fabric'}</span>
                              <span className="text-slate-400">•</span>
                              <span className="text-emerald-700">
                                {out.qty} {batch.input?.unit || 'Rolls'}
                              </span>
                              {out.unitCost && (
                                <>
                                  <span className="text-slate-400">•</span>
                                  <span className="text-slate-600">₹{formatCurrency(out.unitCost)}/unit</span>
                                </>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Financial Summary Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                        <div>
                          <span className="text-slate-500">Dyeing Charges:</span>{' '}
                          <span className="font-bold text-slate-900">
                            ₹{formatCurrency(paymentStats.totalCharges)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Total Paid:</span>{' '}
                          <span className="font-bold text-emerald-700">
                            ₹{formatCurrency(paymentStats.totalPaid)}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Balance Due:</span>{' '}
                          <span
                            className={`font-bold ${
                              paymentStats.balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            ₹{formatCurrency(paymentStats.balanceDue)}
                          </span>
                        </div>
                      </div>

                      {batch.totalGreyCost !== undefined && (
                        <div className="text-slate-500">
                          Total Batch Value (Grey + Dyeing):{' '}
                          <span className="font-bold text-slate-900">
                            ₹{formatCurrency((batch.totalGreyCost || 0) + paymentStats.totalCharges)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      <DyeingBatchModal
        open={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingBatch(null);
        }}
        initialBatch={editingBatch}
        existingBatches={data.batches}
        shortcuts={data.shortcuts}
        bankAccounts={data.bankAccounts}
        stockMap={data.stockMap}
        purchaseBills={data.purchaseBills}
        dyers={data.dyers}
        onSaved={loadData}
      />

      <DyeingChallanModal open={isChallanOpen} onClose={() => setIsChallanOpen(false)} batch={challanBatch} />

      <AddDyeingPaymentModal
        open={isPaymentOpen}
        batch={payingBatch}
        onClose={() => {
          setIsPaymentOpen(false);
          setPayingBatch(null);
        }}
        onPaymentAdded={(updatedBatch) => {
          if (
            updatedBatch &&
            historyBatch &&
            (updatedBatch.batchId === historyBatch.batchId || updatedBatch.id === historyBatch.id)
          ) {
            setHistoryBatch(updatedBatch);
          }
          loadData();
        }}
      />

      <DyeingPaymentHistoryModal
        open={isPaymentHistoryOpen}
        batch={historyBatch}
        onClose={() => {
          setIsPaymentHistoryOpen(false);
          setHistoryBatch(null);
        }}
        onPaymentDeleted={(updatedBatch) => {
          if (updatedBatch) setHistoryBatch(updatedBatch);
          loadData();
        }}
        onOpenAddPayment={(b) => handleOpenPayment(b)}
      />
    </Page>
  );
}
