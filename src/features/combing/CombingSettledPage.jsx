import {
  AlertCircle,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Edit,
  ExternalLink,
  FileText,
  Layers,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { formatCurrency, formatDateIN, formatDateShort } from '@/core/format';
import { Badge, Button, EmptyState, ErrorState, LoadingState, Page, useFeedback } from '@/ui';

import { AddCombingPaymentModal } from './AddCombingPaymentModal';
import { CombingBatchModal } from './CombingBatchModal';
import { CombingChallanModal } from './CombingChallanModal';
import CombingNavTabs from './CombingNavTabs';
import { CombingPaymentHistoryModal } from './CombingPaymentHistoryModal';
import { calcCombingBatchPaymentStats, COMBING_STATUS } from './combingLogic';
import { deleteCombingBatchRecord, loadCombingData } from './combingService';

function StatCard({ label, value, subtext, tone = 'default', icon: Icon }) {
  const toneClasses = {
    default: 'border-slate-200 bg-white text-slate-800',
    brand: 'border-brand-200 bg-brand-50/60 text-brand-900',
    emerald: 'border-emerald-200 bg-emerald-50/60 text-emerald-950',
    amber: 'border-amber-200 bg-amber-50/60 text-amber-950',
    rose: 'border-rose-200 bg-rose-50/60 text-rose-950',
  }[tone];

  return (
    <div className={`flex flex-col justify-between rounded-2xl border p-4 shadow-2xs ${toneClasses}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold tracking-wider text-slate-500 uppercase">{label}</span>
        {Icon && <Icon className="size-4 text-slate-400" />}
      </div>
      <div className="mt-2 font-display text-xl font-bold tracking-tight sm:text-2xl">{value}</div>
      {subtext && <div className="mt-1 text-xs text-slate-500">{subtext}</div>}
    </div>
  );
}

export default function CombingSettledPage() {
  const { confirm, toast } = useFeedback();
  const [searchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    batches: [],
    shortcuts: [],
    bankAccounts: [],
    stockMap: new Map(),
    processors: [],
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
      const res = await loadCombingData();
      setData(res);
    } catch (err) {
      console.error('Failed to load combing settled data:', err);
      setError(err.message || 'Could not load settled combing batches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const settledBatches = useMemo(() => {
    return (data.batches || []).filter((b) => b.status === COMBING_STATUS.COMPLETED);
  }, [data.batches]);

  const ongoingCount = useMemo(() => {
    return (data.batches || []).filter((b) => b.status !== COMBING_STATUS.COMPLETED).length;
  }, [data.batches]);

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
      result = result.filter((b) => calcCombingBatchPaymentStats(b).hasBalanceDue);
    } else if (paymentFilter === 'PAID') {
      result = result.filter((b) => calcCombingBatchPaymentStats(b).isPaid);
    }

    return result;
  }, [settledBatches, searchTerm, paymentFilter]);

  const kpis = useMemo(() => {
    let finishedQty = 0;
    let totalProcessingCost = 0;
    let totalPaid = 0;
    let balanceDue = 0;
    let totalInputForShrinkage = 0;
    let totalShrinkageQty = 0;

    for (const b of settledBatches) {
      const stats = calcCombingBatchPaymentStats(b);
      totalProcessingCost += stats.totalCharges;
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

    const avgShrinkagePct = totalInputForShrinkage > 0 ? (totalShrinkageQty / totalInputForShrinkage) * 100 : 0;

    return {
      settledCount: settledBatches.length,
      finishedQty,
      totalProcessingCost,
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
        'Are you sure you want to delete this completed combing & processing batch? Stock converted by this batch will be reverted.',
      tone: 'danger',
      confirmText: 'Delete Batch',
    });
    if (!ok) return;

    try {
      await deleteCombingBatchRecord(batch.batchId);
      toast('Batch Deleted', `Settled Batch #${batch.batchId} has been removed.`, 'success');
      loadData();
    } catch (err) {
      toast('Delete Failed', err.message || 'Could not delete batch.', 'error');
    }
  };

  if (loading && data.batches.length === 0) {
    return (
      <Page title="Settled Combating Batches" icon={CheckCircle2}>
        <LoadingState label="Loading settled combating batches…" />
      </Page>
    );
  }

  if (error && data.batches.length === 0) {
    return (
      <Page title="Settled Combating Batches" icon={CheckCircle2}>
        <ErrorState message={error} onRetry={loadData} />
      </Page>
    );
  }

  return (
    <Page
      title={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-6 text-emerald-600" />
              <h1 className="font-display text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Settled Combating Batches
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Completed combing & finishing batches, final combed costs, actual loss results & processor settlements
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" icon={RefreshCw} onClick={loadData} title="Refresh batches">
              Refresh
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <CombingNavTabs
          counts={{
            ongoing: ongoingCount,
            settled: settledBatches.length,
            processors: data.processors.length,
          }}
        />

        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Settled Batches"
            value={kpis.settledCount}
            subtext="Fully completed"
            tone="emerald"
            icon={CheckCircle2}
          />
          <StatCard
            label="Combed Stock Produced"
            value={`${kpis.finishedQty.toLocaleString()} Qty`}
            subtext="Added to stock"
            tone="brand"
            icon={Sparkles}
          />
          <StatCard
            label="Processing Cost"
            value={`₹${formatCurrency(kpis.totalProcessingCost)}`}
            subtext="Final charges billed"
            tone="default"
            icon={Banknote}
          />
          <StatCard
            label="Avg Weight Loss"
            value={`${kpis.avgShrinkagePct.toFixed(1)}%`}
            subtext="Actual combing loss"
            tone="amber"
            icon={Percent}
          />
          <StatCard
            label="Total Paid"
            value={`₹${formatCurrency(kpis.totalPaid)}`}
            subtext="Remitted to mills"
            tone="emerald"
            icon={Banknote}
          />
          <StatCard
            label="Balance Due"
            value={`₹${formatCurrency(kpis.balanceDue)}`}
            subtext={kpis.balanceDue > 0 ? 'Payable to mills' : 'All fully settled'}
            tone={kpis.balanceDue > 0 ? 'rose' : 'emerald'}
            icon={AlertCircle}
          />
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search batch #, mill, dyed fabric or finished product..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
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
              Balance Due ({settledBatches.filter((b) => calcCombingBatchPaymentStats(b).hasBalanceDue).length})
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
              Fully Paid ({settledBatches.filter((b) => calcCombingBatchPaymentStats(b).isPaid).length})
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
                : 'Batches will appear here once returned from combing and marked as completed.'
            }
            action={
              ongoingCount > 0 ? (
                <Link
                  to="/combing/batches"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-slate-800"
                >
                  <Sparkles className="size-4" />
                  <span>View {ongoingCount} Ongoing Batches</span>
                </Link>
              ) : null
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredBatches.map((batch) => {
              const paymentStats = calcCombingBatchPaymentStats(batch);
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
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                        <CheckCircle2 className="size-3 text-emerald-600" />
                        Completed & Settled
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
                            ? 'All combing charges settled'
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
                        className="text-slate-700 hover:bg-slate-100 border-slate-200"
                      >
                        Edit
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        icon={Trash2}
                        onClick={() => handleDelete(batch)}
                        className="text-slate-600 hover:bg-slate-100 hover:text-slate-900 border-slate-200"
                        title="Delete Batch"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  {/* Card Content Grid */}
                  <div className="p-4 sm:p-6 space-y-4">
                    <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Mill / Processor
                        </div>
                        <div className="mt-0.5 text-sm font-bold text-slate-800">{batch.processorName}</div>
                        {batch.processorPhone && (
                          <div className="mt-0.5 text-slate-500">{batch.processorPhone}</div>
                        )}
                      </div>

                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Dyed Fabric Sent
                        </div>
                        <div className="mt-0.5 font-bold text-slate-800">
                          {batch.input?.qty} {batch.input?.unit || 'Rolls'}
                        </div>
                        <div className="text-slate-500">
                          @ ₹{formatCurrency(batch.input?.avgDyedRate || batch.input?.dyedRate)} / unit
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                          Combed Fabric Received
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
                          {batch.shrinkagePct || 0}% ({batch.shrinkageQty || 0} {batch.input?.unit || 'Rolls'})
                        </div>
                        <div className="text-slate-400">Measured on completion</div>
                      </div>
                    </div>

                    {/* Output Products Breakdown */}
                    {Array.isArray(batch.output) && batch.output.length > 0 && (
                      <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-xs">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 mb-1.5">
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
                              <span className="text-emerald-700">{out.qty} {batch.input?.unit || 'Rolls'}</span>
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
                          <span className="text-slate-500">Processing Charges:</span>{' '}
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

                      {batch.totalDyedCost !== undefined && (
                        <div className="text-slate-500">
                          Total Value (Dyed + Combing):{' '}
                          <span className="font-bold text-slate-900">
                            ₹{formatCurrency((batch.totalDyedCost || 0) + paymentStats.totalCharges)}
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
      <CombingBatchModal
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
        processors={data.processors}
        onSaved={loadData}
      />

      <CombingChallanModal open={isChallanOpen} onClose={() => setIsChallanOpen(false)} batch={challanBatch} />

      <AddCombingPaymentModal
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

      <CombingPaymentHistoryModal
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
