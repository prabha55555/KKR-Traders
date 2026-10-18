import { Banknote, PackagePlus, ShoppingBag, TrendingDown, TrendingUp } from 'lucide-react';

import { formatRupees } from '@/core/format';
import { StatCard, StatGrid } from '@/ui';

/** The four "Financial Summary" tiles at the top of the stocks page (net profit green, a loss red). */
export default function FinancialSummary({ summary }) {
  const loss = summary.netProfitLoss < 0;
  return (
    <StatGrid cols={4} className="mb-5">
      <StatCard
        icon={ShoppingBag}
        tone="brand"
        value={formatRupees(summary.totalSales)}
        label="Total Sales"
        hint="All sales, less returns"
      />
      <StatCard
        icon={PackagePlus}
        tone="neutral"
        value={formatRupees(summary.totalPurchases)}
        label="Total Purchases"
        hint="All purchases, less returns"
      />
      <StatCard
        icon={Banknote}
        tone="success"
        value={formatRupees(summary.cashReceived)}
        label="Cash Received"
        hint="Collected from sales, less return refunds"
      />
      <StatCard
        icon={loss ? TrendingDown : TrendingUp}
        tone={loss ? 'danger' : 'success'}
        value={formatRupees(summary.netProfitLoss)}
        label="Net Profit / Loss"
        hint="Net sales minus net purchases"
      />
    </StatGrid>
  );
}
