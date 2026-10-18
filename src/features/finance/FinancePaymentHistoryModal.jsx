import { useState, useEffect, useMemo } from 'react';
import { Receipt, Trash2, Banknote, Landmark } from 'lucide-react';
import { accountLabelWithBank, CASH_LABEL } from '@/core/accountLabel';
import { db } from '@/core/db';
import { modeLabel } from '@/core/paymentMethods';
import { Badge, Modal, Button, EmptyState, IconButton, useFeedback } from '@/ui';
import { formatCurrency, formatDateShort } from '@/core/format';
import { calculateFinanceStats, findLoanPaymentIndex, removeLoanPayment } from './financeLogic';

// Loan payments are Cash or Account; older ones stored as 'UPI' are shown as Account (modeLabel)
const ICONS = {
  Cash: Banknote,
  Account: Landmark,
};

export default function FinancePaymentHistoryModal({ record, onClose, onUpdate }) {
  const { confirm, toast } = useFeedback();
  const [bankAccounts, setBankAccounts] = useState([]);

  useEffect(() => {
    db.getAllBankAccounts().then(setBankAccounts).catch(console.error);
  }, []);

  const bankMap = useMemo(() => {
    const map = {};
    bankAccounts.forEach((b) => {
      map[b.id] = b;
    });
    return map;
  }, [bankAccounts]);

  if (!record) return null;

  const stats = calculateFinanceStats(record);
  const payments = [...(record.payments || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  // `payment` is the listed object itself: older payments have no id, so only its own position is removed
  const handleDelete = async (payment) => {
    const ok = await confirm({
      title: 'Delete Payment?',
      message: 'Are you sure you want to remove this payment?',
      tone: 'danger',
      confirmText: 'Delete',
    });

    if (!ok) return;

    const updatedRecord = removeLoanPayment(record, findLoanPaymentIndex(record, payment));
    if (!updatedRecord) {
      toast('Error', 'This payment could not be found. Please reopen the history and try again.', 'error');
      return;
    }
    try {
      await db.saveFinanceRecord(updatedRecord);
      toast('Deleted', 'Payment record has been deleted', 'success');
      onUpdate(updatedRecord);
    } catch (e) {
      toast('Error', 'Failed to delete payment', 'error');
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Payment History"
      size="md"
      footer={
        <Button variant="neutral" onClick={onClose} className="w-full sm:w-auto">
          Close
        </Button>
      }
    >
      <div className="mb-4 rounded-2xl border border-line bg-slate-50/80 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Lender</div>
            <div className="font-bold break-words text-brand-800">{record.lenderName}</div>
            {record.phone && <div className="mt-0.5 font-mono text-xs text-slate-600">{record.phone}</div>}
          </div>
          {stats.isSettled ? (
            <Badge status="Settled" />
          ) : (
            <div className="shrink-0 text-right">
              <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Balance Due</div>
              <div className="text-sm font-extrabold text-red-600 tabular-nums">
                ₹{formatCurrency(stats.balancePayable)}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-1 border-t border-line pt-2.5 text-xs tabular-nums sm:grid-cols-3 sm:gap-2">
          <div>
            <span className="text-slate-500">Principal:</span>{' '}
            <span className="font-bold text-brand-800">₹{formatCurrency(record.principal)}</span>
          </div>
          <div>
            <span className="text-slate-500">Total Due:</span>{' '}
            <span className="font-bold text-amber-700">₹{formatCurrency(stats.totalPayable)}</span>
          </div>
          <div className="sm:text-right">
            <span className="text-slate-500">Paid:</span>{' '}
            <span className="font-bold text-emerald-700">₹{formatCurrency(stats.totalPaid)}</span>
          </div>
        </div>
      </div>

      {payments.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No Payments Yet"
          message="Payments you record for this loan will appear here."
        />
      ) : (
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {payments.map((p, i) => {
            // the account the money actually left decides the label (as in the balances)
            const mode = p.sourceAccount
              ? p.sourceAccount === 'cash'
                ? 'Cash'
                : 'Account'
              : modeLabel(p.mode);
            const Icon = ICONS[mode] || Receipt;
            return (
              <div
                key={p.id ?? `${p.date}-${p.amount}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white p-3 shadow-card"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                      mode === 'Cash'
                        ? 'bg-emerald-50 text-emerald-600 ring-emerald-200'
                        : 'bg-sky-50 text-sky-600 ring-sky-200'
                    }`}
                  >
                    <Icon className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 font-bold text-brand-800">
                      <span>{mode} Payment</span>
                      <Badge tone={mode === 'Cash' ? 'success' : 'info'}>
                        {!p.sourceAccount || p.sourceAccount === 'cash'
                          ? CASH_LABEL
                          : bankMap[p.sourceAccount]
                            ? accountLabelWithBank(bankMap[p.sourceAccount])
                            : 'Bank Account'}
                      </Badge>
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">{formatDateShort(p.date)}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:gap-4">
                  <div className="font-display text-base font-extrabold whitespace-nowrap text-emerald-700 tabular-nums sm:text-lg">
                    ₹{formatCurrency(p.amount)}
                  </div>
                  <IconButton
                    icon={Trash2}
                    onClick={() => handleDelete(p)}
                    variant="outlineDanger"
                    label="Delete Payment"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
