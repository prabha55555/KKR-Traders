import { cn } from '@/ui';

/**
 * Hero KPI tile on the dark ink surface: gold-tinted icon, display-font figure (gold, or red when `negative`) and a
 * muted label. Sits next to the light <StatCard>s in a <KpiRow>. Same container-query layout as <StatCard>:
 * stacked in narrow tiles, icon-left from 15rem, figure wraps instead of truncating.
 */
export default function InkStat({ icon: Icon, value, label, negative = false, valueClassName, className }) {
  return (
    <div
      className={cn(
        'group @container relative overflow-hidden rounded-2xl border border-white/10 surface-ink text-white shadow-lift',
        'transition duration-200 hover:-translate-y-0.5',
        className,
      )}
    >
      <span className="absolute inset-x-0 top-0 h-px hairline-gold" aria-hidden />
      <div className="flex h-full flex-col items-start gap-2.5 p-3.5 @[15rem]:flex-row @[15rem]:items-center @[15rem]:gap-3.5 @[15rem]:p-4">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-gold-300 ring-1 ring-white/15 ring-inset @[15rem]:size-11">
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
        <div className="max-w-full min-w-0">
          <div
            className={cn(
              'font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere] tabular-nums @[15rem]:text-xl',
              negative ? 'text-red-300' : 'text-gold-300',
              valueClassName,
            )}
          >
            {value}
          </div>
          <div className="mt-0.5 text-xs leading-snug font-medium text-brand-300">{label}</div>
        </div>
      </div>
    </div>
  );
}
