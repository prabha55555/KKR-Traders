import { useState, useEffect, useMemo } from 'react';
import {
  Database,
  HardDrive,
  ArrowDownCircle,
  ArrowUpCircle,
  Trash2,
  ShieldCheck,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  getFirestoreUsageStats,
  calculateCollectionStorage,
  FIRESTORE_FREE_TIER_LIMITS,
} from '@/core/services/firestoreUsageTracker';
import { Badge, Card, SectionHeader, StatCard, StatGrid } from '@/ui';

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];

/** Quota health colour: blue while there is plenty left, amber from 70 %, red from 90 %. */
const quotaTone = (percent) => (percent >= 90 ? 'danger' : percent >= 70 ? 'warning' : 'info');

export function FirestoreUsageSection({ data }) {
  const [stats, setStats] = useState(getFirestoreUsageStats);

  // the counters are re-read whenever the page's data reloads (on open, focus and reconnect)
  useEffect(() => {
    setStats(getFirestoreUsageStats());
  }, [data]);

  // Storage calculations derived from data
  const storage = useMemo(() => {
    return calculateCollectionStorage(data || {});
  }, [data]);

  const { today, session, limits } = stats;

  const pieData = useMemo(() => {
    return storage.collections
      .filter((col) => col.count > 0 || col.bytes > 0)
      .map((col) => ({
        name: col.label,
        value: col.kb > 0 ? col.kb : 0.1,
        actualKb: col.kb,
        count: col.count,
        color: col.color,
      }));
  }, [storage]);

  const operationsBarData = useMemo(() => {
    return [
      {
        name: "Today's Ops",
        Reads: today.reads,
        Writes: today.writes,
        Deletes: today.deletes,
        'Cache Hits': today.cacheHits,
      },
      {
        name: 'This Session',
        Reads: session.reads,
        Writes: session.writes,
        Deletes: session.deletes,
        'Cache Hits': session.cacheHits,
      },
    ];
  }, [today, session]);

  return (
    <Card>
      <SectionHeader
        title="Firestore Free Tier Usage (Spark Plan)"
        icon={Database}
        right={<Badge tone="success">100% Free Tier (₹0.00)</Badge>}
        className="mb-1"
      />
      <p className="mb-5 text-xs text-slate-500 sm:text-sm">
        Live operation tracking & zero-cost client-side database storage analysis.
      </p>

      {/* 4 Main Quota Cards (blue while there is room, amber then red as the daily quota fills) */}
      <StatGrid cols={4}>
        <StatCard
          icon={ArrowDownCircle}
          label={`Document Reads · of ${limits.DAILY_READS.toLocaleString()}`}
          value={today.reads.toLocaleString()}
          tone={quotaTone(today.readQuotaPercent)}
          hint={`${today.readsRemaining.toLocaleString()} left today · +${today.cacheHits} cached`}
        />
        <StatCard
          icon={ArrowUpCircle}
          label={`Document Writes · of ${limits.DAILY_WRITES.toLocaleString()}`}
          value={today.writes.toLocaleString()}
          tone={quotaTone(today.writeQuotaPercent)}
          hint={`${today.writesRemaining.toLocaleString()} left today · ${today.writeQuotaPercent}% used`}
        />
        <StatCard
          icon={Trash2}
          label={`Document Deletes · of ${limits.DAILY_DELETES.toLocaleString()}`}
          value={today.deletes.toLocaleString()}
          tone={quotaTone(today.deleteQuotaPercent)}
          hint={`${today.deletesRemaining.toLocaleString()} left today · Recycle Bin safe`}
        />
        <StatCard
          icon={HardDrive}
          label={`Firestore Storage · of ${storage.storageLimitMb.toLocaleString()} MB (1 GB)`}
          value={storage.totalMb > 0 ? `${storage.totalMb} MB` : `${storage.totalKb} KB`}
          tone={quotaTone(storage.storagePercent)}
          hint={`${storage.totalDocs.toLocaleString()} documents · ${storage.storagePercent}% of 1 GB`}
        />
      </StatGrid>

      {/* Visual Charts & Breakdown Section */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Storage Distribution by Collection */}
        <div className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-5 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="size-4 shrink-0 text-gold-600" aria-hidden />
              <h3 className="text-sm font-bold text-brand-800">Storage Distribution by Collection</h3>
            </div>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              Total {storage.totalKb} KB ({storage.totalMb} MB)
            </span>
          </div>

          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-12">
            {/* Pie Chart */}
            <div className="flex h-44 items-center justify-center sm:col-span-5">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={36}
                      outerRadius={65}
                      paddingAngle={3}
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name, item) => [
                        `${item.payload.actualKb} KB (${item.payload.count} docs)`,
                        name,
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-slate-400">No collection data loaded</p>
              )}
            </div>

            {/* Collection Breakdown List */}
            <div className="max-h-52 space-y-2.5 overflow-y-auto pr-1 sm:col-span-7">
              {storage.collections.map((col) => (
                <div
                  key={col.key}
                  className="flex items-center justify-between gap-2 rounded-lg p-1.5 text-xs transition hover:bg-gold-50"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="truncate font-medium text-slate-700" title={col.label}>
                      {col.label}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">({col.count} docs)</span>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <span className="font-bold text-slate-800">
                      {col.kb > 1024 ? `${col.mb} MB` : `${col.kb} KB`}
                    </span>
                    <span className="ml-1.5 text-[10px] text-slate-400">{col.sharePercent}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Operations Breakdown Chart */}
        <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-line bg-white p-4 sm:p-5 lg:col-span-5">
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-gold-600" aria-hidden />
                <h3 className="text-sm font-bold text-brand-800">Operations Breakdown</h3>
              </div>
              <Badge tone="success">
                <ShieldCheck className="mr-1 inline size-3.5 align-[-3px]" aria-hidden />
                Optimal Efficiency
              </Badge>
            </div>

            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={operationsBarData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Reads" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Writes" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Cache Hits" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <p className="mt-2 rounded-xl border border-line bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-700">Cache Advantage:</span> Local IndexedDB persistence
            and in-memory caches handle repeated requests without consuming your 50,000 daily read limit.
          </p>
        </div>
      </div>

      {/* Real-time vs Estimated Transparency Notice */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-line bg-slate-50 p-3.5 text-xs text-slate-600">
        <Info className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong className="text-slate-800">Real-Time vs. Estimated Usage:</strong>{' '}
            <span className="font-medium text-sky-700">Reads, Writes, and Deletes</span> are monitored live in
            real time as actions occur in your application and persist in local storage.{' '}
            <span className="font-medium text-brand-800">Storage usage</span> is calculated directly from
            current document payloads and Firestore index overhead.
          </p>
          <p className="text-[11px] text-slate-500">
            Zero-Cost Guarantee: This monitor executes 100% locally in your browser. It does not invoke any
            billed Firebase Management APIs or extra Firestore queries.
          </p>
        </div>
      </div>
    </Card>
  );
}
