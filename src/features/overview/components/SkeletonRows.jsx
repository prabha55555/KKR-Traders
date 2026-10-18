import { Skeleton } from '@/ui';

/** Placeholder blocks shown while a page loads. `height` is a Tailwind height class. */
export default function SkeletonRows({ count = 4, height = 'h-24', className = '' }) {
  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="animate-rise rounded-2xl border border-line bg-white p-3 shadow-card"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <Skeleton className={`${height} w-full rounded-xl`} />
        </div>
      ))}
    </div>
  );
}
