import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  Copy,
  Edit,
  PlusCircle,
  RotateCcw,
  Scale,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { accountLabel, CASH_LABEL } from '@/core/accountLabel';
import { db } from '@/core/db';
import { formatCurrency, formatDateShort, formatDateIN, toNum } from '@/core/format';
import { Button, DateField, IconButton, Modal, SearchBar, useFeedback } from '@/ui';
import { getAccountActivity, toDateKey } from './accountsLogic';

const rs = (n) => {
  const val = toNum(n);
  if (val < 0) {
    return `-₹${formatCurrency(Math.abs(val))}`;
  }
  return `₹${formatCurrency(val)}`;
};

function getTransactionBadgeStyle(item) {
  const t = item.type || '';
  if (t.startsWith('Sale')) return 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/70';
  if (t.startsWith('Purchase')) return 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/70';
  if (t.includes('Expense')) return 'bg-amber-100 text-amber-800 ring-1 ring-amber-200/70';
  if (t.includes('Repayment')) return 'bg-purple-100 text-purple-800 ring-1 ring-purple-200/70';
  if (t.includes('Loan')) return 'bg-teal-100 text-teal-800 ring-1 ring-teal-200/70';
  if (t.includes('Transfer In')) return 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-200/70';
  if (t.includes('Transfer Out')) return 'bg-orange-100 text-orange-800 ring-1 ring-orange-200/70';
  return item.direction === 'in'
    ? 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/70'
    : 'bg-rose-100 text-rose-800 ring-1 ring-rose-200/70';
}

function formatDateHeading(dateKey, rawDate) {
  if (!dateKey || dateKey === 'Unknown') return 'Undated';
  try {
    const parts = dateKey.split('-');
    if (parts.length === 3) {
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if (y && m && d) {
        const dt = new Date(y, m - 1, d);
        return dt.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
    }
  } catch {}
  return formatDateShort(rawDate || dateKey);
}

function formatItemTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      // Suppress if local midnight or UTC midnight (which translates to 05:30:00 in IST from a date-only string)
      if (
        (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) ||
        (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0)
      ) {
        return '';
      }
      return d.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  } catch {}
  return '';
}

export default function BankAccountDetailModal({
  account,
  allData,
  onClose,
  onEdit,
  onEditBalance,
  onAddAmount,
  onRefresh,
}) {
  const { toast, confirm } = useFeedback();
  const [filterType, setFilterType] = useState('all'); // 'all' | 'in' | 'out'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDate, setSearchDate] = useState(''); // 'YYYY-MM-DD' or ''
  const [copied, setCopied] = useState(false);

  const isCash = account?.id === 'cash';
  const name = isCash ? CASH_LABEL : accountLabel(account);
  // Older accounts may still carry a separate bank name, account number, type and notes: show them only when present
  const legacyBank =
    !isCash && account?.bankName && account.bankName.trim().toLowerCase() !== name.toLowerCase()
      ? account.bankName.trim()
      : '';
  const hasMetadata =
    !isCash && !!(legacyBank || account?.accountNumber || account?.accountType || account?.notes);

  const activity = useMemo(() => {
    return getAccountActivity({
      account,
      salesInvoices: allData?.salesInvoices || [],
      purchaseBills: allData?.purchaseBills || [],
      expenses: allData?.expenses || [],
      financeRecords: allData?.financeRecords || [],
      accountTransactions: allData?.accountTransactions || [],
      bankAccounts: allData?.bankAccounts || [],
      salesPayments: allData?.salesPayments || [],
      purchasePayments: allData?.purchasePayments || [],
      salesReturns: allData?.salesReturns || [],
      purchaseReturns: allData?.purchaseReturns || [],
    });
  }, [account, allData]);

  const handleCopyAccNumber = () => {
    if (!account?.accountNumber) return;
    navigator.clipboard?.writeText?.(account.accountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const canUndo = (item) => {
    if (!item) return false;
    if (item.id?.startsWith('tx-in-') || item.id?.startsWith('tx-out-')) return true;
    if (item.type === 'Additional Amount' || item.type === 'Manual Deduction') return true;
    if (item.id?.startsWith('fin-pay-') || item.type === 'Loan Repayment') return true;
    if (item.id?.startsWith('exp-') || item.category === 'Expense') return true;
    return false;
  };

  const handleUndo = async (item) => {
    const isTx =
      item.id?.startsWith('tx-in-') ||
      item.id?.startsWith('tx-out-') ||
      item.category === 'Transfer' ||
      item.type === 'Additional Amount' ||
      item.type === 'Manual Deduction';
    const isLoanPay = item.id?.startsWith('fin-pay-') || item.type === 'Loan Repayment';
    const isExp = item.id?.startsWith('exp-') || item.category === 'Expense';

    const ok = await confirm({
      title: 'Undo Transaction?',
      message: `Are you sure you want to undo this ${item.type || 'entry'} of ${rs(
        item.amount,
      )}? This will reverse the effect on ${name}.`,
      tone: 'danger',
      confirmText: 'Undo Entry',
    });
    if (!ok) return;

    try {
      if (isTx) {
        const txId = item.sourceRef?.id || item.id.replace(/^tx-(?:in|out)-/, '');
        await db.deleteAccountTransaction(txId);
      } else if (isLoanPay) {
        const payId = item.sourceRef?.id;
        const allRecords = allData?.financeRecords || [];
        const record = allRecords.find((r) => (r.payments || []).some((p) => p.id === payId));
        if (record && payId) {
          const updated = {
            ...record,
            payments: (record.payments || []).filter((p) => p.id !== payId),
          };
          await db.saveFinanceRecord(updated);
        }
      } else if (isExp) {
        const expId = item.sourceRef?.id || item.id.replace(/^exp-/, '');
        await db.deleteExpense(expId);
      }

      toast('Undone!', 'Transaction reversed and balance updated successfully.', 'success');
      onRefresh?.();
    } catch (err) {
      console.error('Failed to undo transaction:', err);
      toast('Error', 'Failed to undo transaction. Please try again.', 'error');
    }
  };

  const todayKey = useMemo(() => toDateKey(new Date()), []);
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return toDateKey(d);
  }, []);

  // Filter and sort transactions (newest / most recent always at top)
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const list = (activity.items || []).filter((item) => {
      // 1. Direction filter ('all' | 'in' | 'out')
      if (filterType === 'in' && item.direction !== 'in') return false;
      if (filterType === 'out' && item.direction !== 'out') return false;

      // 2. Specific Date filter ('YYYY-MM-DD')
      if (searchDate) {
        const itemDateKey = toDateKey(item.date);
        if (itemDateKey !== searchDate) return false;
      }

      // 3. Search query filter (matches title, subtitle, type, amount, or date text)
      if (q) {
        const matchTitle = item.title?.toLowerCase().includes(q);
        const matchSub = item.subtitle?.toLowerCase().includes(q);
        const matchType = item.type?.toLowerCase().includes(q);
        const matchAmt = String(item.amount).includes(q);

        const dateShort = formatDateShort(item.date).toLowerCase();
        const dateIN = formatDateIN(item.date).toLowerCase();
        const dateIso = String(item.date || '').toLowerCase();
        const matchDate = dateShort.includes(q) || dateIN.includes(q) || dateIso.includes(q);

        if (!matchTitle && !matchSub && !matchType && !matchAmt && !matchDate) return false;
      }

      return true;
    });

    return [...list].sort((a, b) => {
      const dateStrA = toDateKey(a.date);
      const dateStrB = toDateKey(b.date);
      if (dateStrB !== dateStrA) return dateStrB.localeCompare(dateStrA);
      const timeB = b.timestamp || 0;
      const timeA = a.timestamp || 0;
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  }, [activity.items, filterType, searchQuery, searchDate]);

  // Group filtered items datewise for structured ledger presentation
  const groupedByDate = useMemo(() => {
    const groups = [];
    const groupMap = new Map();

    filteredItems.forEach((item) => {
      const key = toDateKey(item.date) || 'Unknown';
      if (!groupMap.has(key)) {
        const groupObj = {
          dateKey: key,
          dateRaw: item.date,
          items: [],
          totalIn: 0,
          totalOut: 0,
        };
        groupMap.set(key, groupObj);
        groups.push(groupObj);
      }
      const group = groupMap.get(key);
      group.items.push(item);
      if (item.direction === 'in') group.totalIn += item.amount;
      else group.totalOut += item.amount;
    });

    return groups;
  }, [filteredItems]);

  if (!account) return null;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={name}
      size="xl"
      footer={
        <>
          {onAddAmount && (
            <Button variant="success" size="sm" icon={PlusCircle} onClick={onAddAmount}>
              + Add Amount
            </Button>
          )}
          {isCash && onEditBalance && (
            <Button variant="edit" size="sm" icon={Scale} onClick={onEditBalance}>
              Edit Balance
            </Button>
          )}
          {onEdit && !isCash && (
            <Button variant="edit" size="sm" icon={Edit} onClick={onEdit}>
              Edit Account
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        {/* TOP SUMMARY STATS */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 rounded-2xl border border-line bg-gradient-to-br from-brand-900 to-brand-950 p-4 text-white shadow-sm sm:col-span-1">
            <div className="text-[11px] font-semibold tracking-wider text-gold-300 uppercase">
              Current Balance
            </div>
            <div className="mt-1 font-display text-2xl font-black text-white sm:text-3xl">
              {rs(activity.computedCurrentBalance)}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-brand-200">
              <span>Opening:</span>
              <span className="font-semibold text-white">{rs(activity.openingBalance)}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-emerald-50/60 p-4 ring-1 ring-emerald-200/50">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-emerald-800 uppercase">
              <span>Total Inflows</span>
              <ArrowDownLeft className="size-4 text-emerald-600" />
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-emerald-700 sm:text-2xl">
              +{rs(activity.totalInflows)}
            </div>
            <div className="mt-2 text-[10px] text-emerald-600">Sales, Loans, Deposits & Inflows</div>
          </div>

          <div className="rounded-2xl border border-line bg-rose-50/60 p-4 ring-1 ring-rose-200/50">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-rose-800 uppercase">
              <span>Total Outflows</span>
              <ArrowUpRight className="size-4 text-rose-600" />
            </div>
            <div className="mt-1 font-display text-xl font-extrabold text-rose-700 sm:text-2xl">
              -{rs(activity.totalOutflows)}
            </div>
            <div className="mt-2 text-[10px] text-rose-600">Purchases, Exps, Deductions & Outflows</div>
          </div>

          <div className="rounded-2xl border border-line bg-slate-50 p-4">
            <div className="text-[11px] font-semibold tracking-wider text-slate-600 uppercase">
              Net Movement
            </div>
            <div
              className={`mt-1 font-display text-xl font-extrabold sm:text-2xl ${
                activity.totalInflows - activity.totalOutflows >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {activity.totalInflows - activity.totalOutflows >= 0 ? '+' : ''}
              {rs(activity.totalInflows - activity.totalOutflows)}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">
              {activity.items.length} total entries recorded
            </div>
          </div>
        </div>

        {/* DETAILS OF OLDER ACCOUNTS (bank name / number / type / notes), only when present */}
        {hasMetadata && (
          <div className="rounded-2xl border border-line bg-slate-50/70 p-3.5 sm:p-4">
            <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
              {legacyBank && (
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Bank Name</span>
                  <p className="mt-0.5 font-bold text-slate-800">{legacyBank}</p>
                </div>
              )}
              {account.accountNumber && (
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Account Number</span>
                  <div className="mt-0.5 flex items-center gap-1 font-mono font-bold text-slate-800">
                    <span className="break-all">{account.accountNumber}</span>
                    <IconButton
                      icon={copied ? Check : Copy}
                      label="Copy Account Number"
                      onClick={handleCopyAccNumber}
                      className="text-slate-400 hover:text-slate-700"
                    />
                  </div>
                </div>
              )}
              {account.accountType && (
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Account Type</span>
                  <p className="mt-0.5 font-bold text-slate-800">{account.accountType}</p>
                </div>
              )}
              {account.notes && (
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Notes</span>
                  <p className="mt-0.5 break-words text-slate-600">{account.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* INFLOW / OUTFLOW BREAKDOWN PILLS */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200/70 bg-gradient-to-br from-white to-emerald-50/20 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-wider text-emerald-800 uppercase">
              <span>Inflow Sources</span>
              <span className="font-extrabold text-emerald-700">+{rs(activity.totalInflows)}</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>{isCash ? 'Sales Collections (Cash):' : 'Sales Collections (Account):'}</span>
                <span className="font-bold text-emerald-700">{rs(activity.breakdown.salesInflow)}</span>
              </div>
              <div className="flex justify-between">
                <span>Loans Borrowed (Finance):</span>
                <span className="font-bold text-teal-700">{rs(activity.breakdown.loanInflow)}</span>
              </div>
              {activity.breakdown.transferInflow > 0 && (
                <div className="flex justify-between">
                  <span>Transfers In (From Cash/Banks):</span>
                  <span className="font-bold text-indigo-700">{rs(activity.breakdown.transferInflow)}</span>
                </div>
              )}
              {(activity.breakdown.additionalInflow > 0 ||
                (!activity.breakdown.salesInflow &&
                  !activity.breakdown.loanInflow &&
                  !activity.breakdown.transferInflow &&
                  activity.totalInflows > 0)) && (
                <div className="flex justify-between">
                  <span>Added Amounts &amp; Balance Edits:</span>
                  <span className="font-bold text-emerald-700">
                    +{rs(activity.breakdown.additionalInflow)}
                  </span>
                </div>
              )}
              {activity.breakdown.purchaseReturnInflow > 0 && (
                <div className="flex justify-between">
                  <span>Purchase Return Refunds:</span>
                  <span className="font-bold text-teal-700">
                    +{rs(activity.breakdown.purchaseReturnInflow)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-rose-200/70 bg-gradient-to-br from-white to-rose-50/20 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between text-xs font-bold tracking-wider text-rose-800 uppercase">
              <span>Outflow Destinations</span>
              <span className="font-extrabold text-rose-700">-{rs(activity.totalOutflows)}</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Purchase Payments:</span>
                <span className="font-bold text-rose-700">{rs(activity.breakdown.purchaseOutflow)}</span>
              </div>
              <div className="flex justify-between">
                <span>Business Expenses:</span>
                <span className="font-bold text-amber-700">{rs(activity.breakdown.expenseOutflow)}</span>
              </div>
              <div className="flex justify-between">
                <span>Loan Repayments:</span>
                <span className="font-bold text-purple-700">{rs(activity.breakdown.loanRepayOutflow)}</span>
              </div>
              {activity.breakdown.transferOutflow > 0 && (
                <div className="flex justify-between">
                  <span>Transfers Out (To Cash/Banks):</span>
                  <span className="font-bold text-orange-700">{rs(activity.breakdown.transferOutflow)}</span>
                </div>
              )}
              {activity.breakdown.manualDeductionOutflow > 0 && (
                <div className="flex justify-between">
                  <span>Deductions &amp; Other Payments:</span>
                  <span className="font-bold text-rose-700">
                    -{rs(activity.breakdown.manualDeductionOutflow)}
                  </span>
                </div>
              )}
              {activity.breakdown.salesReturnOutflow > 0 && (
                <div className="flex justify-between">
                  <span>Sales Return Refunds:</span>
                  <span className="font-bold text-rose-700">
                    -{rs(activity.breakdown.salesReturnOutflow)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* TRANSACTION ACTIVITY LEDGER */}
        <div className="space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-bold text-slate-800 sm:text-base">
                  Transaction History
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  {filteredItems.length}
                </span>
                {groupedByDate.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-500">
                    ({groupedByDate.length} {groupedByDate.length === 1 ? 'day' : 'days'})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">Datewise itemized money in and out of this account</p>
            </div>

            {/* FILTER DIRECTION BUTTONS */}
            <div className="flex items-center self-start rounded-xl bg-slate-100 p-1 text-xs sm:self-auto">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`min-h-8 rounded-lg px-3 font-semibold transition ${
                  filterType === 'all'
                    ? 'bg-white text-brand-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setFilterType('in')}
                className={`min-h-8 rounded-lg px-3 font-semibold transition ${
                  filterType === 'in'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                + Inflows
              </button>
              <button
                type="button"
                onClick={() => setFilterType('out')}
                className={`min-h-8 rounded-lg px-3 font-semibold transition ${
                  filterType === 'out'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                - Outflows
              </button>
            </div>
          </div>

          {/* DATEWISE SEARCH & FILTER CONTROLS BAR */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-slate-50/70 p-2 sm:p-2.5">
            {/* Specific Date Picker Search */}
            <DateField
              value={searchDate}
              onChange={setSearchDate}
              aria-label="Search by specific date"
              className="w-full sm:w-44"
            />

            {/* Quick Date Chips */}
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={searchDate === todayKey ? 'secondary' : 'outline'}
                onClick={() => setSearchDate(searchDate === todayKey ? '' : todayKey)}
              >
                Today
              </Button>
              <Button
                size="sm"
                variant={searchDate === yesterdayKey ? 'secondary' : 'outline'}
                onClick={() => setSearchDate(searchDate === yesterdayKey ? '' : yesterdayKey)}
              >
                Yesterday
              </Button>
            </div>

            {/* Keyword / Text Search */}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search description, party, date, amount..."
              aria-label="Search transactions"
              className="min-w-[160px] flex-1"
            />

            {/* Reset All Filters Button */}
            {(searchDate || searchQuery || filterType !== 'all') && (
              <Button
                size="sm"
                variant="outlineDanger"
                icon={X}
                onClick={() => {
                  setSearchDate('');
                  setSearchQuery('');
                  setFilterType('all');
                }}
              >
                Clear All
              </Button>
            )}
          </div>

          {/* ACTIVE FILTER STATUS PILL */}
          {searchDate && (
            <div className="flex w-fit items-center gap-1.5 rounded-lg border border-brand-200/60 bg-brand-50 px-2.5 py-1 text-xs text-brand-900">
              <CalendarDays className="size-3.5 text-brand-700" />
              <span>
                Showing transactions for: <strong>{formatDateHeading(searchDate)}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSearchDate('')}
                aria-label="Clear date filter"
                className="ml-1 rounded-full p-1 text-brand-700 hover:bg-brand-100 hover:text-brand-950"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* DATEWISE TRANSACTION LEDGER GROUPS */}
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
              <Building2 className="mx-auto size-8 text-slate-400" />
              <p className="mt-2 text-sm font-semibold text-slate-700">No transactions found</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {searchDate || searchQuery || filterType !== 'all'
                  ? 'No entries match your date or search filters.'
                  : 'No sales, purchases, loans or entries recorded for this account yet.'}
              </p>
              {(searchDate || searchQuery || filterType !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchDate('');
                    setSearchQuery('');
                    setFilterType('all');
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-800 hover:underline"
                >
                  Reset all filters
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {groupedByDate.map((group) => {
                const isToday = group.dateKey === todayKey;
                const isYesterday = group.dateKey === yesterdayKey;
                const formattedGroupDate = formatDateHeading(group.dateKey, group.dateRaw);

                return (
                  <div
                    key={group.dateKey}
                    className="overflow-hidden rounded-xl border border-line bg-white shadow-sm"
                  >
                    {/* DATE SECTION HEADER */}
                    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/95 px-3 py-2 backdrop-blur-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex size-6 items-center justify-center rounded-lg ${
                            isToday
                              ? 'bg-brand-900 text-gold-300'
                              : isYesterday
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          <CalendarDays className="size-3.5" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-display text-xs font-bold text-slate-900">
                            {isToday ? 'Today' : isYesterday ? 'Yesterday' : formattedGroupDate}
                          </span>
                          {(isToday || isYesterday) && (
                            <span className="text-[11px] font-medium text-slate-500">
                              • {formattedGroupDate}
                            </span>
                          )}
                          <span className="ml-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            {group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}
                          </span>
                        </div>
                      </div>

                      {/* DAILY INFLOW / OUTFLOW TOTALS */}
                      <div className="flex items-center gap-2.5 text-xs font-bold">
                        {group.totalIn > 0 && <span className="text-emerald-700">+{rs(group.totalIn)}</span>}
                        {group.totalOut > 0 && <span className="text-rose-700">-{rs(group.totalOut)}</span>}
                      </div>
                    </div>

                    {/* ITEMS LIST UNDER THIS DATE */}
                    <div className="divide-y divide-slate-100">
                      {group.items.map((item) => {
                        const isIn = item.direction === 'in';
                        const timeStr = formatItemTime(item.timestamp);

                        return (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 transition hover:bg-slate-50/80"
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                  isIn
                                    ? 'bg-emerald-50 text-emerald-600 ring-emerald-200'
                                    : 'bg-rose-50 text-rose-600 ring-rose-200'
                                }`}
                              >
                                {isIn ? (
                                  <ArrowDownLeft className="size-4" />
                                ) : (
                                  <ArrowUpRight className="size-4" />
                                )}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-900 sm:text-sm">
                                    {item.title}
                                  </span>
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${getTransactionBadgeStyle(
                                      item,
                                    )}`}
                                  >
                                    {item.type}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                                  <span>{formatDateShort(item.date)}</span>
                                  {timeStr && (
                                    <>
                                      <span>•</span>
                                      <span className="font-medium text-slate-600">{timeStr}</span>
                                    </>
                                  )}
                                  {item.subtitle && (
                                    <>
                                      <span>•</span>
                                      <span>{item.subtitle}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex flex-col items-end text-right">
                              <div
                                className={`font-display text-sm font-extrabold tabular-nums sm:text-base ${
                                  isIn ? 'text-emerald-700' : 'text-rose-700'
                                }`}
                              >
                                {isIn ? '+' : '-'}
                                {rs(item.amount)}
                              </div>
                              {canUndo(item) && (
                                <Button
                                  size="sm"
                                  variant="outlineDanger"
                                  icon={RotateCcw}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUndo(item);
                                  }}
                                  title="Undo this transaction"
                                  className="mt-1"
                                >
                                  Undo
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
