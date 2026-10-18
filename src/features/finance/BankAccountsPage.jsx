import {
  Banknote,
  Building2,
  CalendarDays,
  Edit,
  Eye,
  History,
  Landmark,
  Plus,
  PlusCircle,
  RotateCcw,
  Scale,
  Sigma,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { accountLabel, CASH_LABEL } from '@/core/accountLabel';
import { db } from '@/core/db';
import { formatCurrency, formatDateShort, toNum } from '@/core/format';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { Badge, Button, DataTable, EmptyState, Page, RefreshButton, useFeedback } from '@/ui';

import FilterBar from '../overview/components/FilterBar';
import FloatingAddButton from '../overview/components/FloatingAddButton';
import InkStat from '../overview/components/InkStat';
import KpiRow from '../overview/components/KpiRow';
import SkeletonRows from '../overview/components/SkeletonRows';

import {
  BALANCE_ADJUSTMENT,
  computeAccountBalances,
  getRecordTimestamp,
  toDateKey,
  txDirection,
} from './accountsLogic';
import AddAdditionalAmountModal from './AddAdditionalAmountModal';
import BankAccountModal from './BankAccountModal';
import BankAccountDetailModal from './BankAccountDetailModal';

const rs = (n) => {
  const val = toNum(n);
  if (val < 0) {
    return `-₹${formatCurrency(Math.abs(val))}`;
  }
  return `₹${formatCurrency(val)}`;
};

// Entries table look per direction (see txDirection): added from outside, removed to outside, or a legacy transfer
const DIRECTION_STYLE = {
  in: { tone: 'success', sign: '+', text: 'text-emerald-700' },
  out: { tone: 'warning', sign: '-', text: 'text-rose-700' },
  transfer: { tone: 'info', sign: '', text: 'text-indigo-700' },
};

// The bank name of an older account whose display name differs from it ('Current A/c' at 'SBI'); '' otherwise
const legacyBankName = (account) => {
  const bank = String(account?.bankName || '').trim();
  return bank && bank.toLowerCase() !== accountLabel(account).toLowerCase() ? bank : '';
};

export default function BankAccountsPage() {
  const { toast, confirm } = useFeedback();

  const [bankAccounts, setBankAccounts] = useState([]);
  const [cashSettings, setCashSettings] = useState({ openingBalance: 0 });
  const [salesInvoices, setSalesInvoices] = useState([]);
  const [purchaseBills, setPurchaseBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [financeRecords, setFinanceRecords] = useState([]);
  const [accountTransactions, setAccountTransactions] = useState([]);
  const [salesPayments, setSalesPayments] = useState([]);
  const [purchasePayments, setPurchasePayments] = useState([]);
  const [salesReturns, setSalesReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);

  // Modals state
  const [editingAccount, setEditingAccount] = useState(null);
  const [viewingAccount, setViewingAccount] = useState(null);
  const [additionalAmountTarget, setAdditionalAmountTarget] = useState(null); // null | { accountId, mode: 'in'|'out'|'set' }
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('accounts'); // 'accounts' | 'transactions'
  const [txDateFilter, setTxDateFilter] = useState('');
  const [txSearchFilter, setTxSearchFilter] = useState('');

  const { loading, refreshing, refresh } = useFocusLoad(async () => {
    try {
      const [banks, cash, sales, purchases, exps, fin, txs, sPays, pPays, sRets, pRets] = await Promise.all([
        db.getAllBankAccounts(),
        db.getCashSettings(),
        db.getAllInvoices().catch(() => []),
        db.getAllPurchaseBills().catch(() => []),
        db.getAllExpenses().catch(() => []),
        db.getAllFinanceRecords().catch(() => []),
        db.getAllAccountTransactions().catch(() => []),
        db.getAllPayments().catch(() => []),
        db.getAllPurchasePayments().catch(() => []),
        db.getAllReturns().catch(() => []),
        db.getAllPurchaseReturns().catch(() => []),
      ]);

      setBankAccounts(banks || []);
      setCashSettings(cash || { openingBalance: 0 });
      setSalesInvoices(sales || []);
      setPurchaseBills(purchases || []);
      setExpenses(exps || []);
      setFinanceRecords(fin || []);
      setAccountTransactions(txs || []);
      setSalesPayments(sPays || []);
      setPurchasePayments(pPays || []);
      setSalesReturns(sRets || []);
      setPurchaseReturns(pRets || []);
    } catch (e) {
      console.error('Failed to load financial accounts:', e);
      toast('Error', 'Failed to load financial balances', 'error');
    }
  });

  // Calculate live balances
  const balances = useMemo(() => {
    return computeAccountBalances({
      bankAccounts,
      cashOpening: cashSettings?.openingBalance || 0,
      salesInvoices,
      purchaseBills,
      expenses,
      financeRecords,
      accountTransactions,
      salesPayments,
      purchasePayments,
      salesReturns,
      purchaseReturns,
    });
  }, [
    bankAccounts,
    cashSettings,
    salesInvoices,
    purchaseBills,
    expenses,
    financeRecords,
    accountTransactions,
    salesPayments,
    purchasePayments,
    salesReturns,
    purchaseReturns,
  ]);

  // Derived current viewing account that stays synchronized with recomputed balances
  const activeViewingAccount = useMemo(() => {
    if (!viewingAccount) return null;
    if (viewingAccount.id === 'cash') return balances.cashAccount;
    return balances.bankAccounts.find((b) => b.id === viewingAccount.id) || viewingAccount;
  }, [viewingAccount, balances]);

  // Sort entries descending (most recent first at top)
  const sortedAccountTransactions = useMemo(() => {
    return [...accountTransactions].sort((a, b) => {
      const dateA = toDateKey(a.date || a.createdAt);
      const dateB = toDateKey(b.date || b.createdAt);
      if (dateB !== dateA) return dateB.localeCompare(dateA);
      const timeB = getRecordTimestamp(b, b.date);
      const timeA = getRecordTimestamp(a, a.date);
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }, [accountTransactions]);

  // Handle Save Bank Account
  const handleSaveAccount = async (accountData) => {
    setSaving(true);
    try {
      await db.saveBankAccount(accountData);
      setEditingAccount(null);
      toast('Success', 'Bank account saved successfully', 'success');
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to save bank account', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete Bank Account
  const handleDeleteAccount = async (account) => {
    const ok = await confirm({
      title: 'Delete Bank Account?',
      message: `Are you sure you want to delete ${accountLabel(account)}? Past transaction records will remain safe.`,
      tone: 'danger',
    });
    if (!ok) return;

    try {
      await db.deleteBankAccount(account.id);
      toast('Success', 'Bank account deleted', 'success');
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to delete bank account', 'error');
    }
  };

  // Handle Save Additional Amount, Manual Deduction or cash Edit Balance
  const handleSaveAdditionalAmount = async (txData) => {
    setSaving(true);
    try {
      await db.saveAccountTransaction(txData);
      setAdditionalAmountTarget(null);
      toast(
        'Success',
        txData.type === BALANCE_ADJUSTMENT
          ? `Cash balance updated to ${rs(txData.newBalance)}`
          : txData.type === 'Manual Deduction'
            ? 'Manual deduction recorded'
            : 'Additional amount added successfully',
        'success',
      );
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to save transaction', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Account lookup helper
  const getAccountLabel = (id) => {
    if (!id || id === 'external' || id === 'manual') return 'External / Self';
    if (id === 'cash') return CASH_LABEL;
    const acc = bankAccounts.find((a) => a.id === id);
    return acc ? accountLabel(acc) : 'Deleted Bank Account';
  };

  // Undo = delete the account_transactions doc (its effect on every balance disappears with it)
  const handleUndoEntry = async (t) => {
    const ok = await confirm({
      title: 'Undo Entry?',
      message: `Undo this ${t.type || 'entry'} of ${rs(t.amount)}? This will reverse the effect and restore your balances.`,
      tone: 'danger',
      confirmText: 'Undo Entry',
    });
    if (!ok) return;
    try {
      await db.deleteAccountTransaction(t.id);
      toast('Undone!', 'Entry reversed and balances restored successfully.', 'success');
      refresh();
    } catch (err) {
      console.error(err);
      toast('Error', 'Failed to undo the entry', 'error');
    }
  };

  // Filtered entries (datewise + keyword search)
  const filteredAccountTransactions = useMemo(() => {
    const q = txSearchFilter.trim().toLowerCase();
    return sortedAccountTransactions.filter((t) => {
      if (txDateFilter) {
        const itemDateKey = toDateKey(t.date || t.createdAt);
        if (itemDateKey !== txDateFilter) return false;
      }
      if (q) {
        const fromLabel = getAccountLabel(t.fromAccount).toLowerCase();
        const toLabel = getAccountLabel(t.toAccount).toLowerCase();
        const type = (t.type || '').toLowerCase();
        const category = (t.category || '').toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        const amt = String(t.amount || '');
        const dateShort = formatDateShort(t.date || t.createdAt).toLowerCase();
        const match =
          fromLabel.includes(q) ||
          toLabel.includes(q) ||
          type.includes(q) ||
          category.includes(q) ||
          notes.includes(q) ||
          amt.includes(q) ||
          dateShort.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [sortedAccountTransactions, txDateFilter, txSearchFilter, bankAccounts]);

  // Transactions columns definition
  const txColumns = [
    { key: 'date', header: 'Date', render: (t) => formatDateShort(t.date || t.createdAt) },
    {
      key: 'type',
      header: 'Type',
      render: (t) => <Badge tone={DIRECTION_STYLE[txDirection(t)].tone}>{t.type || 'Entry'}</Badge>,
    },
    {
      key: 'from',
      header: 'From',
      render: (t) => (
        <span className="font-medium text-slate-700">
          {!t.fromAccount || t.fromAccount === 'external'
            ? t.category
              ? `Self / ${t.category}`
              : 'External / Self'
            : getAccountLabel(t.fromAccount)}
        </span>
      ),
    },
    {
      key: 'to',
      header: 'To',
      render: (t) => (
        <span className="font-bold text-slate-900">
          {!t.toAccount || t.toAccount === 'external'
            ? t.category
              ? `Deduction (${t.category})`
              : 'External / Self'
            : getAccountLabel(t.toAccount)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (t) => {
        const style = DIRECTION_STYLE[txDirection(t)];
        return (
          <span className={`font-bold tabular-nums ${style.text}`}>
            {style.sign}
            {rs(t.amount)}
          </span>
        );
      },
    },
    { key: 'notes', header: 'Notes', render: (t) => t.notes || '-' },
    {
      key: 'actions',
      header: 'Undo / Revert',
      align: 'center',
      render: (t) => (
        <Button
          size="sm"
          variant="outlineDanger"
          icon={RotateCcw}
          onClick={() => handleUndoEntry(t)}
          title="Undo this entry and restore balances"
        >
          Undo
        </Button>
      ),
    },
  ];

  return (
    <Page
      title={
        <span>
          <span className="sm:hidden">Bank & Cash</span>
          <span className="hidden sm:inline">Bank & Cash Balances</span>
        </span>
      }
      icon={Landmark}
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={PlusCircle}
            onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'in' })}
            className="bg-emerald-700 text-xs font-semibold text-white shadow-sm hover:bg-emerald-800 sm:text-sm"
          >
            <span className="hidden sm:inline">+ Add Amount</span>
            <span className="sm:hidden">+ Add</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setEditingAccount({})}
            className="text-xs max-sm:hidden sm:text-sm"
          >
            Add Bank Account
          </Button>
          <RefreshButton onClick={refresh} refreshing={refreshing} />
        </div>
      }
    >
      {/* ----------------- KPI ROW ----------------- */}
      <KpiRow cols={3} className="grid-cols-1 sm:grid-cols-3">
        <InkStat label="Total Available Funds" value={rs(balances.totalAvailableFunds)} icon={Sigma} />
        <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-white via-blue-50/20 to-blue-50/40 p-4 shadow-lift sm:p-5">
          <div className="text-xs font-bold tracking-wider text-blue-800 uppercase">
            Total in Bank Accounts
          </div>
          <div className="mt-2 font-display text-2xl font-extrabold text-blue-900 sm:text-3xl">
            {rs(balances.totalBankBalance)}
          </div>
          <div className="mt-1 text-xs font-semibold text-blue-700/80">
            Across {balances.bankAccounts.length} Account(s)
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-white via-emerald-50/20 to-emerald-50/40 p-4 shadow-lift sm:p-5">
          <div className="text-xs font-bold tracking-wider text-emerald-800 uppercase">Cash in Hand</div>
          <div className="mt-2 font-display text-2xl font-extrabold text-emerald-700 sm:text-3xl">
            {rs(balances.cashBalance)}
          </div>
          <div className="mt-1 text-xs font-semibold text-emerald-700/80">
            Opening: {rs(balances.cashAccount.openingBalance)}
          </div>
        </div>
      </KpiRow>

      {/* ----------------- SUB-TABS: ACCOUNTS VS ENTRIES ----------------- */}
      <div className="no-scrollbar -mx-4 mb-4 flex items-center gap-2 overflow-x-auto border-b border-line px-4 pb-2 sm:mx-0 sm:px-0">
        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${
            activeTab === 'accounts'
              ? 'bg-brand-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Building2 className="size-3.5 sm:size-4" />
          Accounts & Balances ({balances.bankAccounts.length + 1})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${
            activeTab === 'transactions'
              ? 'bg-brand-900 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="size-3.5 sm:size-4" />
          Entries ({accountTransactions.length})
        </button>
      </div>

      {loading ? (
        <SkeletonRows count={4} />
      ) : activeTab === 'accounts' ? (
        <div className="space-y-4">
          {/* BANK ACCOUNTS LIST */}
          <div className="grid gap-3.5 sm:grid-cols-2">
            {balances.bankAccounts.map((account) => (
              <div
                key={account.id}
                className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-lift transition hover:shadow-pop sm:p-5"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-200 sm:size-10">
                        <Building2 className="size-4.5 sm:size-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-display text-sm font-bold break-words text-slate-900 sm:text-base">
                          {accountLabel(account)}
                        </h4>
                        {(legacyBankName(account) || account.accountNumber) && (
                          <p className="text-[11px] font-semibold text-blue-700 sm:text-xs">
                            {legacyBankName(account)}
                            {legacyBankName(account) && account.accountNumber ? ' ' : ''}
                            {account.accountNumber ? `(• • • • ${account.accountNumber})` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {account.accountType && <Badge tone="brand">{account.accountType}</Badge>}
                  </div>

                  <div className="mt-4 rounded-xl border border-blue-200/60 bg-gradient-to-br from-blue-50/70 via-slate-50 to-blue-50/30 p-3 sm:mt-5 sm:p-3.5">
                    <div className="text-[10px] font-bold tracking-wider text-blue-800 uppercase sm:text-xs">
                      Current Balance
                    </div>
                    <div className="mt-0.5 font-display text-xl font-extrabold text-blue-900 sm:text-2xl">
                      {rs(account.currentBalance)}
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-blue-200/60 pt-2 text-[11px] text-slate-600 sm:text-xs">
                      <span>
                        Opening: <strong className="text-slate-800">{rs(account.openingBalance)}</strong>
                      </span>
                      <span className="font-semibold text-emerald-700">
                        Total Inflows: +{rs(account.inflows)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-3 sm:mt-4 sm:gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={PlusCircle}
                    onClick={() => setAdditionalAmountTarget({ accountId: account.id, mode: 'in' })}
                    className="text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  >
                    + Add Amount
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Eye}
                    onClick={() => setViewingAccount(account)}
                    className="text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-brand-900"
                  >
                    View Details
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Edit}
                    onClick={() => setEditingAccount(account)}
                    className="text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-800"
                  >
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => handleDeleteAccount(account)}
                    className="text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-800"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {balances.bankAccounts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center sm:p-8">
              <Building2 className="mx-auto size-9 text-slate-400 sm:size-10" />
              <h3 className="mt-2 text-sm font-bold text-slate-700 sm:text-base">
                No Bank Accounts Added Yet
              </h3>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Add your business bank accounts (SBI, HDFC, Canara, etc.) to track live bank balances with
                sales and purchases.
              </p>
              <Button
                variant="primary"
                size="sm"
                icon={Plus}
                onClick={() => setEditingAccount({})}
                className="mt-3.5 sm:mt-4"
              >
                Add Your First Bank Account
              </Button>
            </div>
          )}

          {/* CASH IN HAND CARD */}
          <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-line bg-white p-4 shadow-lift transition hover:shadow-pop sm:p-5">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 sm:size-10">
                    <Banknote className="size-4.5 sm:size-5" />
                  </div>
                  <div>
                    <h4 className="font-display text-sm font-bold text-slate-900 sm:text-base">
                      Cash in Hand
                    </h4>
                    <p className="text-[11px] text-slate-500 sm:text-xs">
                      Physical Cash Drawer • Sales, Loans, Purchases & Expenses
                    </p>
                  </div>
                </div>
                <Badge tone="success">Drawer</Badge>
              </div>

              <div className="mt-4 rounded-xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/70 via-teal-50/30 to-emerald-50/30 p-3 sm:mt-5 sm:p-3.5">
                <div className="text-[10px] font-bold tracking-wider text-emerald-800 uppercase sm:text-xs">
                  Current Balance
                </div>
                <div className="mt-0.5 font-display text-xl font-extrabold text-emerald-700 sm:text-2xl">
                  {rs(balances.cashBalance)}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-emerald-200/70 pt-2 text-[11px] text-emerald-800 sm:text-xs">
                  <span>
                    Opening:{' '}
                    <strong className="text-slate-800">{rs(balances.cashAccount.openingBalance)}</strong>
                  </span>
                  <span>
                    Net Flow:{' '}
                    <strong
                      className={
                        balances.cashBalance - balances.cashAccount.openingBalance >= 0
                          ? 'font-bold text-emerald-700'
                          : 'font-bold text-rose-700'
                      }
                    >
                      {balances.cashBalance - balances.cashAccount.openingBalance >= 0 ? '+' : ''}
                      {rs(balances.cashBalance - balances.cashAccount.openingBalance)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-end gap-1.5 border-t border-slate-100 pt-3 sm:mt-4 sm:gap-2">
              <Button
                variant="ghost"
                size="sm"
                icon={PlusCircle}
                onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'in' })}
                className="text-xs font-semibold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                + Add Cash
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Eye}
                onClick={() => setViewingAccount(balances.cashAccount)}
                className="text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-brand-900"
              >
                View Details
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Scale}
                onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'set' })}
                className="text-xs font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-800"
              >
                Edit Balance
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* TRANSACTIONS / AUDIT TABLE */
        <div className="space-y-4">
          <FilterBar
            date={txDateFilter}
            onDateChange={setTxDateFilter}
            text={txSearchFilter}
            onTextChange={setTxSearchFilter}
            textPlaceholder="Search entries by account, type, note or amount..."
            onClear={() => {
              setTxDateFilter('');
              setTxSearchFilter('');
            }}
          />

          {sortedAccountTransactions.length === 0 ? (
            <EmptyState
              title="No Entries Yet"
              message="Amounts you add, deduct or correct by hand (and their Undo) are listed here."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={PlusCircle}
                  onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'in' })}
                >
                  + Add Amount
                </Button>
              }
            />
          ) : filteredAccountTransactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <CalendarDays className="mx-auto size-8 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No entries match your filters</p>
              <p className="mt-0.5 text-xs text-slate-500">Try selecting a different date or search query.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTxDateFilter('');
                  setTxSearchFilter('');
                }}
                className="mt-3"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <DataTable
              columns={txColumns}
              rows={filteredAccountTransactions}
              rowKey={(t) => t.id}
              renderCard={(t) => {
                const style = DIRECTION_STYLE[txDirection(t)];
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge tone={style.tone}>{t.type || 'Entry'}</Badge>
                          <span className="text-xs text-slate-500">
                            {formatDateShort(t.date || t.createdAt)}
                          </span>
                        </div>
                        <div className="mt-2 text-xs font-semibold text-slate-700">
                          {t.fromAccount
                            ? getAccountLabel(t.fromAccount)
                            : `Self / ${t.category || 'Addition'}`}{' '}
                          →{' '}
                          {t.toAccount ? getAccountLabel(t.toAccount) : `Self / ${t.category || 'Deduction'}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <div className={`font-display text-base font-extrabold ${style.text}`}>
                          {style.sign}
                          {rs(t.amount)}
                        </div>
                        <Button
                          size="sm"
                          variant="outlineDanger"
                          icon={RotateCcw}
                          onClick={() => handleUndoEntry(t)}
                          title="Undo this entry and restore balances"
                        >
                          Undo
                        </Button>
                      </div>
                    </div>
                    {t.notes && <div className="mt-0.5 text-xs text-slate-500 italic">{t.notes}</div>}
                  </div>
                );
              }}
            />
          )}
        </div>
      )}

      {/* Floating Add for mobile */}
      <FloatingAddButton onClick={() => setEditingAccount({})} label="Add Bank Account" />

      {/* MODALS */}
      {viewingAccount && activeViewingAccount && (
        <BankAccountDetailModal
          account={activeViewingAccount}
          allData={{
            salesInvoices,
            purchaseBills,
            expenses,
            financeRecords,
            accountTransactions,
            bankAccounts,
            salesPayments,
            purchasePayments,
            salesReturns,
            purchaseReturns,
          }}
          onClose={() => setViewingAccount(null)}
          onEdit={() => {
            const acc = activeViewingAccount;
            setViewingAccount(null);
            setEditingAccount(acc);
          }}
          onEditBalance={
            activeViewingAccount.id === 'cash'
              ? () => {
                  setViewingAccount(null);
                  setAdditionalAmountTarget({ accountId: 'cash', mode: 'set' });
                }
              : undefined
          }
          onAddAmount={() => {
            const accId = activeViewingAccount.id;
            setViewingAccount(null);
            setAdditionalAmountTarget({ accountId: accId, mode: 'in' });
          }}
          onRefresh={refresh}
        />
      )}

      {editingAccount && (
        <BankAccountModal
          account={editingAccount.id ? editingAccount : null}
          saving={saving}
          onClose={() => setEditingAccount(null)}
          onSave={handleSaveAccount}
        />
      )}

      {additionalAmountTarget && (
        <AddAdditionalAmountModal
          accounts={bankAccounts}
          cashBalance={balances.cashBalance}
          initialAccountId={additionalAmountTarget.accountId}
          initialMode={additionalAmountTarget.mode || 'in'}
          saving={saving}
          onClose={() => setAdditionalAmountTarget(null)}
          onSave={handleSaveAdditionalAmount}
        />
      )}
    </Page>
  );
}
