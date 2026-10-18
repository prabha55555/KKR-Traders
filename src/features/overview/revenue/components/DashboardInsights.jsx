import { useMemo } from 'react';
import { formatCurrency, toNum } from '@/core/format';
import { PURCHASE_LEDGER, SALES_LEDGER } from '@/core/ledger';
import {
  isWithinRange,
  partyOfBill,
  purchaseBillValue,
  purchasePaid,
  salesBillValue,
} from '../dashboardAnalytics';

const rupees = (n) => {
  const num = typeof n === 'number' ? n : parseFloat(String(n || 0));
  const safe = Number.isFinite(num) ? num : 0;
  return `${safe < 0 ? '-' : ''}₹${formatCurrency(Math.abs(safe)).replace(/\.00$/, '')}`;
};

export function DashboardInsights({ data, rangeKey, dateRanges }) {
  const range = dateRanges[rangeKey]
    ? dateRanges[rangeKey]()
    : { start: new Date(0), end: new Date(2100, 1, 1) };

  const { topCustomers, topSuppliers, topProducts } = useMemo(() => {
    const custMap = new Map();
    const supMap = new Map();
    const prodMap = new Map();
    const avgCost = data.avgCostLookup || (() => 0);
    // parties as the ledger groups them (phone first), so two customers sharing a name are not merged
    const customerOf = partyOfBill(SALES_LEDGER, data.salesBills);
    const supplierOf = partyOfBill(PURCHASE_LEDGER, data.purchaseBills);

    (data.salesBills || []).forEach((bill) => {
      const d = bill.invoiceDate || bill.date || bill.timestamp;
      if (isWithinRange(d, range)) {
        // Customer aggregation
        const party = customerOf.get(bill);
        if (party) {
          const c = custMap.get(party.key) || {
            key: party.key,
            name: party.name,
            sales: 0,
            paid: 0,
            invoices: 0,
          };
          c.sales += salesBillValue(bill);
          c.paid += toNum(bill.amountPaid);
          c.invoices++;
          custMap.set(party.key, c);
        }

        // Product aggregation
        if (bill.products && Array.isArray(bill.products)) {
          bill.products.forEach((p) => {
            if (!p.description) return;
            const pd = prodMap.get(p.description) || { name: p.description, qty: 0, revenue: 0, profit: 0 };
            const qty = toNum(p.qty);
            const rate = toNum(p.rate);
            const cost = avgCost(p.description);
            const itemProfit = (rate - cost) * qty;
            pd.qty += qty;
            pd.revenue += toNum(p.amount) || rate * qty;
            pd.profit += toNum(p.totalProfit ?? itemProfit);
            prodMap.set(p.description, pd);
          });
        }
      }
    });

    (data.purchaseBills || []).forEach((bill) => {
      const d = bill.invoiceDate || bill.date || bill.timestamp;
      if (isWithinRange(d, range)) {
        // Supplier aggregation
        const party = supplierOf.get(bill);
        if (party) {
          const s = supMap.get(party.key) || {
            key: party.key,
            name: party.name,
            purchases: 0,
            paid: 0,
            bills: 0,
          };
          s.purchases += purchaseBillValue(bill);
          s.paid += purchasePaid(bill);
          s.bills++;
          supMap.set(party.key, s);
        }
      }
    });

    return {
      topCustomers: Array.from(custMap.values())
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5),
      topSuppliers: Array.from(supMap.values())
        .sort((a, b) => b.purchases - a.purchases)
        .slice(0, 5),
      topProducts: Array.from(prodMap.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5),
    };
  }, [data, range]);

  return (
    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Top Customers */}
      <div className="flex flex-col rounded-xl border border-line bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-800">Top Customers</h3>
        <div className="flex-1 overflow-auto">
          {topCustomers.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No customer data in this period.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-500">
                  <th className="pb-2 font-medium">Customer</th>
                  <th className="pb-2 text-right font-medium">Sales</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map((c) => (
                  <tr key={c.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 font-medium text-slate-700">{c.name}</td>
                    <td className="py-2 text-right font-bold text-slate-800">{rupees(c.sales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top Suppliers */}
      <div className="flex flex-col rounded-xl border border-line bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-800">Top Suppliers</h3>
        <div className="flex-1 overflow-auto">
          {topSuppliers.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No supplier data in this period.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-slate-500">
                  <th className="pb-2 font-medium">Supplier</th>
                  <th className="pb-2 text-right font-medium">Purchases</th>
                </tr>
              </thead>
              <tbody>
                {topSuppliers.map((s) => (
                  <tr key={s.key} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 font-medium text-slate-700">{s.name}</td>
                    <td className="py-2 text-right font-bold text-slate-800">{rupees(s.purchases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Top Products */}
      <div className="flex flex-col rounded-xl border border-line bg-white p-4 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-slate-800">Top Selling Products</h3>
        <div className="flex-1 overflow-auto">
          {topProducts.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No product data in this period.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-slate-500">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-center font-medium">Qty</th>
                  <th className="pb-2 text-right font-medium">Profit</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.name} className="border-b border-slate-100 text-xs last:border-0 sm:text-sm">
                    <td className="max-w-[120px] truncate py-2 font-medium text-slate-700" title={p.name}>
                      {p.name}
                    </td>
                    <td className="py-2 text-center font-semibold text-slate-600 tabular-nums">{p.qty}</td>
                    <td
                      className={`py-2 text-right font-bold tabular-nums ${p.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                    >
                      {rupees(p.profit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
