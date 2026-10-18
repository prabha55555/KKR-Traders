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
import {
  Badge,
  Button,
  Card,
  ChoiceChips,
  DataTable,
  EmptyState,
  Page,
  StatCard,
  StatGrid,
  cn,
  useFeedback,
} from '@/ui';

import FilterBar from '../overview/components/FilterBar';
import FloatingAddButton from '../overview/components/FloatingAddButton';
import SkeletonRows from '../overview/components/SkeletonRows';

import {
  BALANCE_ADJUSTMENT,
  computeAccountBalances,
  countAccountReferences,
  getRecordTimestamp,
  isLotPaymentEntry,
  loadAccountReferenceData,
  LOT_PAYMENT_UNDO_HINT,
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

// Entries table look per direction (see txDirection): added from outside (money in = green), removed to outside
// (money out = red), or a legacy transfer (blue)
const DIRECTION_STYLE = {
  in: { tone: 'success', sign: '+', text: 'text-emerald-700' },
  out: { tone: 'danger', sign: '-', text: 'text-red-600' },
  transfer: { tone: 'info', sign: '', text: 'text-sky-700' },
};

const PANEL_TONE = {
  info: 'bg-sky-50/60 ring-sky-100',
  success: 'bg-emerald-50/60 ring-emerald-100',
};

/** "Current Balance" box inside an account card (red figure when the balance is negative). */
function BalancePanel({ tone, balance, left, right }) {
  return (
    <div className={cn('mt-4 rounded-xl p-3.5 ring-1 ring-inset', PANEL_TONE[tone])}>
      <div className="text-[11px] font-bold tracking-wider text-slate-600 uppercase">Current Balance</div>
      <div
        className={cn(
          'mt-0.5 font-display text-xl font-extrabold tabular-nums sm:text-2xl',
          toNum(balance) < 0 ? 'text-red-600' : 'text-brand-800',
        )}
      >
        {rs(balance)}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-white pt-2 text-xs text-slate-600 tabular-nums">
        <span>{left}</span>
        {right}
      </div>
    </div>
  );
}

/** In place of Undo on the finance copy of a lot payment: it is undone from the lot's Payment History. */
function LotPaymentUndoHint() {
  return (
    <span className="text-[11px] font-semibold whitespace-normal text-slate-500">
      {LOT_PAYMENT_UNDO_HINT}
    </span>
  );
}

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

  const { loading, refresh } = useFocusLoad(async () => {
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

  // Handle Delete Bank Account: only an unused one (deleting a used one would move or drop its amounts in every balance)
  const handleDeleteAccount = async (account) => {
    let used;
    try {
      used = countAccountReferences(account, await loadAccountReferenceData());
    } catch (err) {
      console.error(err);
      toast('Error', "Could not check this account's transactions. Please try again.", 'error');
      return;
    }
    if (used > 0) {
      toast(
        'Cannot Delete',
        `This account has ${used} transaction${used === 1 ? '' : 's'}; it can't be deleted.`,
        'error',
      );
      return;
    }
    const ok = await confirm({
      title: 'Delete Bank Account?',
      message: `Are you sure you want to delete ${accountLabel(account)}? It has no transactions.`,
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

  // Undo = delete the account_transactions doc (its effect on every balance disappears with it). A lot payment's copy is
  // not undone here: the lot would still list it as paid (Dyeing & Combing removes both).
  const handleUndoEntry = async (t) => {
    if (isLotPaymentEntry(t)) return;
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
    { key: 'date', header: 'Date', nowrap: true, render: (t) => formatDateShort(t.date || t.createdAt) },
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
          <span className={cn('font-bold', style.text)}>
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
      nowrap: true,
      render: (t) =>
        isLotPaymentEntry(t) ? (
          <LotPaymentUndoHint />
        ) : (
          <Button
            size="sm"
            variant="outlineWarning"
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
            variant="success"
            size="sm"
            icon={PlusCircle}
            onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'in' })}
          >
            <span className="hidden sm:inline">+ Add Amount</span>
            <span className="sm:hidden">+ Add</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setEditingAccount({})}
            className="max-sm:hidden"
          >
            Add Bank Account
          </Button>
        </div>
      }
    >
      {/* ----------------- KPI ROW ----------------- */}
      <StatGrid cols={3} className="mb-5">
        <StatCard
          icon={Sigma}
          label="Total Available Funds"
          value={rs(balances.totalAvailableFunds)}
          tone={balances.totalAvailableFunds < 0 ? 'danger' : 'brand'}
        />
        <StatCard
          icon={Building2}
          label="Total in Bank Accounts"
          value={rs(balances.totalBankBalance)}
          tone={balances.totalBankBalance < 0 ? 'danger' : 'info'}
          hint={`Across ${balances.bankAccounts.length} Account(s)`}
        />
        <StatCard
          icon={Banknote}
          label="Cash in Hand"
          value={rs(balances.cashBalance)}
          tone={balances.cashBalance < 0 ? 'danger' : 'success'}
          hint={`Opening: ${rs(balances.cashAccount.openingBalance)}`}
        />
      </StatGrid>

      {/* ----------------- SUB-TABS: ACCOUNTS VS ENTRIES ----------------- */}
      <ChoiceChips
        value={activeTab}
        onChange={setActiveTab}
        className="mb-4 border-b border-line pb-3"
        options={[
          {
            value: 'accounts',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="size-4" aria-hidden />
                Accounts & Balances ({balances.bankAccounts.length + 1})
              </span>
            ),
          },
          {
            value: 'transactions',
            label: (
              <span className="inline-flex items-center gap-1.5">
                <History className="size-4" aria-hidden />
                Entries ({accountTransactions.length})
              </span>
            ),
          },
        ]}
      />

      {loading ? (
        <SkeletonRows count={4} />
      ) : activeTab === 'accounts' ? (
        <div className="space-y-4">
          {/* BANK ACCOUNTS LIST */}
          <div className="grid gap-4 sm:grid-cols-2">
            {balances.bankAccounts.map((account) => (
              <Card key={account.id} className="flex min-w-0 flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 ring-1 ring-sky-200 ring-inset">
                        <Building2 className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-display text-base font-bold break-words text-brand-800">
                          {accountLabel(account)}
                        </h4>
                        {(legacyBankName(account) || account.accountNumber) && (
                          <p className="text-xs font-semibold break-words text-sky-700">
                            {legacyBankName(account)}
                            {legacyBankName(account) && account.accountNumber ? ' ' : ''}
                            {account.accountNumber ? `(• • • • ${account.accountNumber})` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {account.accountType && <Badge tone="brand">{account.accountType}</Badge>}
                  </div>

                  <BalancePanel
                    tone="info"
                    balance={account.currentBalance}
                    left={
                      <>
                        Opening: <strong className="text-slate-800">{rs(account.openingBalance)}</strong>
                      </>
                    }
                    right={
                      <span className="font-semibold text-emerald-700">
                        Total Inflows: +{rs(account.inflows)}
                      </span>
                    }
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
                  <Button
                    variant="outlineSuccess"
                    size="sm"
                    icon={PlusCircle}
                    onClick={() => setAdditionalAmountTarget({ accountId: account.id, mode: 'in' })}
                  >
                    + Add Amount
                  </Button>
                  <Button
                    variant="outlineInfo"
                    size="sm"
                    icon={Eye}
                    onClick={() => setViewingAccount(account)}
                  >
                    View Details
                  </Button>
                  <Button variant="edit" size="sm" icon={Edit} onClick={() => setEditingAccount(account)}>
                    Edit
                  </Button>
                  <Button
                    variant="outlineDanger"
                    size="sm"
                    icon={Trash2}
                    onClick={() => handleDeleteAccount(account)}
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {balances.bankAccounts.length === 0 && (
            <Card>
              <EmptyState
                icon={Building2}
                title="No Bank Accounts Added Yet"
                message="Add your business bank accounts (SBI, HDFC, Canara, etc.) to track live bank balances with sales and purchases."
                action={
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={() => setEditingAccount({})}
                    className="mt-2"
                  >
                    Add Your First Bank Account
                  </Button>
                }
              />
            </Card>
          )}

          {/* CASH IN HAND CARD */}
          <Card className="flex min-w-0 flex-col justify-between">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 ring-inset">
                    <Banknote className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-display text-base font-bold text-brand-800">Cash in Hand</h4>
                    <p className="text-xs text-slate-500">
                      Physical Cash Drawer • Sales, Loans, Purchases & Expenses
                    </p>
                  </div>
                </div>
                <Badge tone="success">Drawer</Badge>
              </div>

              <BalancePanel
                tone="success"
                balance={balances.cashBalance}
                left={
                  <>
                    Opening:{' '}
                    <strong className="text-slate-800">{rs(balances.cashAccount.openingBalance)}</strong>
                  </>
                }
                right={
                  <span>
                    Net Flow:{' '}
                    <strong
                      className={
                        balances.cashBalance - balances.cashAccount.openingBalance >= 0
                          ? 'font-bold text-emerald-700'
                          : 'font-bold text-red-600'
                      }
                    >
                      {balances.cashBalance - balances.cashAccount.openingBalance >= 0 ? '+' : ''}
                      {rs(balances.cashBalance - balances.cashAccount.openingBalance)}
                    </strong>
                  </span>
                }
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
              <Button
                variant="outlineSuccess"
                size="sm"
                icon={PlusCircle}
                onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'in' })}
              >
                + Add Cash
              </Button>
              <Button
                variant="outlineInfo"
                size="sm"
                icon={Eye}
                onClick={() => setViewingAccount(balances.cashAccount)}
              >
                View Details
              </Button>
              <Button
                variant="edit"
                size="sm"
                icon={Scale}
                onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'set' })}
              >
                Edit Balance
              </Button>
            </div>
          </Card>
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
                  variant="success"
                  size="sm"
                  icon={PlusCircle}
                  onClick={() => setAdditionalAmountTarget({ accountId: 'cash', mode: 'in' })}
                  className="mt-2"
                >
                  + Add Amount
                </Button>
              }
            />
          ) : filteredAccountTransactions.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="No entries match your filters"
                message="Try selecting a different date or search query."
                action={
                  <Button
                    variant="outlineWarning"
                    size="sm"
                    onClick={() => {
                      setTxDateFilter('');
                      setTxSearchFilter('');
                    }}
                    className="mt-2"
                  >
                    Clear Filters
                  </Button>
                }
              />
            </Card>
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
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={style.tone}>{t.type || 'Entry'}</Badge>
                          <span className="text-xs text-slate-500">
                            {formatDateShort(t.date || t.createdAt)}
                          </span>
                        </div>
                        <div className="mt-2 text-xs font-semibold break-words text-slate-700">
                          {t.fromAccount
                            ? getAccountLabel(t.fromAccount)
                            : `Self / ${t.category || 'Addition'}`}{' '}
                          →{' '}
                          {t.toAccount ? getAccountLabel(t.toAccount) : `Self / ${t.category || 'Deduction'}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <div className={cn('font-display text-base font-extrabold tabular-nums', style.text)}>
                          {style.sign}
                          {rs(t.amount)}
                        </div>
                        {isLotPaymentEntry(t) ? (
                          <LotPaymentUndoHint />
                        ) : (
                          <Button
                            size="sm"
                            variant="outlineWarning"
                            icon={RotateCcw}
                            onClick={() => handleUndoEntry(t)}
                            title="Undo this entry and restore balances"
                          >
                            Undo
                          </Button>
                        )}
                      </div>
                    </div>
                    {t.notes && (
                      <div className="mt-0.5 text-xs break-words text-slate-500 italic">{t.notes}</div>
                    )}
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
