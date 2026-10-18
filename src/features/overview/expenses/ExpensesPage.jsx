/**
 * Other Expenses — replaces original-app/expenses.html + js/expenses.js (+ css/expenses.css).
 * KPI row (day / month / overall totals of the filtered list), date + reason filters, expense log (table → cards on
 * phones) with edit / delete, and an add / edit sheet (header button, floating "+" on phones).
 */
import { CalendarDays, CalendarRange, Plus, Sigma, Wallet } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { CASH_LABEL, accountLabel } from '@/core/accountLabel';
import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum, todayISO } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import {
  Badge,
  Button,
  ChoiceChips,
  DataTable,
  EmptyState,
  ErrorState,
  Page,
  StatCard,
  StatGrid,
  cn,
  useFeedback,
} from '@/ui';

import FilterBar from '../components/FilterBar';
import FloatingAddButton from '../components/FloatingAddButton';
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

/** Source filter chips: every non-cash expense is paid from a bank account ("Account"). */
const SOURCE_FILTERS = [
  { value: 'all', label: 'All Modes' },
  { value: 'cash', label: 'Cash Only' },
  { value: 'bank', label: 'Account' },
];

/** The reason as a neutral category chip that wraps long text ('-' when there is none). */
function ReasonChip({ expense, className }) {
  if (!expense.reason) return <span className="text-slate-400">-</span>;
  return (
    <span
      className={cn(
        'inline-block max-w-full rounded-lg bg-slate-50 px-2.5 py-1 text-[13px] leading-snug font-medium break-words text-slate-800 ring-1 ring-slate-200 ring-inset',
        className,
      )}
    >
      {expense.reason}
    </span>
  );
}

/** "Paid via" label: Cash in green, a bank account in blue (same colours as the finance pages). */
function PaidVia({ expense, bankAccounts }) {
  const source = expense.paymentSource || 'cash';
  if (source === 'cash') return <Badge tone="success">{CASH_LABEL}</Badge>;
  return <Badge tone="info">{accountLabel(bankAccounts.find((b) => b.id === source))}</Badge>;
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

  const { loading, error, reload } = useFocusLoad(async () => {
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

  /** set before the first await, so a double tap cannot start a second save (`saving` is only set further down) */
  const busy = useRef(false);
  const save = async () => {
    if (saving || busy.current) return;
    busy.current = true;
    try {
      await saveOnce();
    } finally {
      busy.current = false;
    }
  };
  const saveOnce = async () => {
    const invalid = validateExpense(form);
    if (invalid) {
      toast('Warning', invalid, 'warning');
      return;
    }

    // Overdraft check for expense payment
    const source = form.paymentSource || 'cash';
    // when editing, the balance already has the old amount taken out (same source): only the increase is new money
    const old = form.id ? expenses.find((e) => e.id === form.id) : null;
    const oldAmt = old && (old.paymentSource || 'cash') === source ? parseFloat(old.amount) || 0 : 0;
    const amt = Math.max(0, (parseFloat(form.amount) || 0) - oldAmt);
    try {
      const balances = await loadLiveAccountBalances();
      if (amt <= 0) {
        // no extra money leaves the account: nothing to warn about
      } else if (source === 'cash' && amt > balances.cashBalance) {
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
            title: `Insufficient Balance in ${accountLabel(bank)}`,
            message: `Paying ₹${formatCurrency(amt)} exceeds available balance in ${accountLabel(bank)} (₹${formatCurrency(bank.currentBalance)}). Do you want to proceed anyway?`,
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
      nowrap: true,
      className: 'font-medium text-slate-700',
      value: (e) => formatDateShort(e.date),
    },
    { key: 'reason', header: 'Reason', className: 'min-w-48', render: (e) => <ReasonChip expense={e} /> },
    {
      key: 'paymentSource',
      header: 'Paid Via',
      render: (e) => <PaidVia expense={e} bankAccounts={bankAccounts} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      className: 'font-display font-bold text-red-600',
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
                  <PaidVia expense={e} bankAccounts={bankAccounts} />
                </div>
                <div>
                  <ReasonChip expense={e} />
                </div>
                <div className="font-display text-lg font-extrabold text-red-600 tabular-nums">
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
        <Button variant="primary" icon={Plus} onClick={openAdd} className="max-sm:hidden">
          Add Expense
        </Button>
      }
    >
      <StatGrid cols={3} className="mb-5">
        <StatCard
          icon={CalendarDays}
          label={kpiLabel(totals.dayLabel)}
          value={rs(totals.dayTotal)}
          tone="danger"
        />
        <StatCard
          icon={CalendarRange}
          label={kpiLabel(totals.monthLabel)}
          value={rs(totals.monthTotal)}
          tone="danger"
        />
        <StatCard icon={Sigma} label="Overall Total" value={rs(totals.total)} tone="danger" />
      </StatGrid>
      <FilterBar
        active={sourceFilter !== 'all'}
        date={dateTerm}
        onDateChange={setDateTerm}
        text={reasonTerm}
        onTextChange={setReasonTerm}
        textPlaceholder="Search by Reason..."
        quickDates
        extraFilters={
          <div role="group" aria-label="Paid via">
            <ChoiceChips value={sourceFilter} onChange={setSourceFilter} options={SOURCE_FILTERS} />
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
