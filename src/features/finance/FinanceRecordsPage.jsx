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
  Scale,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { accountLabel, accountLabelWithBank } from '@/core/accountLabel';
import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Page,
  StatCard,
  StatGrid,
  useFeedback,
} from '@/ui';
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

/** "Receive Loan In": Cash in Hand (green) or the bank account (blue), the same colours as everywhere else. */
function LoanAccount({ record, bankMap }) {
  const isCash = !record.depositAccount || record.depositAccount === 'cash';
  if (isCash) return <Badge tone="success">Cash in Hand</Badge>;
  const bank = bankMap[record.depositAccount];
  return (
    <span title={bank ? accountLabelWithBank(bank) : 'Bank Account'} className="inline-flex max-w-full">
      <Badge tone="info">{bank ? accountLabel(bank) : 'Bank Account'}</Badge>
    </span>
  );
}

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
          <Badge status="Settled" />
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

  /** History (view) · Add Payment (pay) · Edit · Delete, in their action colours. */
  const rowActions = (e) => (
    <>
      <IconButton icon={History} onClick={() => setHistoryRecord(e)} label="History" variant="outlineInfo" />
      <IconButton
        icon={CreditCard}
        onClick={() => setPaymentRecord(e)}
        label="Add Payment"
        variant="outlineSuccess"
      />
      <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" variant="edit" />
      <IconButton icon={Trash2} onClick={() => void remove(e)} label="Delete" variant="outlineDanger" />
    </>
  );

  const columns = [
    {
      key: 'lender',
      header: 'Lender',
      className: 'min-w-32 font-bold break-words text-brand-800',
      value: (e) => e.lenderName,
    },
    {
      key: 'phone',
      header: 'Phone',
      nowrap: true,
      className: 'font-mono text-xs text-slate-600',
      value: (e) => e.phone,
    },
    {
      key: 'start',
      header: 'Start Date',
      nowrap: true,
      className: 'text-slate-600',
      value: (e) => formatDateShort(e.startDate),
    },
    {
      key: 'end',
      header: 'End Date',
      nowrap: true,
      className: 'text-slate-600',
      value: (e) => (e.endDate ? formatDateShort(e.endDate) : 'Ongoing'),
    },
    {
      key: 'totalMonths',
      header: 'Total Months',
      align: 'center',
      nowrap: true,
      className: 'font-semibold text-slate-800 tabular-nums',
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
      align: 'right',
      className: 'font-bold text-amber-700',
      value: (e) => `${e.rate}%`,
    },
    {
      key: 'principal',
      header: 'Principal',
      align: 'right',
      className: 'font-display font-bold text-brand-800',
      value: (e) => rs(toNum(e.principal)),
    },
    {
      key: 'receiveLoanIn',
      header: 'Receive Loan In',
      render: (e) => <LoanAccount record={e} bankMap={bankMap} />,
    },
    {
      key: 'interest',
      header: 'Interest Accrued',
      align: 'right',
      className: 'font-display font-bold text-amber-700',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalInterestAccrued);
      },
    },
    {
      key: 'paid',
      header: 'Paid',
      align: 'right',
      className: 'font-display font-bold text-emerald-700',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalPaid);
      },
    },
    {
      key: 'balance',
      header: 'Balance Payable',
      align: 'right',
      className: 'font-display font-extrabold text-red-600',
      render: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);

        return (
          <div className="flex flex-col items-end">
            <span>{rs(stats.balancePayable)}</span>
            {stats.isOverdue && (
              <div className="mt-1">
                <Badge status="Overdue">Overdue: {rs(stats.overdueAmount)}</Badge>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'progress',
      header: 'Progress',
      className: 'min-w-[120px]',
      render: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return renderProgress(stats, e);
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      nowrap: true,
      render: (e) => <div className="flex items-center justify-center gap-2">{rowActions(e)}</div>,
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold break-words text-brand-800">{e.lenderName}</div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-600">
                      <Phone className="size-3 text-slate-400" aria-hidden />
                      {e.phone}
                    </div>
                    <div className="mt-1 text-[11px] font-bold text-amber-700">Rate: {e.rate}% / mo</div>
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
                  <div className="grid shrink-0 grid-cols-2 gap-1.5">{rowActions(e)}</div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-line bg-slate-50/80 p-2.5 tabular-nums">
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Principal
                    </div>
                    <div className="font-display font-bold text-brand-800">{rs(toNum(e.principal))}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Receive Loan In
                    </div>
                    <div className="mt-0.5">
                      <LoanAccount record={e} bankMap={bankMap} />
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
                    <div className="font-display font-bold text-emerald-700">{rs(stats.totalPaid)}</div>
                  </div>
                  <div className="col-span-2 mt-0.5 border-t border-slate-200/60 pt-1.5">
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Balance Payable
                    </div>
                    <div className="font-display text-base font-black text-red-600">
                      {rs(stats.balancePayable)}
                    </div>
                  </div>
                </div>
                {stats.isOverdue && (
                  <div className="mt-1 flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 tabular-nums">
                    <AlertCircle className="size-4 shrink-0" aria-hidden />
                    Overdue: {rs(stats.overdueAmount)}
                  </div>
                )}

                <div className="mt-2 rounded-xl border border-line bg-white p-2">
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
                  <Button variant="outlineInfo" size="sm" onClick={() => navigate('/finance/settled')}>
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
        <Button variant="primary" icon={Plus} onClick={openAdd} className="max-sm:hidden">
          Add Record
        </Button>
      }
    >
      <StatGrid cols={4} className="mb-5">
        <StatCard icon={Landmark} label="Total Principal" value={rs(totals.principal)} tone="brand" />
        <StatCard icon={Sigma} label="Total Interest" value={rs(totals.interest)} tone="warning" />
        <StatCard icon={CreditCard} label="Total Paid" value={rs(totals.paid)} tone="success" />
        <StatCard icon={Scale} label="Balance Payable" value={rs(totals.balance)} tone="danger" />
      </StatGrid>

      {totals.overdue > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-red-600 ring-1 ring-red-200 ring-inset">
              <AlertCircle className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-red-800">Overdue Payments Detected</h3>
              <p className="mt-0.5 text-xs font-medium text-red-700">
                Some of your interest payments are past due.
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-bold tracking-wider text-red-600 uppercase">Total Overdue</div>
            <div className="font-display text-lg font-extrabold text-red-600 tabular-nums">
              {rs(totals.overdue)}
            </div>
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
