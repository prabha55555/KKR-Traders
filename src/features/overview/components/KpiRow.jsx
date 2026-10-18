import { Children } from 'react';

import { cn } from '@/ui';

const COLS = {
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
};

/** Row of <StatCard>s on top of a page: `cols` KPI tiles (4 → 2x2 on phones, 3 → stacked on phones). Tiles rise in one after another. */
export default function KpiRow({ cols = 4, className, children }) {
  return (
    <div className={cn('mb-5 grid gap-3 sm:gap-3.5', COLS[cols], className)}>
      {Children.toArray(children).map((child, i) => (
        <div key={child.key ?? i} className="animate-rise *:h-full" style={{ animationDelay: `${i * 60}ms` }}>
          {child}
        </div>
      ))}
    </div>
  );
}
