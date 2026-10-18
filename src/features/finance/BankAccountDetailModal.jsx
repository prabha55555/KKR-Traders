import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
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
import {
  Badge,
  Button,
  ChoiceChips,
  DateField,
  IconButton,
  KeyValue,
  Modal,
  SearchBar,
  StatCard,
  StatGrid,
  cn,
  useFeedback,
} from '@/ui';
import { getAccountActivity, isLotPaymentEntry, LOT_PAYMENT_UNDO_HINT, toDateKey } from './accountsLogic';
import { findLoanPaymentIndex, removeLoanPayment } from './financeLogic';

const rs = (n) => {
  const val = toNum(n);
  if (val < 0) {
    return `-₹${formatCurrency(Math.abs(val))}`;
  }
  return `₹${formatCurrency(val)}`;
};

/** Entry type badge colour = the money direction (in green, out red, transfers between own accounts blue). */
function transactionTone(item) {
  const t = item.type || '';
  if (t.includes('Transfer')) return 'info';
  return item.direction === 'in' ? 'success' : 'danger';
}

const DIRECTION_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'in', label: '+ Inflows' },
  { value: 'out', label: '- Outflows' },
];

const BREAKDOWN_TONE = {
  success: { ring: 'border-emerald-200', title: 'text-emerald-800', total: 'text-emerald-700' },
  danger: { ring: 'border-red-200', title: 'text-red-800', total: 'text-red-600' },
};

/** Inflow / outflow breakdown panel: tinted title row with the total, then label ..... value lines. */
function BreakdownCard({ title, total, tone, children }) {
  const t = BREAKDOWN_TONE[tone];
  return (
    <div className={cn('min-w-0 rounded-2xl border bg-white p-3.5 shadow-card', t.ring)}>
      <div
        className={cn(
          'mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold tracking-wider uppercase',
          t.title,
        )}
      >
        <span>{title}</span>
        <span className={cn('font-extrabold tabular-nums', t.total)}>{total}</span>
      </div>
      <div className="text-xs [&>div]:text-xs">{children}</div>
    </div>
  );
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

  // the finance copy of a lot payment: the lot keeps its own record, so it is undone from Dyeing & Combing
  const isLotPayment = (item) =>
    (item?.id?.startsWith('tx-in-') || item?.id?.startsWith('tx-out-')) && isLotPaymentEntry(item.sourceRef);

  const canUndo = (item) => {
    if (!item) return false;
    if (isLotPayment(item)) return false;
    if (item.id?.startsWith('tx-in-') || item.id?.startsWith('tx-out-')) return true;
    if (item.type === 'Additional Amount' || item.type === 'Manual Deduction') return true;
    if (item.id?.startsWith('fin-pay-') || item.type === 'Loan Repayment') return true;
    if (item.id?.startsWith('exp-') || item.category === 'Expense') return true;
    return false;
  };

  const handleUndo = async (item) => {
    if (!canUndo(item)) return;
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
        // older loan payments have no id: the loan and the position the activity list recorded find exactly this one
        const allRecords = allData?.financeRecords || [];
        const record =
          allRecords.find((r) => item.recordId !== undefined && r.id === item.recordId) ||
          allRecords.find((r) => findLoanPaymentIndex(r, item.sourceRef) >= 0);
        const updated =
          record &&
          removeLoanPayment(record, findLoanPaymentIndex(record, item.sourceRef, item.paymentIndex));
        if (!updated) {
          toast('Error', 'This loan payment could not be found. Please refresh and try again.', 'error');
          return;
        }
        await db.saveFinanceRecord(updated);
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

  const netMovement = activity.totalInflows - activity.totalOutflows;
  const filtering = !!(searchDate || searchQuery || filterType !== 'all');
  const resetFilters = () => {
    setSearchDate('');
    setSearchQuery('');
    setFilterType('all');
  };

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
        <StatGrid cols={4}>
          <StatCard
            icon={isCash ? Banknote : Building2}
            label="Current Balance"
            value={rs(activity.computedCurrentBalance)}
            tone={toNum(activity.computedCurrentBalance) < 0 ? 'danger' : 'brand'}
            hint={`Opening: ${rs(activity.openingBalance)}`}
          />
          <StatCard
            icon={ArrowDownLeft}
            label="Total Inflows"
            value={`+${rs(activity.totalInflows)}`}
            tone="success"
            hint="Sales, Loans, Deposits & Inflows"
          />
          <StatCard
            icon={ArrowUpRight}
            label="Total Outflows"
            value={`-${rs(activity.totalOutflows)}`}
            tone="danger"
            hint="Purchases, Exps, Deductions & Outflows"
          />
          <StatCard
            icon={Scale}
            label="Net Movement"
            value={`${netMovement >= 0 ? '+' : ''}${rs(netMovement)}`}
            tone={netMovement >= 0 ? 'success' : 'danger'}
            hint={`${activity.items.length} total entries recorded`}
          />
        </StatGrid>

        {/* DETAILS OF OLDER ACCOUNTS (bank name / number / type / notes), only when present */}
        {hasMetadata && (
          <div className="rounded-2xl border border-line bg-slate-50/70 p-4">
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
                      variant={copied ? 'outlineSuccess' : 'outline'}
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

        {/* INFLOW / OUTFLOW BREAKDOWN */}
        <div className="grid gap-3 sm:grid-cols-2">
          <BreakdownCard title="Inflow Sources" total={`+${rs(activity.totalInflows)}`} tone="success">
            <KeyValue
              label={isCash ? 'Sales Collections (Cash):' : 'Sales Collections (Account):'}
              value={rs(activity.breakdown.salesInflow)}
              valueClassName="text-emerald-700"
            />
            <KeyValue
              label="Loans Borrowed (Finance):"
              value={rs(activity.breakdown.loanInflow)}
              valueClassName="text-emerald-700"
            />
            {activity.breakdown.transferInflow > 0 && (
              <KeyValue
                label="Transfers In (From Cash/Banks):"
                value={rs(activity.breakdown.transferInflow)}
                valueClassName="text-sky-700"
              />
            )}
            {(activity.breakdown.additionalInflow > 0 ||
              (!activity.breakdown.salesInflow &&
                !activity.breakdown.loanInflow &&
                !activity.breakdown.transferInflow &&
                activity.totalInflows > 0)) && (
              <KeyValue
                label="Added Amounts & Balance Edits:"
                value={`+${rs(activity.breakdown.additionalInflow)}`}
                valueClassName="text-emerald-700"
              />
            )}
            {activity.breakdown.purchaseReturnInflow > 0 && (
              <KeyValue
                label="Purchase Return Refunds:"
                value={`+${rs(activity.breakdown.purchaseReturnInflow)}`}
                valueClassName="text-emerald-700"
              />
            )}
          </BreakdownCard>

          <BreakdownCard title="Outflow Destinations" total={`-${rs(activity.totalOutflows)}`} tone="danger">
            <KeyValue
              label="Purchase Payments:"
              value={rs(activity.breakdown.purchaseOutflow)}
              valueClassName="text-red-600"
            />
            <KeyValue
              label="Business Expenses:"
              value={rs(activity.breakdown.expenseOutflow)}
              valueClassName="text-red-600"
            />
            <KeyValue
              label="Loan Repayments:"
              value={rs(activity.breakdown.loanRepayOutflow)}
              valueClassName="text-red-600"
            />
            {activity.breakdown.transferOutflow > 0 && (
              <KeyValue
                label="Transfers Out (To Cash/Banks):"
                value={rs(activity.breakdown.transferOutflow)}
                valueClassName="text-sky-700"
              />
            )}
            {activity.breakdown.manualDeductionOutflow > 0 && (
              <KeyValue
                label="Deductions & Other Payments:"
                value={`-${rs(activity.breakdown.manualDeductionOutflow)}`}
                valueClassName="text-red-600"
              />
            )}
            {activity.breakdown.salesReturnOutflow > 0 && (
              <KeyValue
                label="Sales Return Refunds:"
                value={`-${rs(activity.breakdown.salesReturnOutflow)}`}
                valueClassName="text-red-600"
              />
            )}
          </BreakdownCard>
        </div>

        {/* TRANSACTION ACTIVITY LEDGER */}
        <div className="space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-sm font-bold text-brand-800 sm:text-base">
                  Transaction History
                </h3>
                <Badge tone="neutral" className="tabular-nums">
                  {filteredItems.length}
                </Badge>
                {groupedByDate.length > 0 && (
                  <span className="text-[11px] font-semibold text-slate-500">
                    ({groupedByDate.length} {groupedByDate.length === 1 ? 'day' : 'days'})
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">Datewise itemized money in and out of this account</p>
            </div>

            {/* FILTER DIRECTION */}
            <ChoiceChips value={filterType} onChange={setFilterType} options={DIRECTION_OPTIONS} />
          </div>

          {/* DATEWISE SEARCH & FILTER CONTROLS BAR */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-slate-50/70 p-2.5">
            {/* Specific Date Picker Search */}
            <DateField
              value={searchDate}
              onChange={setSearchDate}
              aria-label="Search by specific date"
              className="w-full sm:w-44"
            />

            {/* Quick Date Chips (tap again to clear) */}
            <ChoiceChips
              value={searchDate}
              onChange={(v) => setSearchDate(v === searchDate ? '' : v)}
              options={[
                { value: todayKey, label: 'Today' },
                { value: yesterdayKey, label: 'Yesterday' },
              ]}
            />

            {/* Keyword / Text Search */}
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search description, party, date, amount..."
              aria-label="Search transactions"
              className="min-w-[160px] flex-1"
            />

            {/* Reset All Filters Button */}
            {filtering && (
              <Button size="sm" variant="outlineWarning" icon={X} onClick={resetFilters}>
                Clear All
              </Button>
            )}
          </div>

          {/* ACTIVE FILTER STATUS PILL */}
          {searchDate && (
            <div className="flex w-fit max-w-full items-center gap-1.5 rounded-lg bg-gold-50 px-2.5 py-1 text-xs text-brand-800 ring-1 ring-gold-200 ring-inset">
              <CalendarDays className="size-3.5 shrink-0 text-gold-700" aria-hidden />
              <span className="min-w-0">
                Showing transactions for: <strong>{formatDateHeading(searchDate)}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSearchDate('')}
                aria-label="Clear date filter"
                className="ml-1 shrink-0 rounded-full p-1 text-gold-700 transition hover:bg-gold-100 hover:text-brand-900 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}

          {/* DATEWISE TRANSACTION LEDGER GROUPS */}
          {filteredItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line p-6 text-center">
              <Building2 className="mx-auto size-8 text-gold-600" aria-hidden />
              <p className="mt-2 text-sm font-semibold text-brand-800">No transactions found</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {filtering
                  ? 'No entries match your date or search filters.'
                  : 'No sales, purchases, loans or entries recorded for this account yet.'}
              </p>
              {filtering && (
                <Button size="sm" variant="outlineWarning" onClick={resetFilters} className="mt-3">
                  Reset all filters
                </Button>
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
                    className="overflow-hidden rounded-2xl border border-line bg-white shadow-card"
                  >
                    {/* DATE SECTION HEADER */}
                    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/95 px-3 py-2 backdrop-blur-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <div
                          className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${
                            isToday
                              ? 'bg-brand-900 text-gold-300'
                              : isYesterday
                                ? 'bg-gold-100 text-gold-700'
                                : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          <CalendarDays className="size-3.5" aria-hidden />
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
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
                      <div className="flex items-center gap-2.5 text-xs font-bold tabular-nums">
                        {group.totalIn > 0 && <span className="text-emerald-700">+{rs(group.totalIn)}</span>}
                        {group.totalOut > 0 && <span className="text-red-600">-{rs(group.totalOut)}</span>}
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
                            className="flex items-center justify-between gap-3 p-3 transition hover:bg-gold-50/40"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={`flex size-8 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                  isIn
                                    ? 'bg-emerald-50 text-emerald-600 ring-emerald-200'
                                    : 'bg-red-50 text-red-600 ring-red-200'
                                }`}
                              >
                                {isIn ? (
                                  <ArrowDownLeft className="size-4" />
                                ) : (
                                  <ArrowUpRight className="size-4" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="text-xs font-semibold break-words text-slate-900 sm:text-sm">
                                    {item.title}
                                  </span>
                                  <Badge tone={transactionTone(item)}>{item.type}</Badge>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
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
                                      <span className="break-words">{item.subtitle}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end text-right">
                              <div
                                className={`font-display text-sm font-extrabold whitespace-nowrap tabular-nums sm:text-base ${
                                  isIn ? 'text-emerald-700' : 'text-red-600'
                                }`}
                              >
                                {isIn ? '+' : '-'}
                                {rs(item.amount)}
                              </div>
                              {isLotPayment(item) && (
                                <span className="mt-1 text-[11px] font-semibold text-slate-500">
                                  {LOT_PAYMENT_UNDO_HINT}
                                </span>
                              )}
                              {canUndo(item) && (
                                <Button
                                  size="sm"
                                  variant="outlineWarning"
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
