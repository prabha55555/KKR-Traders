import { Banknote, Landmark, Plus, Receipt, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { CASH_LABEL } from '@/core/accountLabel';
import { formatCurrency, formatDateIN } from '@/core/format';
import { modeLabel } from '@/core/paymentMethods';
import { Badge, Button, EmptyState, Modal, useFeedback } from '@/ui';

import { calcCombingBatchPaymentStats } from './combingLogic';
import { deleteCombingBatchPayment } from './combingService';

export function CombingPaymentHistoryModal({ open, batch, onClose, onPaymentDeleted, onOpenAddPayment }) {
  const { confirm, toast } = useFeedback();
  const [currentBatch, setCurrentBatch] = useState(batch);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    setCurrentBatch(batch);
  }, [batch]);

  const stats = useMemo(() => {
    return calcCombingBatchPaymentStats(currentBatch);
  }, [currentBatch]);

  const payments = useMemo(() => {
    const list = Array.isArray(currentBatch?.payments) ? [...currentBatch.payments] : [];
    return list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [currentBatch?.payments]);

  if (!open || !currentBatch) return null;

  const handleDeletePayment = async (payment) => {
    if (deletingId) return;
    const ok = await confirm({
      title: `Delete Payment of ₹${formatCurrency(payment.amount)}?`,
      message: `Are you sure you want to remove this ${modeLabel(payment.mode)} payment recorded on ${formatDateIN(
        payment.date,
      )}? The batch balance due will be restored.`,
      tone: 'danger',
      confirmText: 'Delete Payment',
    });

    if (!ok) return;

    setDeletingId(payment.id);
    try {
      const targetBatchId = currentBatch.batchId || currentBatch.id;
      const updatedBatch = await deleteCombingBatchPayment(targetBatchId, payment.id);
      setCurrentBatch(updatedBatch);
      toast('Payment Deleted', `Payment of ₹${formatCurrency(payment.amount)} removed.`, 'success');
      if (onPaymentDeleted) {
        onPaymentDeleted(updatedBatch);
      }
    } catch (err) {
      console.error('Failed to delete combing payment:', err);
      toast('Delete Failed', err.message || 'Could not delete payment.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Stored modes are 'Cash' | 'Bank' | legacy 'UPI': everything but Cash is shown as Account.
  const getModeBadge = (mode, bankName) => {
    if (modeLabel(mode) === 'Account') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 ring-1 ring-blue-200">
          <Landmark className="size-3 text-blue-600" />
          <span>Account{bankName ? `: ${bankName}` : ''}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200">
        <Banknote className="size-3 text-emerald-600" />
        <span>{CASH_LABEL}</span>
      </span>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Payment History — Batch ${batch.batchId}`}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="neutral" onClick={onClose} className="max-sm:flex-1">
            Close
          </Button>
          {onOpenAddPayment && (
            <Button
              variant="success"
              icon={Plus}
              onClick={() => {
                onClose();
                onOpenAddPayment(batch);
              }}
              className="max-sm:flex-1"
            >
              Add Payment
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Processor & Balance Header Card */}
        <div className="space-y-3 rounded-xl border border-slate-200/90 bg-slate-50/80 p-3.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                Mill / Processing Unit
              </div>
              <div className="text-sm font-bold wrap-anywhere text-slate-900">{batch.processorName}</div>
              {batch.processorPhone && (
                <div className="mt-0.5 font-mono text-xs text-slate-500">{batch.processorPhone}</div>
              )}
            </div>

            {/* colour from the app-wide status map: paid green, partial yellow, due red */}
            <Badge
              status={stats.isPaid ? 'Fully Paid' : stats.isPartial ? 'Partially Paid' : 'Payment Due'}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-2.5 text-xs">
            <div>
              <div className="text-[10px] tracking-wider text-slate-500 uppercase">Processing Charges</div>
              <div className="mt-0.5 font-bold text-slate-900 tabular-nums">
                ₹{formatCurrency(stats.totalCharges)}
              </div>
            </div>
            <div>
              <div className="text-[10px] tracking-wider text-slate-500 uppercase">Total Paid</div>
              <div className="mt-0.5 font-bold text-emerald-700 tabular-nums">
                ₹{formatCurrency(stats.totalPaid)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] tracking-wider text-slate-500 uppercase">Balance Due</div>
              <div
                className={`mt-0.5 font-display font-extrabold tabular-nums ${
                  stats.balanceDue > 0 ? 'text-red-600' : 'text-emerald-700'
                }`}
              >
                ₹{formatCurrency(stats.balanceDue)}
              </div>
            </div>
          </div>
        </div>

        {/* Payments List */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-bold tracking-wider text-slate-700 uppercase">
              Payments Log ({payments.length})
            </h4>
          </div>

          {payments.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No payments recorded yet"
              message="Record cash or account payments made to the processor for this combing batch."
              action={
                onOpenAddPayment ? (
                  <Button
                    variant="success"
                    icon={Plus}
                    onClick={() => {
                      onClose();
                      onOpenAddPayment(batch);
                    }}
                  >
                    Make First Payment
                  </Button>
                ) : null
              }
            />
          ) : (
            <div className="space-y-2.5">
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs transition hover:border-slate-300 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-extrabold text-emerald-700 tabular-nums">
                        ₹{formatCurrency(p.amount)}
                      </span>
                      {getModeBadge(p.mode, p.bankAccountName)}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                      <span>Paid on {formatDateIN(p.date)}</span>
                      {p.reference && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                          Ref: {p.reference}
                        </span>
                      )}
                      {p.notes && <span className="text-slate-600 italic">"{p.notes}"</span>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-end">
                    <Button
                      size="sm"
                      variant="outlineDanger"
                      icon={Trash2}
                      loading={deletingId === p.id}
                      onClick={() => handleDeletePayment(p)}
                      title="Delete payment"
                    >
                      {deletingId === p.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
