import { Package, Truck, Users } from 'lucide-react';
import { useMemo } from 'react';
import { formatCurrency } from '@/core/format';
import { Card, SectionHeader, cn } from '@/ui';
import { computeInsights } from '../dashboardAnalytics';

const rupees = (n) => {
  const num = typeof n === 'number' ? n : parseFloat(String(n || 0));
  const safe = Number.isFinite(num) ? num : 0;
  return `${safe < 0 ? '-' : ''}₹${formatCurrency(Math.abs(safe)).replace(/\.00$/, '')}`;
};

export function DashboardInsights({ data, rangeKey, dateRanges }) {
  const range = dateRanges[rangeKey]
    ? dateRanges[rangeKey]()
    : { start: new Date(0), end: new Date(2100, 1, 1) };

  const { topCustomers, topSuppliers, topProducts } = useMemo(
    () => computeInsights(data, range),
    [data, range],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <InsightCard title="Top Customers" icon={Users} empty="No customer data in this period.">
        {topCustomers.length > 0 && (
          <InsightTable
            columns={[{ header: 'Customer' }, { header: 'Sales', num: true }]}
            rows={topCustomers.map((c) => ({
              key: c.key,
              cells: [c.name, <span className="font-bold text-brand-800">{rupees(c.sales)}</span>],
            }))}
          />
        )}
      </InsightCard>

      <InsightCard title="Top Suppliers" icon={Truck} empty="No supplier data in this period.">
        {topSuppliers.length > 0 && (
          <InsightTable
            columns={[{ header: 'Supplier' }, { header: 'Purchases', num: true }]}
            rows={topSuppliers.map((s) => ({
              key: s.key,
              cells: [s.name, <span className="font-bold text-brand-800">{rupees(s.purchases)}</span>],
            }))}
          />
        )}
      </InsightCard>

      <InsightCard title="Top Selling Products" icon={Package} empty="No product data in this period.">
        {topProducts.length > 0 && (
          <InsightTable
            columns={[{ header: 'Product' }, { header: 'Qty', num: true }, { header: 'Profit', num: true }]}
            rows={topProducts.map((p) => ({
              key: p.name,
              cells: [
                p.name,
                p.qty,
                <span className={cn('font-bold', p.profit >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                  {rupees(p.profit)}
                </span>,
              ],
            }))}
          />
        )}
      </InsightCard>
    </div>
  );
}

/** One "top 5" panel: card + section header, the table or an empty line. */
function InsightCard({ title, icon, empty, children }) {
  return (
    <Card className="flex min-w-0 flex-col">
      <SectionHeader title={title} icon={icon} />
      {children || <p className="text-sm text-slate-500">{empty}</p>}
    </Card>
  );
}

/** The app's bordered table: text columns wrap (long names break instead of clipping), number columns stay on one line. */
function InsightTable({ columns, rows }) {
  return (
    <div className="erp-table-wrap">
      <table className="erp-table erp-table-dense">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.header} className={c.num ? 'num' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {r.cells.map((cell, i) => (
                <td
                  key={columns[i].header}
                  className={columns[i].num ? 'num' : 'font-medium [overflow-wrap:anywhere] text-slate-700'}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
