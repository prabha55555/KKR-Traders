/**
 * Loading placeholders (the web page's skeleton-loader).
 *
 * SkeletonBlock({ className })        – one pulsing block, size it with Tailwind (`h-24 w-48`).
 * InvoiceListSkeleton({ count = 3 })  – placeholder day groups (heading chip + invoice cards) while the list loads.
 */
import { Skeleton } from '@/ui';

export function SkeletonBlock({ className = 'h-12 w-full' }) {
  return <Skeleton className={className} />;
}

export function InvoiceListSkeleton({ count = 3 }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading invoices">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3">
          <div className="flex items-center justify-between gap-3 px-1">
            <SkeletonBlock className="h-8 w-40 rounded-full" />
            <SkeletonBlock className="h-5 w-24" />
          </div>
          <div className="space-y-3 rounded-2xl border border-line bg-white p-4 shadow-card">
            <div className="flex items-center justify-between gap-3">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-6 w-16 rounded-full" />
            </div>
            <SkeletonBlock className="h-4 w-56 max-w-full" />
            <SkeletonBlock className="h-9 w-40" />
            <SkeletonBlock className="h-1.5 w-full rounded-full" />
            <div className="flex gap-2 pt-1">
              <SkeletonBlock className="h-10 flex-1 rounded-xl" />
              <SkeletonBlock className="h-10 flex-1 rounded-xl" />
              <SkeletonBlock className="h-10 flex-1 rounded-xl" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
