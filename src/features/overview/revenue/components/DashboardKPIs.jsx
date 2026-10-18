import { HandCoins, PackagePlus, Receipt, TrendingDown, TrendingUp, Truck, Wallet } from 'lucide-react';
import { formatCurrency } from '@/core/format';
import { StatCard, StatGrid, cn } from '@/ui';

const rupees = (n) => {
  const num = typeof n === 'number' ? n : parseFloat(String(n || 0));
  const safe = Number.isFinite(num) ? num : 0;
  return `${safe < 0 ? '-' : ''}₹${formatCurrency(Math.abs(safe)).replace(/\.00$/, '')}`;
};

/** "↗ 12.5% vs prev" (green when the change is good, red when bad), shown inline in a card's hint line. */
function KpiTrend({ current, previous, inverse = false }) {
  if (!previous || previous === 0) return null;
  const diff = current - previous;
  const percent = (diff / previous) * 100;

  const isPositive = percent > 0;
  // If inverse is true (like expenses), positive is bad.
  const isGood = inverse ? !isPositive : isPositive;
  const Icon = isPositive ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn('font-semibold', isGood ? 'text-emerald-600' : 'text-red-600')}
      title={`${Math.abs(percent).toFixed(1)}% ${isPositive ? 'up' : 'down'} vs the previous period`}
    >
      <Icon className="mr-0.5 inline size-3 align-[-2px]" aria-hidden />
      {Math.abs(percent).toFixed(1)}% vs prev
    </span>
  );
}

/** "first · second" for a card's hint line (either part may be empty). */
function Hint({ children }) {
  const parts = (Array.isArray(children) ? children : [children]).filter(Boolean);
  if (!parts.length) return null;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? ' · ' : null}
          {p}
        </span>
      ))}
    </>
  );
}

/** The six headline figures of the Statistics page (same <StatCard> as every other KPI in the app). */
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
    <StatGrid cols={3}>
      <StatCard
        icon={Receipt}
        label="Total Sales"
        value={rupees(current.salesAmount)}
        tone="brand"
        hint={
          <Hint>
            {`${current.salesCount} Invoices`}
            <KpiTrend current={current.salesAmount} previous={previous?.salesAmount} />
          </Hint>
        }
      />
      <StatCard
        icon={PackagePlus}
        label="Total Purchases"
        value={rupees(current.purchasesAmount)}
        tone="neutral"
        hint={<KpiTrend current={current.purchasesAmount} previous={previous?.purchasesAmount} inverse />}
      />
      <StatCard
        icon={current.profitAmount >= 0 ? TrendingUp : TrendingDown}
        label={`Gross Profit · ${profitMargin}% Margin`}
        value={rupees(current.profitAmount)}
        tone={current.profitAmount >= 0 ? 'success' : 'danger'}
        hint={
          <Hint>
            <span
              className={netProfit >= 0 ? 'text-slate-500' : 'text-red-600'}
              title="Net Profit: Gross Profit minus Expenses"
            >
              Net: {rupees(netProfit)}
            </span>
            <KpiTrend current={current.profitAmount} previous={previous?.profitAmount} />
          </Hint>
        }
      />
      <StatCard
        icon={Wallet}
        label="Total Expenses"
        value={rupees(current.expensesAmount)}
        tone="danger"
        hint={<KpiTrend current={current.expensesAmount} previous={previous?.expensesAmount} inverse />}
      />
      <StatCard
        icon={HandCoins}
        label="Customer Outstanding"
        value={rupees(customerOutstanding)}
        tone="warning"
        hint={`From ${customersWithDues} customers`}
      />
      <StatCard
        icon={Truck}
        label="Supplier Outstanding"
        value={rupees(suppliersOutstanding)}
        tone="danger"
        hint={`To ${suppliersWithDues} suppliers`}
      />
    </StatGrid>
  );
}
