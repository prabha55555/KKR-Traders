/**
 * Other Expenses — replaces original-app/expenses.html + js/expenses.js (+ css/expenses.css).
 * KPI row (day / month / overall totals of the filtered list), date + reason filters, expense log (table → cards on
 * phones) with edit / delete, and an add / edit sheet (header button, floating "+" on phones).
 */
import { CalendarDays, CalendarRange, Plus, Sigma, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';

import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum, todayISO } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { Badge, Button, DataTable, EmptyState, ErrorState, Page, StatCard, cn, useFeedback } from '@/ui';

import FilterBar from '../components/FilterBar';
import FloatingAddButton from '../components/FloatingAddButton';
import InkStat from '../components/InkStat';
import KpiRow from '../components/KpiRow';
import RefreshButton from '../components/RefreshButton';
import RowActions from '../components/RowActions';
import ShowMore from '../components/ShowMore';
import SkeletonRows from '../components/SkeletonRows';
import { usePagedRows } from '../components/paging';
import ExpenseFormModal from './ExpenseFormModal';
import {
  buildExpense,
  computeExpenseTotals,
  emptyExpenseForm,
  expenseToForm,
  filterExpenses,
  validateExpense,
} from './expensesLogic';

const rs = (n) => `₹${formatCurrency(n)}`;
/** "Today's Total:" -> "Today's Total" (KPI labels have no trailing colon) */
const kpiLabel = (text) => text.replace(/:$/, '');

/** The reason as a category-style chip ('-' when there is none). */
function ReasonChip({ expense, className }) {
  if (!expense.reason) return <span className="text-slate-400">-</span>;
  return (
    <span
      className={cn(
        'inline-block rounded-lg bg-amber-50/80 px-2.5 py-1 text-[13px] leading-snug font-medium break-words text-amber-900 ring-1 ring-amber-200/70 ring-inset',
        className,
      )}
    >
      {expense.reason}
    </span>
  );
}

export default function ExpensesPage() {
  const { toast, confirm } = useFeedback();
  const [expenses, setExpenses] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [dateTerm, setDateTerm] = useState('');
  const [reasonTerm, setReasonTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'cash' | 'bank'
  const [form, setForm] = useState(null); // null = sheet closed
  const [saving, setSaving] = useState(false);

  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
    try {
      const [expList, banks] = await Promise.all([
        db.getAllExpenses(),
        db.getAllBankAccounts().catch(() => []),
      ]);
      setExpenses(expList);
      setBankAccounts(banks || []);
    } catch (e) {
      console.error('Error loading expenses:', e);
      toast('Error', 'Failed to load expenses', 'error');
      throw new Error('Error loading expenses');
    }
  });

  // totals are always computed from the full filtered list, never from the visible page
  const shown = useMemo(() => {
    const byText = filterExpenses(expenses, dateTerm, reasonTerm);
    if (sourceFilter === 'cash') {
      return byText.filter((e) => !e.paymentSource || e.paymentSource === 'cash');
    }
    if (sourceFilter === 'bank') {
      return byText.filter((e) => e.paymentSource && e.paymentSource !== 'cash');
    }
    return byText;
  }, [expenses, dateTerm, reasonTerm, sourceFilter]);

  const totals = useMemo(() => computeExpenseTotals(shown, dateTerm, todayISO()), [shown, dateTerm]);
  const paged = usePagedRows(shown, `${dateTerm}|${reasonTerm}|${sourceFilter}`);

  const save = async () => {
    const invalid = validateExpense(form);
    if (invalid) {
      toast('Warning', invalid, 'warning');
      return;
    }

    // Overdraft check for expense payment
    const source = form.paymentSource || 'cash';
    const amt = parseFloat(form.amount) || 0;
    try {
      const balances = await loadLiveAccountBalances();
      if (source === 'cash' && amt > balances.cashBalance) {
        const ok = await confirm({
          title: 'Insufficient Cash in Hand',
          message: `Paying ₹${formatCurrency(amt)} in Cash exceeds available cash balance (₹${formatCurrency(balances.cashBalance)}). This will make your cash balance negative. Do you want to proceed anyway?`,
          tone: 'warning',
          confirmText: 'Proceed Anyway',
          cancelText: 'Cancel & Adjust',
        });
        if (!ok) return;
      } else if (source !== 'cash') {
        const bank = balances.bankAccounts.find((b) => b.id === source);
        if (bank && amt > bank.currentBalance) {
          const ok = await confirm({
            title: `Insufficient Balance in ${bank.accountName}`,
            message: `Paying ₹${formatCurrency(amt)} exceeds available balance in ${bank.accountName} (₹${formatCurrency(bank.currentBalance)}). Do you want to proceed anyway?`,
            tone: 'warning',
            confirmText: 'Proceed Anyway',
            cancelText: 'Cancel & Adjust',
          });
          if (!ok) return;
        }
      }
    } catch (err) {
      console.error('Error verifying expense balance:', err);
    }

    setSaving(true);
    try {
      await db.saveExpense(buildExpense(form));
      toast('Success', 'Expense saved successfully!', 'success');
      setForm(null);
      await reload();
    } catch (e) {
      console.error('Error saving expense:', e);
      toast('Error', 'Failed to save expense.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (expense) => {
    const ok = await confirm({
      title: 'Are you sure?',
      message: "You won't be able to revert this!",
      tone: 'danger',
      confirmText: 'Yes, delete it!',
    });
    if (!ok) return;
    try {
      await db.deleteExpense(expense.id);
      toast('Deleted!', 'Expense has been deleted.', 'success');
      await reload();
    } catch (e) {
      console.error('Error deleting expense:', e);
      toast('Error', 'Failed to delete expense.', 'error');
    }
  };

  const openAdd = () => setForm(emptyExpenseForm(todayISO()));
  const actions = (e) => (
    <RowActions
      editLabel="Edit expense"
      deleteLabel="Delete expense"
      onEdit={() => setForm(expenseToForm(e))}
      onDelete={() => void remove(e)}
    />
  );

  const columns = [
    {
      key: 'date',
      header: 'Date',
      className: 'whitespace-nowrap font-medium text-slate-700',
      value: (e) => formatDateShort(e.date),
    },
    { key: 'reason', header: 'Reason', className: 'min-w-48', render: (e) => <ReasonChip expense={e} /> },
    {
      key: 'paymentSource',
      header: 'Paid Via',
      className: 'whitespace-nowrap',
      render: (e) => {
        const source = e.paymentSource || 'cash';
        if (source === 'cash') {
          return (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Cash in Hand
            </span>
          );
        }
        const bank = bankAccounts.find((b) => b.id === source);
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-200/70">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            {bank ? bank.accountName : 'Bank Account'}
          </span>
        );
      },
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      className: 'font-display font-bold text-rose-700 tabular-nums whitespace-nowrap',
      value: (e) => rs(toNum(e.amount)),
    },
    { key: 'actions', header: 'Actions', align: 'center', render: actions },
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
          renderCard={(e) => (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold tracking-wide text-slate-500">
                    {formatDateShort(e.date)}
                  </span>
                  {e.paymentSource && e.paymentSource !== 'cash' ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800 ring-1 ring-blue-200/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                      {bankAccounts.find((b) => b.id === e.paymentSource)?.accountName || 'Bank'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/70">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Cash
                    </span>
                  )}
                </div>
                <div>
                  <ReasonChip expense={e} />
                </div>
                <div className="font-display text-lg font-extrabold text-rose-700 tabular-nums">
                  {rs(toNum(e.amount))}
                </div>
              </div>
              {actions(e)}
            </div>
          )}
          empty={
            <EmptyState
              icon={Wallet}
              title="No expenses found."
              message="Recorded expenses show up here. Adjust the filters or add a new one."
            />
          }
        />
        <ShowMore pager={paged.pager} noun="expenses" />
      </>
    );

  return (
    <Page
      title="Other Expenses"
      icon={Wallet}
      actions={
        <>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
          <Button icon={Plus} onClick={openAdd} className="max-sm:hidden">
            Add Expense
          </Button>
        </>
      }
    >
      <KpiRow cols={3}>
        <StatCard
          icon={CalendarDays}
          label={kpiLabel(totals.dayLabel)}
          value={rs(totals.dayTotal)}
          tint="sky"
        />
        <StatCard
          icon={CalendarRange}
          label={kpiLabel(totals.monthLabel)}
          value={rs(totals.monthTotal)}
          tint="amber"
        />
        <InkStat icon={Sigma} label="Overall Total" value={rs(totals.total)} />
      </KpiRow>
      <FilterBar
        date={dateTerm}
        onDateChange={setDateTerm}
        text={reasonTerm}
        onTextChange={setReasonTerm}
        textPlaceholder="Search by Reason..."
        quickDates
        extraFilters={
          <div className="flex items-center rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSourceFilter('all')}
              className={`rounded-md px-2 py-0.5 transition ${
                sourceFilter === 'all'
                  ? 'bg-white text-brand-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Modes
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('cash')}
              className={`rounded-md px-2 py-0.5 transition ${
                sourceFilter === 'cash'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cash Only
            </button>
            <button
              type="button"
              onClick={() => setSourceFilter('bank')}
              className={`rounded-md px-2 py-0.5 transition ${
                sourceFilter === 'bank'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Bank / UPI
            </button>
          </div>
        }
        onClear={() => {
          setDateTerm('');
          setReasonTerm('');
          setSourceFilter('all');
        }}
      />
      {body}
      <FloatingAddButton label="Add expense" onClick={openAdd} />
      <ExpenseFormModal
        form={form}
        onChange={setForm}
        saving={saving}
        onClose={() => setForm(null)}
        onSave={() => void save()}
      />
    </Page>
  );
}
