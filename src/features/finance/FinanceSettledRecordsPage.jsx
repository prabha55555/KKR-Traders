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
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';

import { accountLabel, accountLabelWithBank } from '@/core/accountLabel';
import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import {
  Badge,
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
import { usePagedRows } from '../overview/components/paging';
import { calculateFinanceStats, validateFinanceForm } from './financeLogic';
import FinanceFormModal from './FinanceFormModal';
import FinancePaymentHistoryModal from './FinancePaymentHistoryModal';

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
        return `${m} ${m === 1 ? 'Month' : 'Months'}`;
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
      header: 'Principal Settled',
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
      key: 'paid',
      header: 'Total Repaid',
      align: 'right',
      className: 'font-display font-extrabold text-emerald-700',
      value: (e) => {
        const stats = calculateFinanceStats(e, calcDate || undefined);
        return rs(stats.totalPaid);
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      nowrap: true,
      render: () => <Badge status="Settled" />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      nowrap: true,
      render: (e) => (
        <div className="flex items-center justify-center gap-2">
          <IconButton
            icon={History}
            onClick={() => setHistoryRecord(e)}
            label="Payment History"
            variant="outlineInfo"
          />
          <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit Record" variant="edit" />
          <IconButton
            icon={Trash2}
            onClick={() => void remove(e)}
            label="Delete Record"
            variant="outlineDanger"
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
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold break-words text-brand-800">{e.lenderName}</div>
                    <div className="mt-0.5 flex items-center gap-1 font-mono text-xs text-slate-600">
                      <Phone className="size-3 text-slate-400" aria-hidden />
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
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge status="Settled" />
                    <div className="flex gap-1.5">
                      <IconButton
                        icon={History}
                        onClick={() => setHistoryRecord(e)}
                        label="History"
                        variant="outlineInfo"
                      />
                      <IconButton icon={Edit} onClick={() => openEdit(e)} label="Edit" variant="edit" />
                      <IconButton
                        icon={Trash2}
                        onClick={() => void remove(e)}
                        label="Delete"
                        variant="outlineDanger"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-line bg-slate-50/80 p-2.5 tabular-nums">
                  <div>
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Principal Settled
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
                  <div className="col-span-2 mt-0.5 border-t border-slate-200/60 pt-1.5">
                    <div className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                      Total Repaid
                    </div>
                    <div className="font-display text-base font-black text-emerald-700">
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
      <StatGrid cols={4} className="mb-5">
        <StatCard icon={CheckCheck} label="Settled Loans" value={totals.count} tone="info" />
        <StatCard icon={Landmark} label="Total Principal" value={rs(totals.principal)} tone="brand" />
        <StatCard icon={Sigma} label="Interest Repaid" value={rs(totals.interestPaid)} tone="success" />
        <StatCard icon={CreditCard} label="Total Amount Repaid" value={rs(totals.totalPaid)} tone="success" />
      </StatGrid>

      <FilterBar
        date={calcDate}
        onDateChange={setCalcDate}
        text={searchTerm}
        onTextChange={setSearchTerm}
        textPlaceholder="Search settled records by Lender or Phone..."
        dateLabel="Interest as of"
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
