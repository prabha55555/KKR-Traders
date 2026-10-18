import { useState, useEffect, useMemo } from 'react';
import { Receipt, X, Banknote, Landmark, CheckCircle2 } from 'lucide-react';
import { accountLabelWithBank, CASH_LABEL } from '@/core/accountLabel';
import { db } from '@/core/db';
import { modeLabel } from '@/core/paymentMethods';
import { Modal, Button, EmptyState, IconButton, useFeedback } from '@/ui';
import { formatCurrency, formatDateShort } from '@/core/format';
import { calculateFinanceStats } from './financeLogic';

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

  const handleDelete = async (paymentId) => {
    const ok = await confirm({
      title: 'Delete Payment?',
      message: 'Are you sure you want to remove this payment?',
      tone: 'danger',
      confirmText: 'Delete',
    });

    if (!ok) return;

    try {
      const updatedRecord = {
        ...record,
        payments: record.payments.filter((p) => p.id !== paymentId),
      };
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
        <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
          Close
        </Button>
      }
    >
      <div className="mb-4 rounded-xl border border-line bg-slate-50/80 p-3.5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Lender</div>
            <div className="font-bold text-slate-900">{record.lenderName}</div>
            {record.phone && <div className="mt-0.5 font-mono text-xs text-slate-600">{record.phone}</div>}
          </div>
          {stats.isSettled ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Settled
            </span>
          ) : (
            <div className="text-right">
              <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Balance Due</div>
              <div className="text-sm font-extrabold text-emerald-800">
                ₹{formatCurrency(stats.balancePayable)}
              </div>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-200/70 pt-2.5 text-xs">
          <div>
            <span className="text-slate-500">Principal:</span>{' '}
            <span className="font-bold text-indigo-950">₹{formatCurrency(record.principal)}</span>
          </div>
          <div>
            <span className="text-slate-500">Total Due:</span>{' '}
            <span className="font-bold text-amber-800">₹{formatCurrency(stats.totalPayable)}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-500">Paid:</span>{' '}
            <span className="font-bold text-blue-700">₹{formatCurrency(stats.totalPaid)}</span>
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
          {payments.map((p) => {
            // the account the money actually left decides the label (as in the balances)
            const mode = p.sourceAccount
              ? p.sourceAccount === 'cash'
                ? 'Cash'
                : 'Account'
              : modeLabel(p.mode);
            const Icon = ICONS[mode] || Receipt;
            return (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-line bg-white p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                      mode === 'Cash'
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-blue-50 text-blue-700 ring-blue-200'
                    }`}
                  >
                    <Icon className="size-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 font-bold text-slate-900">
                      <span>{mode} Payment</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                        {!p.sourceAccount || p.sourceAccount === 'cash'
                          ? CASH_LABEL
                          : bankMap[p.sourceAccount]
                            ? accountLabelWithBank(bankMap[p.sourceAccount])
                            : 'Bank Account'}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs font-medium text-slate-500">{formatDateShort(p.date)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="font-display text-lg font-extrabold text-blue-700 tabular-nums">
                    ₹{formatCurrency(p.amount)}
                  </div>
                  <IconButton
                    icon={X}
                    onClick={() => handleDelete(p.id)}
                    className="text-slate-400 hover:bg-red-50 hover:text-red-600"
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
