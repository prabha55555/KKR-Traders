import { cn } from './cn';

/** White surface with a soft brand shadow. `tone="ink"` gives the dark premium variant. */
export function Card({ className, children, as: Tag = 'div', tone = 'light', ...rest }) {
  return (
    <Tag
      className={cn(
        'rounded-2xl p-4 sm:p-5',
        tone === 'ink'
          ? 'border border-white/10 surface-ink text-white shadow-lift'
          : 'border border-line bg-white shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Card heading row: gold-tinted icon + title on the left, optional actions (`right`) on the right. */
export function SectionHeader({ title, icon: Icon, right, className }) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-2', className)}>
      <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-brand-800">
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-200">
            <Icon className="size-[18px]" aria-hidden />
          </span>
        ) : null}
        {title}
      </h2>
      {right}
    </div>
  );
}

export function Divider({ className }) {
  return <hr className={cn('my-3 border-line', className)} />;
}

const TONES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-gold-100 text-gold-800 ring-gold-200',
};

export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** label ........ value row used in summaries and invoice cards */
export function KeyValue({ label, value, bold, valueClassName, className }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-0.5 text-sm', className)}>
      <span className={cn('text-slate-500', bold && 'font-semibold text-slate-700')}>{label}</span>
      <span className={cn('text-right font-semibold text-slate-800 tabular-nums', valueClassName)}>
        {value}
      </span>
    </div>
  );
}

const TINTS = {
  brand: 'bg-gold-100 text-gold-700 ring-gold-200',
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  red: 'bg-red-50 text-red-600 ring-red-200',
  amber: 'bg-amber-50 text-amber-600 ring-amber-200',
  sky: 'bg-sky-50 text-sky-600 ring-sky-200',
  violet: 'bg-violet-50 text-violet-600 ring-violet-200',
};

/**
 * KPI tile: tinted icon, big value, small label, gold hairline on top.
 * Container-query layout: in a narrow tile (2-up on phones, 6-up grids) the icon sits above the figure so the whole
 * amount (₹10,00,000 …) stays readable; from 15rem wide it is icon-left / figure-right. Figures wrap instead of truncating.
 */
export function StatCard({ icon: Icon, value, label, tint = 'brand', valueClassName, className }) {
  return (
    <div
      className={cn(
        'group @container relative overflow-hidden rounded-2xl border border-line bg-white shadow-card',
        'transition duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
    >
      <span className="absolute inset-x-0 top-0 h-px hairline-gold opacity-0 transition group-hover:opacity-100" />
      <div className="flex h-full flex-col items-start gap-2.5 p-3.5 @[15rem]:flex-row @[15rem]:items-center @[15rem]:gap-3.5 @[15rem]:p-4">
        {Icon ? (
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset @[15rem]:size-11',
              TINTS[tint],
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
        <div className="max-w-full min-w-0">
          <div
            className={cn(
              'font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere] text-brand-800 tabular-nums @[15rem]:text-xl',
              valueClassName,
            )}
          >
            {value}
          </div>
          <div className="mt-0.5 text-xs leading-snug font-medium text-slate-500">{label}</div>
        </div>
      </div>
    </div>
  );
}
