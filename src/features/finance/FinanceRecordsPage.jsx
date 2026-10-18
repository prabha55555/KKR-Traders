import {
  Landmark,
  Plus,
  Sigma,
  Trash2,
  Edit,
  CreditCard,
  AlertCircle,
  History,
  Phone,
  CheckCircle2,
  Banknote,
  Building2,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { accountLabel, accountLabelWithBank } from '@/core/accountLabel';
import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Button, DataTable, EmptyState, ErrorState, Page, IconButton, useFeedback, Badge } from '@/ui';
import KpiRow from '../overview/components/KpiRow';
import InkStat from '../overview/components/InkStat';
import SkeletonRows from '../overview/components/SkeletonRows';
import FilterBar from '../overview/components/FilterBar';
import ShowMore from '../overview/components/ShowMore';
import FloatingAddButton from '../overview/components/FloatingAddButton';
import { usePagedRows } from '../overview/components/paging';
import { calculateFinanceStats, emptyFinanceForm, validateFinanceForm } from './financeLogic';
import FinanceFormModal from './FinanceFormModal';
import AddFinancePaymentModal from './AddFinancePaymentModal';
import FinancePaymentHistoryModal from './FinancePaymentHistoryModal';
import { todayISO } from '@/core/format';

const rs = (n) => `Rs. ${formatCurrency(n)}`;

export default function FinanceRecordsPage() {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [calcDate, setCalcDate] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [paymentRecord, setPaymentRecord] = useState(null);
  const [historyRecord, setHistoryRecord] = useState(null);

  const { loading, error, reload } = useFocusLoad(async () => {
    try {
      const [recs, banks] = await Promise.all([
        db.getAllFinanceRecords(),
        db.getAllBankAccounts().catch(() => []),
      ]);
      setRecords(recs);
      setBankAccounts(banks || []);
    } catch (e) {
      console.error('Error loading finance records:', e);
      toast('Error', 'Failed to load finance records', 'error');
      throw e;
    }
  });

  const bankMap = useMemo(() => {
    const map = {};
    (bankAccounts || []).forEach((b) => {
      map[b.id] = b;
    });
    return map;
  }, [bankAccounts]);

  const ongoingAll = records.filter((r) => !calculateFinanceStats(r, calcDate || undefined).isSettled);
  const settledCount = records.filter(
    (r) => calculateFinanceStats(r, calcDate || undefined).isSettled,
  ).length;

  const shown = ongoingAll.filter(
    (r) =>
      !searchTerm ||
      r.lenderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.phone.includes(searchTerm),
  );

  const paged = usePagedRows(shown, searchTerm);

  const remove = async (record) => {
    const ok = await confirm({
      title: 'Are you sure?',
      message: "You won't be able to revert this!",
      tone: 'danger',
      confirmText: 'Yes, delete it!',
    });
    if (!ok) return;
    try {
      await db.deleteFinanceRecord(record.id);
      toast('Deleted!', 'Record has been deleted.', 'success');
      await reload();
    } catch (e) {
      toast('Error', 'Failed to delete record.', 'error');
    }
  };

  const save = async () => {
    const err = validateFinanceForm(form);
    if (err) {
      toast('Warning', err, 'warning');
      return;
    }
    setSaving(true);
    try {
      const recordToSave = {
        ...form,
        principal: parseFloat(form.principal),
        rate: parseFloat(form.rate),
      };
      await db.saveFinanceRecord(recordToSave);
      toast('Success', `Finance record saved successfully.`, 'success');
      setForm(null);
      await reload();
    } catch (e) {
      console.error('Save error:', e);
      toast('Error', 'Failed to save record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openAdd = () => setForm(emptyFinanceForm(todayISO()));
  const openEdit = (record) => setForm({ ...record });

  const totals = shown.reduce(
    (acc, r) => {
      const targetDate = calcDate || undefined;
      const stats = calculateFinanceStats(r, targetDate);

      acc.principal += toNum(r.principal);
      acc.interest += stats.totalInterestAccrued;
      acc.total += stats.totalPayable;
      acc.paid += stats.totalPaid;
      acc.balance += stats.balancePayable;
      acc.overdue += stats.overdueAmount;
      return acc;
    },
    { principal: 0, interest: 0, total: 0, paid: 0, balance: 0, overdue: 0 },
  );

  const renderProgress = (stats, record) => {
    const start = new Date(record.startDate);
    const totalBlocks = Math.max(stats.totalMonths, stats.monthsElapsed, 1);

    if (stats.isSettled) {
      return (
        <div className="flex flex-col items-start gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
            <CheckCircle2 className="size-3 text-emerald-600" />
            Settled
          </span>
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {Array.from({ length: totalBlocks }).map((_, i) => {
              const due = new Date(start);
              due.setMonth(start.getMonth() + i + 1);
              const dateStr = due.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

              return (
                <div
                  key={i}
                  className="flex h-5 items-center justify-center rounded-[3px] bg-emerald-500 px-1.5 text-[9px] font-bold text-white"
                  title="Settled"
                >
                  {dateStr}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    const paidMonths =
      stats.expectedMonthlyInterest > 0
        ? Math.min(Math.floor(stats.totalPaid / stats.expectedMonthlyInterest), totalBlocks)
        : 0;

    return (
      <div className="flex max-w-[220px] flex-wrap gap-1">
        {Array.from({ length: totalBlocks }).map((_, i) => {
          const isPaid = i < paidMonths;
          const isOverdue = i >= paidMonths && i < stats.monthsElapsed;

          const due = new Date(start);
          due.setMonth(start.getMonth() + i + 1);
          const dateStr = due.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

          return (
            <div
              key={i}
              className={`flex h-5 items-center justify-center rounded-[3px] px-1.5 text-[9px] font-bold ${
                isPaid
                  ? 'bg-emerald-500 text-white'
                  : isOverdue
                    ? 'bg-red-500 text-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.1)]'
                    : 'border border-slate-200 bg-slate-100 text-slate-400'
              }`}
              title={isPaid ? 'Paid' : isOverdue ? 'Overdue' : 'Upcoming'}
            >
              {dateStr}
            </div>
          );
        })}
      </div>
    );
  };

  const columns = [
    {
      key: 'lender',
      header: 'Lender',
      className: 'whitespace-nowrap font-bold text-slate-900',
      value: (e) => e.lenderName,
    },
    {
      key: 'phone',
      header: 'Phone',
      className: 'whitespace-nowrap text-slate-600 font-mono text-xs',
      value: (e) => e.phone,
    },
    {
      key: 'start',
      header: 'Start Date',
      className: 'whitespace-nowrap text-slate-600',
      value: (e) => formatDateShort(e.startDate),
    },
    {
      key: 'end',
      header: 'End Date',
      className: 'whitespace-nowrap text-slate-600',
      value: (e) => (e.endDate ? formatDateShort(e.endDate) : 'Ongoing'),
    },
    {
      key: 'totalMonths',
      header: 'Total Months',
      align: 'center',
      className: 'whitespace-nowrap font-semibold text-slate-800 tabular-nums',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        const m = e.endDate ? stats.totalMonths : stats.monthsElapsed;
        if (m === 0) return '< 1 Month';
        return `${m} ${m === 1 ? 'Month' : 'Months'}${e.endDate ? '' : ' (Elapsed)'}`;
      },
    },
    {
      key: 'rate',
      header: 'Rate/Mo',
      className: 'whitespace-nowrap font-bold text-amber-800 tabular-nums',
      value: (e) => `${e.rate}%`,
    },
    {
      key: 'principal',
      header: 'Principal',
      align: 'right',
      className: 'font-display font-bold text-indigo-950 tabular-nums whitespace-nowrap',
      value: (e) => rs(toNum(e.principal)),
    },
    {
      key: 'receiveLoanIn',
      header: 'Receive Loan In',
      className: 'whitespace-nowrap',
      render: (e) => {
        const isCash = !e.depositAccount || e.depositAccount === 'cash';
        const bank = !isCash ? bankMap[e.depositAccount] : null;
        return isCash ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <Banknote className="size-3.5" />
            Cash in Hand
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200"
            title={bank ? accountLabelWithBank(bank) : 'Bank Account'}
          >
            <Building2 className="size-3.5" />
            {bank ? accountLabel(bank) : 'Bank Account'}
          </span>
        );
      },
    },
    {
      key: 'interest',
      header: 'Interest Accrued',
      align: 'right',
      className: 'font-display font-bold text-amber-700 tabular-nums whitespace-nowrap',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalInterestAccrued);
      },
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      className: 'font-display font-bold text-blue-700 tabular-nums whitespace-nowrap',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalPaid);
      },
    },
    {
      key: 'balance',
      header: 'Balance Payable',
      align: 'right',
      className: 'font-display font-extrabold text-emerald-800 tabular-nums whitespace-nowrap',
      render: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);

        return (
          <div className="flex flex-col items-end">
            <span>{rs(stats.balancePayable)}</span>
            {stats.isOverdue && (
              <div className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-red-500">
                <AlertCircle className="size-3" />
                Overdue: {rs(stats.overdueAmount)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'progress',
      header: 'Progress',
      className: 'whitespace-nowrap min-w-[120px]',
      render: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return renderProgress(stats, e);
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      render: (e) => (
        <div className="flex items-center justify-center gap-2">
          <IconButton
            icon={History}
            onClick={() => setHistoryRecord(e)}
            label="History"
            className="text-slate-600 hover:bg-slate-50 hover:text-brand-700"
          />
          <IconButton
            icon={CreditCard}
            onClick={() => setPaymentRecord(e)}
            label="Add Payment"
            className="text-blue-600 hover:bg-blue-50 hover:text-blue-800"
          />
          <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" />
          <IconButton
            icon={Trash2}
            onClick={() => void remove(e)}
            label="Delete"
            className="text-red-500 hover:bg-red-50 hover:text-red-700"
          />
        </div>
      ),
    },
  ];

  let body;
  if (loading) body = <SkeletonRows count={4} height="h-20" />;
  else if (error) body = <ErrorState message={error} onRetry={() => void reload()} />;
  else
    body = (
      <>
        <DataTable
          columns={columns}
          rows={paged.rows}
          rowKey={(e) => e.id}
          renderCard={(e) => {
            const stats = calculateFinanceStats(e, calcDate || undefined);
            return (
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-slate-900">{e.lenderName}</div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-600">
                      <Phone className="size-3 text-slate-400" />
                      {e.phone}
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-amber-800">Rate: {e.rate}% / mo</div>
                    <div className="mt-1 space-y-0.5 text-[11px] font-medium text-slate-600">
                      <div>
                        Start:{' '}
                        <span className="font-semibold text-slate-800">{formatDateShort(e.startDate)}</span>
                      </div>
                      {e.endDate ? (
                        <div>
                          End:{' '}
                          <span className="font-semibold text-slate-800">{formatDateShort(e.endDate)}</span>
                        </div>
                      ) : null}
                      <div>
                        Total Months:{' '}
                        <span className="font-semibold text-slate-800">
                          {e.endDate
                            ? `${stats.totalMonths || '< 1'} Mo`
                            : `${stats.monthsElapsed || '< 1'} Mo (Elapsed)`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <IconButton
                      icon={History}
                      onClick={() => setHistoryRecord(e)}
                      label="History"
                      className="text-slate-500 hover:text-brand-700"
                    />
                    <IconButton
                      icon={CreditCard}
                      onClick={() => setPaymentRecord(e)}
                      label="Add Payment"
                      className="text-blue-600 hover:text-blue-800"
                    />
                    <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" />
                    <IconButton
                      icon={Trash2}
                      onClick={() => void remove(e)}
                      label="Delete"
                      className="text-red-500 hover:text-red-700"
                    />
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-line bg-slate-50/80 p-2.5">
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Principal
                    </div>
                    <div className="font-display font-bold text-indigo-950">{rs(toNum(e.principal))}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Receive Loan In
                    </div>
                    <div className="mt-0.5 text-xs font-semibold">
                      {!e.depositAccount || e.depositAccount === 'cash' ? (
                        <span className="flex items-center gap-1 font-semibold text-emerald-700">
                          <Banknote className="size-3.5" /> Cash in Hand
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-semibold text-blue-700">
                          <Building2 className="size-3.5" />{' '}
                          {bankMap[e.depositAccount]
                            ? accountLabel(bankMap[e.depositAccount])
                            : 'Bank Account'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Accrued Interest
                    </div>
                    <div className="font-display font-bold text-amber-700">
                      {rs(stats.totalInterestAccrued)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Total Paid
                    </div>
                    <div className="font-display font-bold text-blue-700">{rs(stats.totalPaid)}</div>
                  </div>
                  <div className="col-span-2 mt-0.5 border-t border-slate-200/60 pt-1.5">
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Balance Payable
                    </div>
                    <div className="font-display text-base font-black text-emerald-800">
                      {rs(stats.balancePayable)}
                    </div>
                  </div>
                </div>
                {stats.isOverdue && (
                  <div className="mt-1 flex items-center gap-1.5 rounded-md border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600">
                    <AlertCircle className="size-4" />
                    Overdue: {rs(stats.overdueAmount)}
                  </div>
                )}

                <div className="mt-2 rounded-lg border border-line bg-white p-2 shadow-sm">
                  <div className="mb-1.5 text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                    Interest Payment Progress
                  </div>
                  {renderProgress(stats, e)}
                </div>
              </div>
            );
          }}
          empty={
            <EmptyState
              icon={Landmark}
              title="No ongoing finance records."
              message={
                settledCount > 0
                  ? `All current loans are settled! You have ${settledCount} settled record${settledCount > 1 ? 's' : ''}.`
                  : 'Borrowings will show up here. Add a new record to get started.'
              }
              action={
                settledCount > 0 ? (
                  <Button variant="outline" size="sm" onClick={() => navigate('/finance/settled')}>
                    View Settled Records ({settledCount})
                  </Button>
                ) : undefined
              }
            />
          }
        />
        <ShowMore pager={paged.pager} noun="records" />
      </>
    );

  return (
    <Page
      title="Finance Records"
      icon={Landmark}
      actions={
        <Button icon={Plus} onClick={openAdd} className="max-sm:hidden">
          Add Record
        </Button>
      }
    >
      <KpiRow cols={4}>
        <InkStat icon={Landmark} label="Total Principal" value={rs(totals.principal)} />
        <InkStat icon={Sigma} label="Total Interest" value={rs(totals.interest)} />
        <InkStat icon={CreditCard} label="Total Paid" value={rs(totals.paid)} />
        <InkStat icon={Sigma} label="Balance Payable" value={rs(totals.balance)} />
      </KpiRow>

      {totals.overdue > 0 && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-red-100 text-red-600">
              <AlertCircle className="size-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-red-900">Overdue Payments Detected</h3>
              <p className="mt-0.5 text-xs font-medium text-red-700">
                Some of your interest payments are past due.
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold tracking-wider text-red-500 uppercase">Total Overdue</div>
            <div className="font-display text-lg font-extrabold text-red-600">{rs(totals.overdue)}</div>
          </div>
        </div>
      )}
      <FilterBar
        date={calcDate}
        onDateChange={setCalcDate}
        text={searchTerm}
        onTextChange={setSearchTerm}
        textPlaceholder="Search by Lender or Phone..."
        dateLabel="Interest as of"
        onClear={() => {
          setSearchTerm('');
          setCalcDate('');
        }}
      />
      {body}
      <FloatingAddButton label="Add Record" onClick={openAdd} />
      <FinanceFormModal
        form={form}
        onChange={setForm}
        saving={saving}
        onClose={() => setForm(null)}
        onSave={() => void save()}
      />
      <AddFinancePaymentModal
        record={paymentRecord}
        onClose={() => setPaymentRecord(null)}
        onSave={async () => {
          setPaymentRecord(null);
          toast('Success', 'Payment recorded successfully', 'success');
          await reload();
        }}
      />
      <FinancePaymentHistoryModal
        record={historyRecord}
        onClose={() => setHistoryRecord(null)}
        onUpdate={async (updatedRecord) => {
          setHistoryRecord(updatedRecord);
          await reload();
        }}
      />
    </Page>
  );
}
