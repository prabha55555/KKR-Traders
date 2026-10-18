import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency, toNum } from '@/core/format';
import { format, eachDayOfInterval, eachMonthOfInterval } from 'date-fns';
import {
  dateRanges,
  isWithinRange,
  parseAnyDate,
  purchaseBillValue,
  salesBillValue,
} from '../dashboardAnalytics';

const rupees = (n) => {
  const num = toNum(n);
  return `${num < 0 ? '-' : ''}₹${formatCurrency(Math.abs(num))}`;
};

const formatYAxis = (val) => {
  if (!val || val === 0) return '₹0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${sign}₹${Math.round(abs / 1000)}k`;
  return `${sign}₹${abs}`;
};

const RANGE_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  thisQuarter: 'This Quarter',
  thisYear: 'This Year',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
        <p className="mb-2 text-xs font-bold text-slate-800 sm:text-sm">{label}</p>
        <div className="space-y-1">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4 text-xs font-semibold">
              <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: entry.color }} />
                {entry.name}:
              </span>
              <span className="font-bold text-slate-900 tabular-nums">{rupees(entry.value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export function DashboardCharts({ data, rangeKey }) {
  const chartData = useMemo(() => {
    if (!data) return [];

    const range = dateRanges[rangeKey] ? dateRanges[rangeKey]() : null;

    // Initialize time-interval buckets for the selected rangeKey
    const buckets = [];
    const bucketMap = new Map();

    const addBucket = (key, label, dateObj) => {
      const b = { key, name: label, dateObj, Sales: 0, Purchases: 0, Profit: 0, Expenses: 0 };
      buckets.push(b);
      bucketMap.set(key, b);
      return b;
    };

    if ((rangeKey === 'today' || rangeKey === 'yesterday') && range) {
      const baseDate = range.start;
      const slots = [
        { key: '06', label: '6 AM', hStart: 0, hEnd: 8 },
        { key: '09', label: '9 AM', hStart: 8, hEnd: 11 },
        { key: '12', label: '12 PM', hStart: 11, hEnd: 14 },
        { key: '15', label: '3 PM', hStart: 14, hEnd: 17 },
        { key: '18', label: '6 PM', hStart: 17, hEnd: 20 },
        { key: '21', label: '9 PM', hStart: 20, hEnd: 24 },
      ];
      slots.forEach((s) => {
        const d = new Date(baseDate);
        d.setHours(s.hStart, 0, 0, 0);
        addBucket(s.key, s.label, d);
      });
    } else if (rangeKey === 'thisWeek' && range) {
      const days = eachDayOfInterval({ start: range.start, end: range.end });
      days.forEach((d) => {
        const key = format(d, 'yyyy-MM-dd');
        const label = format(d, 'EEE');
        addBucket(key, label, d);
      });
    } else if ((rangeKey === 'thisMonth' || rangeKey === 'lastMonth') && range) {
      const days = eachDayOfInterval({ start: range.start, end: range.end });
      days.forEach((d) => {
        const key = format(d, 'yyyy-MM-dd');
        const label = format(d, 'd MMM');
        addBucket(key, label, d);
      });
    } else if (rangeKey === 'thisQuarter' && range) {
      const months = eachMonthOfInterval({ start: range.start, end: range.end });
      months.forEach((d) => {
        const key = format(d, 'yyyy-MM');
        const label = format(d, 'MMM yyyy');
        addBucket(key, label, d);
      });
    } else if (rangeKey === 'thisYear' && range) {
      const months = eachMonthOfInterval({ start: range.start, end: range.end });
      months.forEach((d) => {
        const key = format(d, 'yyyy-MM');
        const label = format(d, 'MMM');
        addBucket(key, label, d);
      });
    } else {
      addBucket('all', 'Period', new Date());
    }

    const findBucket = (dateVal) => {
      const d = parseAnyDate(dateVal);
      if (!d) return null;

      if (range && !isWithinRange(d, range)) {
        return null;
      }

      if (rangeKey === 'today' || rangeKey === 'yesterday') {
        const h = d.getHours();
        // If exact midnight from pure date string, place into midday slot
        if (h === 0 && d.getMinutes() === 0 && d.getSeconds() === 0) {
          return bucketMap.get('12') || buckets[0];
        }
        if (h < 8) return bucketMap.get('06');
        if (h < 11) return bucketMap.get('09');
        if (h < 14) return bucketMap.get('12');
        if (h < 17) return bucketMap.get('15');
        if (h < 20) return bucketMap.get('18');
        return bucketMap.get('21');
      }

      if (rangeKey === 'thisWeek' || rangeKey === 'thisMonth' || rangeKey === 'lastMonth') {
        const key = format(d, 'yyyy-MM-dd');
        return bucketMap.get(key);
      }

      if (rangeKey === 'thisQuarter' || rangeKey === 'thisYear') {
        const key = format(d, 'yyyy-MM');
        return bucketMap.get(key);
      }

      return buckets[0];
    };

    // 1. Accumulate Sales & Profit strictly within the active date range
    (data.salesBills || []).forEach((bill) => {
      const dVal = bill.invoiceDate || bill.date || bill.timestamp;
      const b = findBucket(dVal);
      if (b) {
        b.Sales += salesBillValue(bill);
        const p = bill.computedProfit !== undefined ? toNum(bill.computedProfit) : toNum(bill.profit || 0);
        b.Profit += p;
      }
    });

    // 2. Accumulate Purchases strictly within the active date range
    (data.purchaseBills || []).forEach((bill) => {
      const dVal = bill.invoiceDate || bill.date || bill.timestamp;
      const b = findBucket(dVal);
      if (b) {
        b.Purchases += purchaseBillValue(bill);
      }
    });

    // 3. Accumulate Expenses strictly within the active date range
    (data.expenses || []).forEach((exp) => {
      const dVal = exp.date || exp.timestamp;
      const b = findBucket(dVal);
      if (b) {
        b.Expenses += toNum(exp.amount);
      }
    });

    return buckets;
  }, [data, rangeKey]);

  const rangeTitle = RANGE_LABELS[rangeKey] || rangeKey;

  return (
    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Area Chart: Sales vs Purchases vs Profit */}
      <div className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight text-slate-800 sm:text-lg">
              Sales Performance
            </h3>
            <p className="text-xs text-slate-500">Sales, purchases & gross profit for {rangeTitle}</p>
          </div>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickMargin={8} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={formatYAxis} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} />
              <Area
                type="monotone"
                dataKey="Sales"
                stroke="#0ea5e9"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorSales)"
              />
              <Area
                type="monotone"
                dataKey="Purchases"
                stroke="#f59e0b"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPurchases)"
              />
              <Area
                type="monotone"
                dataKey="Profit"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorProfit)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bar Chart: Revenue vs Expenses */}
      <div className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold tracking-tight text-slate-800 sm:text-lg">
              Revenue vs Expenses
            </h3>
            <p className="text-xs text-slate-500">Operating income, expenses & profit for {rangeTitle}</p>
          </div>
        </div>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickMargin={8} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={formatYAxis} />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} />
              <Bar dataKey="Sales" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
              <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} name="Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
