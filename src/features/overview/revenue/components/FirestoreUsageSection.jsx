import { useState, useEffect, useMemo } from 'react';
import {
  Database,
  HardDrive,
  ArrowDownCircle,
  ArrowUpCircle,
  Trash2,
  Zap,
  ShieldCheck,
  Info,
  Layers,
  Sparkles,
  RefreshCw,
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
import { cn } from '@/ui/cn';

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1'];

export function FirestoreUsageSection({ data }) {
  const [stats, setStats] = useState(getFirestoreUsageStats());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshStats = () => {
    setIsRefreshing(true);
    setStats(getFirestoreUsageStats());
    setTimeout(() => setIsRefreshing(false), 300);
  };

  useEffect(() => {
    refreshStats();
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
    <div className="mt-10 rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-amber-600">
            <Database className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-slate-800">
                Firestore Free Tier Usage (Spark Plan)
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                100% Free Tier (₹0.00)
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Live operation tracking & zero-cost client-side database storage analysis.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshStats}
            title="Refresh statistics"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50"
          >
            <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin text-brand-600')} />
            Refresh
          </button>
        </div>
      </div>

      {/* 4 Main Quota Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Document Reads */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <ArrowDownCircle className="size-4 text-blue-600" />
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Document Reads
                </span>
              </div>
              <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                Real-Time
              </span>
            </div>
            <div className="mt-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold tracking-tight text-slate-800">
                  {today.reads.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  / {limits.DAILY_READS.toLocaleString()}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-blue-600 transition-all duration-500"
                  style={{ width: `${Math.max(1, Math.min(100, today.readQuotaPercent))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="font-medium text-slate-500">
              {today.readsRemaining.toLocaleString()} remaining today
            </span>
            <span
              className="flex items-center gap-1 font-semibold text-emerald-600"
              title="Cached reads saved by local IndexedDB and memory"
            >
              <Zap className="size-3" />+{today.cacheHits} cached
            </span>
          </div>
        </div>

        {/* Document Writes */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <ArrowUpCircle className="size-4 text-emerald-600" />
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Document Writes
                </span>
              </div>
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                Real-Time
              </span>
            </div>
            <div className="mt-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold tracking-tight text-slate-800">
                  {today.writes.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  / {limits.DAILY_WRITES.toLocaleString()}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-emerald-600 transition-all duration-500"
                  style={{ width: `${Math.max(1, Math.min(100, today.writeQuotaPercent))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="font-medium text-slate-500">
              {today.writesRemaining.toLocaleString()} remaining today
            </span>
            <span className="font-medium text-slate-400">{today.writeQuotaPercent}% used</span>
          </div>
        </div>

        {/* Document Deletes */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <Trash2 className="size-4 text-rose-600" />
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Document Deletes
                </span>
              </div>
              <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                Real-Time
              </span>
            </div>
            <div className="mt-1">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold tracking-tight text-slate-800">
                  {today.deletes.toLocaleString()}
                </span>
                <span className="text-xs font-medium text-slate-400">
                  / {limits.DAILY_DELETES.toLocaleString()}
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-rose-600 transition-all duration-500"
                  style={{ width: `${Math.max(1, Math.min(100, today.deleteQuotaPercent))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="font-medium text-slate-500">
              {today.deletesRemaining.toLocaleString()} remaining today
            </span>
            <span className="font-medium text-slate-400">Recycle Bin safe</span>
          </div>
        </div>

        {/* Total Storage */}
        <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-4 shadow-2xs">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-600">
                <HardDrive className="size-4 text-purple-600" />
                <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  Firestore Storage
                </span>
              </div>
              <span className="rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700">
                Live Estimated
              </span>
            </div>
            <div className="mt-1">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-bold tracking-tight text-slate-800">
                    {storage.totalMb > 0 ? `${storage.totalMb} MB` : `${storage.totalKb} KB`}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-400">
                  / {storage.storageLimitMb.toLocaleString()} MB (1 GB)
                </span>
              </div>
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-purple-600 transition-all duration-500"
                  style={{ width: `${Math.max(0.5, Math.min(100, storage.storagePercent))}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs">
            <span className="font-medium text-slate-500">
              {storage.totalDocs.toLocaleString()} total documents
            </span>
            <span className="font-semibold text-purple-700">{storage.storagePercent}% of 1 GB</span>
          </div>
        </div>
      </div>

      {/* Visual Charts & Breakdown Section */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Storage Distribution by Collection */}
        <div className="rounded-xl border border-line bg-white p-5 shadow-2xs lg:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-slate-600" />
              <h3 className="text-sm font-bold text-slate-800">Storage Distribution by Collection</h3>
            </div>
            <span className="text-xs font-medium text-slate-500">
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
                  className="flex items-center justify-between rounded-lg p-1.5 text-xs transition hover:bg-slate-50"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: col.color }} />
                    <span className="truncate font-medium text-slate-700">{col.label}</span>
                    <span className="text-[10px] text-slate-400">({col.count} docs)</span>
                  </div>
                  <div className="shrink-0 text-right">
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
        <div className="flex flex-col justify-between rounded-xl border border-line bg-white p-5 shadow-2xs lg:col-span-5">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-800">Operations Breakdown</h3>
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                <ShieldCheck className="size-3.5" />
                Optimal Efficiency
              </span>
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

          <p className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-700">Cache Advantage:</span> Local IndexedDB persistence
            and in-memory caches handle repeated requests without consuming your 50,000 daily read limit.
          </p>
        </div>
      </div>

      {/* Real-time vs Estimated Transparency Notice */}
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50 p-3.5 text-xs text-slate-600">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong className="text-slate-800">Real-Time vs. Estimated Usage:</strong>{' '}
            <span className="font-medium text-blue-700">Reads, Writes, and Deletes</span> are monitored live
            in real time as actions occur in your application and persist in local storage.{' '}
            <span className="font-medium text-purple-700">Storage usage</span> is calculated directly from
            current document payloads and Firestore index overhead.
          </p>
          <p className="text-[11px] text-slate-500">
            Zero-Cost Guarantee: This monitor executes 100% locally in your browser. It does not invoke any
            billed Firebase Management APIs or extra Firestore queries.
          </p>
        </div>
      </div>
    </div>
  );
}
