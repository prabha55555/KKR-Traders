import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Edit,
  FileText,
  Layers,
  Package,
  Plus,
  Receipt,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { formatCurrency, formatDateIN } from '@/core/format';
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
import { DyeingCompletionModal } from './DyeingCompletionModal';
import { DyeingPaymentHistoryModal } from './DyeingPaymentHistoryModal';
import { DYEING_STATUS, calcBatchPaymentStats } from './dyeingLogic';
import { deleteDyeingBatchRecord, loadDyeingData } from './dyeingService';

const rupees = (n) => `₹${formatCurrency(n)}`;

export default function DyeingPage({ openNew = false }) {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();

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

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);

  const [isChallanOpen, setIsChallanOpen] = useState(false);
  const [challanBatch, setChallanBatch] = useState(null);

  const [isCompletionOpen, setIsCompletionOpen] = useState(false);
  const [completingBatch, setCompletingBatch] = useState(null);

  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [payingBatch, setPayingBatch] = useState(null);

  const [isPaymentHistoryOpen, setIsPaymentHistoryOpen] = useState(false);
  const [historyBatch, setHistoryBatch] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await loadDyeingData();
      setData(res);
    } catch (err) {
      console.error('Failed to load dyeing data:', err);
      setError(err.message || 'Failed to load dyeing batches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle openNew prop (e.g. from /dyeing/new route)
  useEffect(() => {
    if (openNew) {
      setEditingBatch(null);
      setIsModalOpen(true);
    }
  }, [openNew]);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (openNew) {
      navigate('/dyeing/batches', { replace: true });
    }
  };

  const handleSaved = () => {
    loadData();
    if (openNew) {
      navigate('/dyeing/batches', { replace: true });
    }
  };

  const ongoingBatches = useMemo(() => {
    return (data.batches || []).filter((b) => b.status !== DYEING_STATUS.COMPLETED);
  }, [data.batches]);

  const settledCount = useMemo(() => {
    return (data.batches || []).filter((b) => b.status === DYEING_STATUS.COMPLETED).length;
  }, [data.batches]);

  const filteredBatches = useMemo(() => {
    let result = ongoingBatches;
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
  }, [ongoingBatches, searchTerm, paymentFilter]);

  const kpis = useMemo(() => {
    let totalGreyQty = 0;
    let totalDyeingCharges = 0;
    let totalPaid = 0;
    let totalBalanceDue = 0;

    ongoingBatches.forEach((b) => {
      totalGreyQty += parseFloat(b.input?.qty) || 0;
      const pStats = calcBatchPaymentStats(b);
      totalDyeingCharges += pStats.totalCharges;
      totalPaid += pStats.totalPaid;
      totalBalanceDue += pStats.balanceDue;
    });

    return {
      inProcessCount: ongoingBatches.length,
      settledCount,
      totalGreyQty,
      totalDyeingCharges,
      totalPaid,
      totalBalanceDue,
    };
  }, [ongoingBatches, settledCount]);

  const handleOpenNew = () => {
    setEditingBatch(null);
    setIsModalOpen(true);
  };

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

  const handleOpenPaymentHistory = (batch) => {
    setHistoryBatch(batch);
    setIsPaymentHistoryOpen(true);
  };

  const handleDelete = async (batch) => {
    const ok = await confirm({
      title: `Delete Batch #${batch.batchId}?`,
      message:
        'Are you sure you want to delete this dyeing batch? Any stock converted by this batch will be reverted.',
      tone: 'danger',
      confirmText: 'Delete Batch',
    });
    if (!ok) return;

    try {
      await deleteDyeingBatchRecord(batch.batchId);
      toast('Batch Deleted', `Batch #${batch.batchId} has been removed.`, 'success');
      loadData();
    } catch (err) {
      toast('Delete Failed', err.message || 'Could not delete batch.', 'error');
    }
  };

  const handleCompleteBatch = (batch) => {
    setCompletingBatch(batch);
    setIsCompletionOpen(true);
  };

  return (
    <Page
      title="Dyeing & Processing"
      icon={Layers}
      actions={<RefreshButton onClick={loadData} loading={loading} title="Refresh batches" />}
    >
      <div className="space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="In Process Batches" value={kpis.inProcessCount} icon={Clock} tint="amber" />
          <StatCard
            label="Raw Grey Fabric Issued"
            value={`${kpis.totalGreyQty} Qty`}
            icon={Package}
            tint="brand"
          />
          <StatCard
            label={`Dyeing Charges · Paid ${rupees(kpis.totalPaid)}`}
            value={rupees(kpis.totalDyeingCharges)}
            icon={Banknote}
            tint="brand"
          />
          <StatCard
            label="Dyer Balance Due"
            value={rupees(kpis.totalBalanceDue)}
            icon={AlertCircle}
            tint={kpis.totalBalanceDue > 0 ? 'red' : 'green'}
          />
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col items-stretch justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs sm:flex-row sm:items-center">
          <div className="w-full sm:max-w-md">
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by Batch #, processor, fabric or color..."
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 self-start overflow-x-auto pb-1 sm:self-auto sm:pb-0">
            <span className="mr-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              Payment:
            </span>
            {[
              { id: 'ALL', label: `All Ongoing (${ongoingBatches.length})` },
              {
                id: 'DUE',
                label: `Balance Due (${ongoingBatches.filter((b) => calcBatchPaymentStats(b).hasBalanceDue).length})`,
              },
              {
                id: 'PAID',
                label: `Paid (${ongoingBatches.filter((b) => calcBatchPaymentStats(b).isPaid).length})`,
              },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPaymentFilter(p.id)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  paymentFilter === p.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <LoadingState label="Loading dyeing batches..." className="py-16" />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : filteredBatches.length === 0 ? (
          <EmptyState
            icon={Layers}
            title={
              searchTerm || paymentFilter !== 'ALL'
                ? 'No matching ongoing batches found'
                : 'No ongoing dyeing batches in process'
            }
            message={
              searchTerm || paymentFilter !== 'ALL'
                ? 'Try adjusting your search keywords or payment filter.'
                : 'All batches have been completed and moved to Settled Batches, or click below to start a new batch.'
            }
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" icon={Plus} onClick={handleOpenNew}>
                  Create New Batch
                </Button>
                {settledCount > 0 && (
                  <Link
                    to="/dyeing/settled"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 transition hover:bg-emerald-100"
                  >
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <span>View {settledCount} Settled Batches</span>
                  </Link>
                )}
              </div>
            }
          />
        ) : (
          <div className="space-y-3">
            {filteredBatches.map((batch) => {
              const isCompleted = batch.status === DYEING_STATUS.COMPLETED;
              const paymentStats = calcBatchPaymentStats(batch);

              return (
                <div
                  key={batch.batchId}
                  className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-slate-900 px-2.5 py-1 font-mono text-sm font-bold text-white">
                        #{batch.batchId}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {formatDateIN(batch.batchDate)}
                      </span>
                      {/* Payment Status Badge */}
                      {paymentStats.isPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          <CheckCircle2 className="size-3 text-emerald-600" />
                          Paid
                        </span>
                      ) : paymentStats.isPartial ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                          <Clock className="size-3 text-amber-600" />
                          Part Paid ({rupees(paymentStats.balanceDue)} due)
                        </span>
                      ) : paymentStats.totalCharges > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                          <AlertCircle className="size-3 text-rose-600" />
                          Due: {rupees(paymentStats.balanceDue)}
                        </span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {!isCompleted && (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={CheckCircle2}
                          onClick={() => handleCompleteBatch(batch)}
                          className="py-1.5 text-xs font-semibold"
                        >
                          Complete
                        </Button>
                      )}

                      {/* Payment Buttons */}
                      <Button
                        size="sm"
                        variant="outline"
                        icon={Banknote}
                        onClick={() => handleOpenPayment(batch)}
                        className="border-emerald-300 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                        title="Record payment to dyer"
                      >
                        + Pay
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={Receipt}
                        onClick={() => handleOpenPaymentHistory(batch)}
                        className="border-slate-200 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
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

                  {/* Batch Details Grid */}
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
                        Raw Grey Consumed
                      </div>
                      <div className="mt-0.5 font-medium text-slate-800">{batch.input?.description}</div>
                      <div className="mt-0.5 font-semibold text-slate-600">
                        {batch.input?.qty} Qty @ {rupees(batch.input?.avgGreyRate || 0)} ={' '}
                        <span className="text-amber-800">{rupees(batch.input?.totalGreyCost || 0)}</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        Dyeing & Processing Cost
                      </div>
                      <div className="mt-0.5 text-sm font-bold text-indigo-700">
                        {rupees(paymentStats.totalCharges)}
                      </div>
                      <div className="mt-0.5 text-slate-500">
                        {batch.dyeingRate || batch.input?.dyeingRate ? (
                          <span>
                            {rupees(batch.dyeingRate || batch.input?.dyeingRate)}/qty
                            {batch.weightLossPct || batch.input?.weightLossPct ? (
                              <span> • {batch.weightLossPct || batch.input?.weightLossPct}% loss</span>
                            ) : null}
                          </span>
                        ) : (
                          <span>{rupees(batch.totalExpenses || 0)}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px]">
                        <span className="text-slate-500">
                          Paid: <b className="text-emerald-700">{rupees(paymentStats.totalPaid)}</b>
                        </span>
                        <span className="text-slate-300">•</span>
                        <span className="text-slate-500">
                          Due:{' '}
                          <b className={paymentStats.balanceDue > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                            {rupees(paymentStats.balanceDue)}
                          </b>
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2.5">
                      <div className="text-[10px] font-semibold tracking-wider text-emerald-700 uppercase">
                        Finished Goods Output
                      </div>
                      <div className="mt-0.5 space-y-1">
                        {(batch.output || []).map((out, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="mr-1 truncate font-medium text-slate-800">
                              {out.description}
                            </span>
                            <span className="shrink-0 font-mono font-bold text-emerald-800">
                              {out.qty} Qty ({rupees(out.unitCost || 0)}/qty)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Add Button */}
      <button
        type="button"
        onClick={handleOpenNew}
        aria-label="New Dyeing Batch"
        title="New Dyeing Batch"
        className="no-print fixed right-5 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white shadow-xl transition hover:bg-slate-800 focus-visible:outline-none active:scale-95 lg:bottom-6"
      >
        <Plus className="size-6 stroke-[2.5]" aria-hidden />
      </button>

      {/* Modals */}
      <DyeingBatchModal
        open={isModalOpen}
        onClose={handleCloseModal}
        initialBatch={editingBatch}
        existingBatches={data.batches}
        shortcuts={data.shortcuts}
        bankAccounts={data.bankAccounts}
        stockMap={data.stockMap}
        purchaseBills={data.purchaseBills}
        dyers={data.dyers}
        onSaved={handleSaved}
      />

      <DyeingChallanModal open={isChallanOpen} onClose={() => setIsChallanOpen(false)} batch={challanBatch} />

      <DyeingCompletionModal
        open={isCompletionOpen}
        onClose={() => {
          setIsCompletionOpen(false);
          setCompletingBatch(null);
        }}
        batch={completingBatch}
        shortcuts={data.shortcuts}
        stockMap={data.stockMap}
        onCompleted={loadData}
      />

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
