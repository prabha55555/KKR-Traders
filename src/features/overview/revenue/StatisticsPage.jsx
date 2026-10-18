import { useState, useMemo } from 'react';
import { ErrorState, LoadingState, Page, RefreshButton, SelectField } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { TrendingUp } from 'lucide-react';
import { fetchDashboardData, computeAnalytics, dateRanges } from './dashboardAnalytics';
import { DashboardKPIs } from './components/DashboardKPIs';
import { DashboardCharts } from './components/DashboardCharts';
import { DashboardInsights } from './components/DashboardInsights';
import { FirestoreUsageSection } from './components/FirestoreUsageSection';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This Week' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'thisYear', label: 'This Year' },
];

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
        <div className="flex items-center gap-2">
          <SelectField
            aria-label="Period"
            value={rangeKey}
            onChange={setRangeKey}
            options={RANGE_OPTIONS}
            className="w-36"
          />
          <RefreshButton onClick={refresh} loading={refreshing} />
        </div>
      }
    >
      <p className="mt-[-10px] mb-6 text-sm text-slate-500">
        Monitor sales, purchases, profit, inventory and cash flow from one place.
      </p>

      {loading && !data && <LoadingState label="Loading statistics…" />}

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      {data && analytics && (
        <div className="animate-fade-in">
          <DashboardKPIs data={analytics} />
          <DashboardCharts data={data} rangeKey={rangeKey} />
          <DashboardInsights data={data} rangeKey={rangeKey} dateRanges={dateRanges} />
          <FirestoreUsageSection data={data} />
        </div>
      )}
    </Page>
  );
}
