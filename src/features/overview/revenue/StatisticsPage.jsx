import { useState, useMemo } from 'react';
import { Page, ErrorState } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { fetchDashboardData, computeAnalytics, dateRanges } from './dashboardAnalytics';
import { DashboardKPIs } from './components/DashboardKPIs';
import { DashboardCharts } from './components/DashboardCharts';
import { DashboardInsights } from './components/DashboardInsights';
import { FirestoreUsageSection } from './components/FirestoreUsageSection';

export default function StatisticsPage() {
  const [data, setData] = useState(null);
  const [rangeKey, setRangeKey] = useState('thisMonth');

  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
    try {
      const res = await fetchDashboardData();
      setData(res);
    } catch (e) {
      console.error('Error loading dashboard data:', e);
      throw new Error('Error loading analytics data.');
    }
  });

  const analytics = useMemo(() => {
    if (!data) return null;
    return computeAnalytics(data, rangeKey);
  }, [data, rangeKey]);

  return (
    <Page
      title="Business Statistics"
      icon={TrendingUp}
      actions={
        <div className="flex items-center gap-4">
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value)}
            className="bg-surface rounded-lg border-line px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="thisQuarter">This Quarter</option>
            <option value="thisYear">This Year</option>
          </select>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="bg-surface rounded-lg border border-line p-2 text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      }
    >
      <p className="mt-[-10px] mb-6 text-sm text-slate-500">
        Monitor sales, purchases, profit, inventory and cash flow from one place.
      </p>

      {loading && !data && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <RefreshCw className="mb-4 size-8 animate-spin" />
          <p>Loading analytics engine...</p>
        </div>
      )}

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      {data && analytics && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <DashboardKPIs data={analytics} />
          <DashboardCharts data={data} rangeKey={rangeKey} />
          <DashboardInsights data={data} rangeKey={rangeKey} dateRanges={dateRanges} />
          <FirestoreUsageSection data={data} />
        </div>
      )}
    </Page>
  );
}
