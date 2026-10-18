import { TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency } from '@/core/format';
import { StatCard, cn } from '@/ui';

const rupees = (n) => {
  const num = typeof n === 'number' ? n : parseFloat(String(n || 0));
  const safe = Number.isFinite(num) ? num : 0;
  return `${safe < 0 ? '-' : ''}₹${formatCurrency(Math.abs(safe)).replace(/\.00$/, '')}`;
};

function KpiTrend({ current, previous, inverse = false }) {
  if (!previous || previous === 0) return null;
  const diff = current - previous;
  const percent = (diff / previous) * 100;

  const isPositive = percent > 0;
  // If inverse is true (like expenses), positive is bad.
  const isGood = inverse ? !isPositive : isPositive;

  return (
    <div
      className={cn(
        'mt-1 flex items-center gap-1 text-xs font-semibold',
        isGood ? 'text-emerald-600' : 'text-red-500',
      )}
    >
      {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      <span>{Math.abs(percent).toFixed(1)}% vs previous</span>
    </div>
  );
}

export function DashboardKPIs({ data }) {
  const {
    current,
    previous,
    customerOutstanding,
    customersWithDues,
    suppliersOutstanding,
    suppliersWithDues,
  } = data;

  const profitMargin =
    current.salesAmount > 0 ? ((current.profitAmount / current.salesAmount) * 100).toFixed(1) : 0;
  const netProfit = current.profitAmount - current.expensesAmount;

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-white p-4 shadow-sm">
        <div>
          <h3 className="truncate text-sm font-medium text-slate-500">Total Sales</h3>
          <p
            className="mt-1 truncate text-xl font-bold tracking-tight text-slate-800 sm:text-2xl"
            title={rupees(current.salesAmount)}
          >
            {rupees(current.salesAmount)}
          </p>
        </div>
        <div>
          <p className="mt-2 text-xs text-slate-500">{current.salesCount} Invoices</p>
          <KpiTrend current={current.salesAmount} previous={previous?.salesAmount} />
        </div>
      </div>

      <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-white p-4 shadow-sm">
        <div>
          <h3 className="truncate text-sm font-medium text-slate-500">Total Purchases</h3>
          <p
            className="mt-1 truncate text-xl font-bold tracking-tight text-slate-800 sm:text-2xl"
            title={rupees(current.purchasesAmount)}
          >
            {rupees(current.purchasesAmount)}
          </p>
        </div>
        <div className="mt-2">
          <KpiTrend current={current.purchasesAmount} previous={previous?.purchasesAmount} inverse />
        </div>
      </div>

      <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-white p-4 shadow-sm">
        <div>
          <h3 className="truncate text-sm font-medium text-slate-500">Gross Profit</h3>
          <p
            className={cn(
              'mt-1 truncate text-xl font-bold tracking-tight sm:text-2xl',
              current.profitAmount >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}
            title={rupees(current.profitAmount)}
          >
            {rupees(current.profitAmount)}
          </p>
        </div>
        <div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-emerald-700">{profitMargin}% Margin</span>
            <span
              className={cn('font-medium', netProfit >= 0 ? 'text-slate-600' : 'text-red-600')}
              title={`Net Profit: Gross Profit minus Expenses`}
            >
              Net: {rupees(netProfit)}
            </span>
          </div>
          <KpiTrend current={current.profitAmount} previous={previous?.profitAmount} />
        </div>
      </div>

      <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-white p-4 shadow-sm">
        <div>
          <h3 className="truncate text-sm font-medium text-slate-500">Total Expenses</h3>
          <p
            className="mt-1 truncate text-xl font-bold tracking-tight text-slate-800 sm:text-2xl"
            title={rupees(current.expensesAmount)}
          >
            {rupees(current.expensesAmount)}
          </p>
        </div>
        <div className="mt-2">
          <KpiTrend current={current.expensesAmount} previous={previous?.expensesAmount} inverse />
        </div>
      </div>

      <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-white p-4 shadow-sm">
        <div>
          <h3 className="truncate text-sm font-medium text-slate-500">Customer Outstanding</h3>
          <p
            className="mt-1 truncate text-xl font-bold tracking-tight text-orange-600 sm:text-2xl"
            title={rupees(customerOutstanding)}
          >
            {rupees(customerOutstanding)}
          </p>
        </div>
        <p className="mt-2 truncate text-xs text-slate-500">From {customersWithDues} customers</p>
      </div>

      <div className="flex flex-col justify-between overflow-hidden rounded-xl border border-line bg-white p-4 shadow-sm">
        <div>
          <h3 className="truncate text-sm font-medium text-slate-500">Supplier Outstanding</h3>
          <p
            className="mt-1 truncate text-xl font-bold tracking-tight text-red-600 sm:text-2xl"
            title={rupees(suppliersOutstanding)}
          >
            {rupees(suppliersOutstanding)}
          </p>
        </div>
        <p className="mt-2 truncate text-xs text-slate-500">To {suppliersWithDues} suppliers</p>
      </div>
    </div>
  );
}
