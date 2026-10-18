import {
  Landmark,
  Sigma,
  Trash2,
  Edit,
  CreditCard,
  History,
  Phone,
  CheckCircle2,
  CheckCheck,
  Banknote,
  Building2,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Button, DataTable, EmptyState, ErrorState, Page, IconButton, useFeedback } from '@/ui';
import KpiRow from '../overview/components/KpiRow';
import InkStat from '../overview/components/InkStat';
import SkeletonRows from '../overview/components/SkeletonRows';
import FilterBar from '../overview/components/FilterBar';
import ShowMore from '../overview/components/ShowMore';
import { usePagedRows } from '../overview/components/paging';
import { calculateFinanceStats, validateFinanceForm } from './financeLogic';
import FinanceFormModal from './FinanceFormModal';
import FinancePaymentHistoryModal from './FinancePaymentHistoryModal';
import FinanceNavTabs from './FinanceNavTabs';

const rs = (n) => `Rs. ${formatCurrency(n)}`;

export default function FinanceSettledRecordsPage() {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [calcDate, setCalcDate] = useState('');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
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

  const ongoingCount = records.filter(
    (r) => !calculateFinanceStats(r, calcDate || undefined).isSettled,
  ).length;
  const settledAll = records.filter((r) => calculateFinanceStats(r, calcDate || undefined).isSettled);

  const shown = settledAll.filter(
    (r) =>
      !searchTerm ||
      r.lenderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.phone.includes(searchTerm),
  );

  const paged = usePagedRows(shown, searchTerm);

  const remove = async (record) => {
    const ok = await confirm({
      title: 'Delete Settled Record?',
      message: 'This will remove the settled loan and its payment history.',
      tone: 'danger',
      confirmText: 'Yes, delete it',
    });
    if (!ok) return;
    try {
      await db.deleteFinanceRecord(record.id);
      toast('Deleted', 'Record has been removed.', 'success');
      await reload();
    } catch (e) {
      toast('Error', 'Failed to delete record.', 'error');
    }
  };

  const openEdit = (record) => setForm({ ...record });

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
      toast('Success', 'Record updated successfully.', 'success');
      setForm(null);
      await reload();
    } catch (e) {
      console.error('Save error:', e);
      toast('Error', 'Failed to save record.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totals = shown.reduce(
    (acc, r) => {
      const stats = calculateFinanceStats(r, calcDate || undefined);
      acc.count += 1;
      acc.principal += toNum(r.principal);
      acc.interestPaid += Math.max(0, stats.totalPaid - toNum(r.principal));
      acc.totalPaid += stats.totalPaid;
      return acc;
    },
    { count: 0, principal: 0, interestPaid: 0, totalPaid: 0 },
  );

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
        return `${m} ${m === 1 ? 'Month' : 'Months'}`;
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
      header: 'Principal Settled',
      align: 'right',
      className: 'font-display font-bold text-slate-800 tabular-nums whitespace-nowrap',
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
            title={bank ? `${bank.accountName} (${bank.bankName || ''})` : 'Bank Account'}
          >
            <Building2 className="size-3.5" />
            {bank ? bank.accountName : 'Bank Account'}
          </span>
        );
      },
    },
    {
      key: 'paid',
      header: 'Total Repaid',
      align: 'right',
      className: 'font-display font-extrabold text-blue-700 tabular-nums whitespace-nowrap',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalPaid);
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      className: 'whitespace-nowrap',
      render: () => (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="size-3.5 text-emerald-600" />
          Settled
        </span>
      ),
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
            label="Payment History"
            className="text-slate-600 hover:bg-slate-50 hover:text-brand-700"
          />
          <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit Record" />
          <IconButton
            icon={Trash2}
            onClick={() => void remove(e)}
            label="Delete Record"
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
                            : `${stats.monthsElapsed || '< 1'} Mo`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
                      <CheckCircle2 className="size-3 text-emerald-600" />
                      Settled
                    </span>
                    <IconButton
                      icon={History}
                      onClick={() => setHistoryRecord(e)}
                      label="History"
                      className="text-slate-500 hover:text-brand-700"
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
                      Principal Settled
                    </div>
                    <div className="font-display font-bold text-slate-800">{rs(toNum(e.principal))}</div>
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
                          {bankMap[e.depositAccount]?.accountName || 'Bank Account'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 mt-0.5 border-t border-slate-200/60 pt-1.5">
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Total Repaid
                    </div>
                    <div className="font-display text-base font-black text-blue-800">
                      {rs(stats.totalPaid)}
                    </div>
                  </div>
                </div>
              </div>
            );
          }}
          empty={
            <EmptyState
              icon={CheckCircle2}
              title="No settled records found."
              message="When loans are paid off in full, they will automatically appear here."
            />
          }
        />
        <ShowMore pager={paged.pager} noun="settled records" />
      </>
    );

  return (
    <Page title="Settled Finance Records" icon={CheckCircle2}>
      {/* Top navigation tabs */}
      <FinanceNavTabs />

      <KpiRow cols={4}>
        <InkStat icon={CheckCheck} label="Settled Loans" value={totals.count} />
        <InkStat icon={Landmark} label="Total Principal" value={rs(totals.principal)} tint="brand" />
        <InkStat icon={Sigma} label="Interest Repaid" value={rs(totals.interestPaid)} tint="amber" />
        <InkStat icon={CreditCard} label="Total Amount Repaid" value={rs(totals.totalPaid)} tint="emerald" />
      </KpiRow>

      <FilterBar
        date={calcDate}
        onDateChange={setCalcDate}
        text={searchTerm}
        onTextChange={setSearchTerm}
        textPlaceholder="Search settled records by Lender or Phone..."
        onClear={() => {
          setSearchTerm('');
          setCalcDate('');
        }}
      />

      {body}

      <FinanceFormModal
        form={form}
        onChange={setForm}
        saving={saving}
        onClose={() => setForm(null)}
        onSave={() => void save()}
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
