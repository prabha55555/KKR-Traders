import { BadgeIndianRupee, CheckCircle2, Clock, FileText, Tag, Truck, RefreshCcw } from 'lucide-react';
import { StatCard } from '@/ui';
import { formatRupees } from '@/core/format';

/** The six stat tiles at the top of Supplier Details, over ALL suppliers (the search does not change them). */
export function SupplierStatsGrid({ stats }) {
  const items = [
    { icon: Truck, value: String(stats.totalSuppliers), label: 'Total Suppliers', tint: 'brand' },
    { icon: FileText, value: String(stats.totalBills), label: 'Total Invoices', tint: 'sky' },
    { icon: BadgeIndianRupee, value: formatRupees(stats.totalAmount), label: 'Total Amount', tint: 'brand' },
    { icon: CheckCircle2, value: formatRupees(stats.totalPaid), label: 'Total Paid', tint: 'green' },
    { icon: Tag, value: formatRupees(stats.totalDiscount), label: 'Total Discount', tint: 'violet' },
    {
      icon: Clock,
      value: formatRupees(stats.totalBalance),
      label: 'Total Balance',
      tint: 'red',
      valueClassName: stats.totalBalance > 0 ? 'text-red-600' : undefined,
    },
  ];

  if (stats.totalReturns > 0) {
    items.splice(5, 0, {
      icon: RefreshCcw,
      value: formatRupees(stats.totalReturns),
      label: 'Total Returns',
      tint: 'amber',
    });
  }

  return (
    <div
      className={`grid grid-cols-2 gap-3.5 sm:grid-cols-3 ${items.length > 6 ? 'xl:grid-cols-7' : 'xl:grid-cols-6'}`}
    >
      {items.map((item, i) => (
        <div key={item.label} className="animate-rise" style={{ animationDelay: `${i * 45}ms` }}>
          <StatCard {...item} className="h-full" />
        </div>
      ))}
    </div>
  );
}
