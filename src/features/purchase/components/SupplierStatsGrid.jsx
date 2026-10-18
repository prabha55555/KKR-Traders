import { BadgeIndianRupee, CheckCircle2, Clock, FileText, Tag, Truck, RefreshCcw } from 'lucide-react';
import { StatCard, StatGrid } from '@/ui';
import { formatRupees } from '@/core/format';

/**
 * The six stat tiles at the top of Supplier Details, over ALL suppliers (the search does not change them).
 * Tones follow the app's status colours: counts info, totals brand / neutral, paid success, returns warning, a balance
 * still owed danger (success once nothing is due).
 */
export function SupplierStatsGrid({ stats }) {
  const items = [
    { icon: Truck, value: String(stats.totalSuppliers), label: 'Total Suppliers', tone: 'info' },
    { icon: FileText, value: String(stats.totalBills), label: 'Total Invoices', tone: 'info' },
    { icon: BadgeIndianRupee, value: formatRupees(stats.totalAmount), label: 'Total Amount', tone: 'brand' },
    { icon: CheckCircle2, value: formatRupees(stats.totalPaid), label: 'Total Paid', tone: 'success' },
    { icon: Tag, value: formatRupees(stats.totalDiscount), label: 'Total Discount', tone: 'neutral' },
    {
      icon: Clock,
      value: formatRupees(stats.totalBalance),
      label: 'Total Balance',
      tone: stats.totalBalance > 0 ? 'danger' : 'success',
    },
  ];

  if (stats.totalReturns > 0) {
    items.splice(5, 0, {
      icon: RefreshCcw,
      value: formatRupees(stats.totalReturns),
      label: 'Total Returns',
      tone: 'warning',
    });
  }

  // 2 per row on phones, 3 from tablets, one row of 6 (or 7 with returns) on wide desktops
  return (
    <StatGrid cols={3} className={items.length > 6 ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}>
      {items.map((item, i) => (
        <div key={item.label} className="animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
          <StatCard {...item} />
        </div>
      ))}
    </StatGrid>
  );
}
