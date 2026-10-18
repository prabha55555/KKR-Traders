import { cn } from './cn';
import { statusTone } from './status';

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

/**
 * Card heading row: gold-tinted icon + title on the left, optional actions (`right`) on the right.
 * `level` = heading level (2 by default; 3 inside a dialog, whose own title is the h2).
 */
export function SectionHeader({ title, icon: Icon, right, level = 2, className }) {
  const Heading = `h${level}`;
  return (
    <div className={cn('mb-4 flex flex-wrap items-center justify-between gap-2', className)}>
      <Heading className="flex min-w-0 items-center gap-2.5 text-[clamp(0.9375rem,0.85rem+0.3vw,1.0625rem)] font-bold text-brand-800">
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-200">
            <Icon className="size-[18px]" aria-hidden />
          </span>
        ) : null}
        {title}
      </Heading>
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

/**
 * Status pill. `status` = the status text / key; its colour comes from the app-wide map (statusTone: green done/paid,
 * yellow pending/partial, red failed/due, blue processing). `tone` forces a colour instead. Children default to `status`.
 * `icon` = optional lucide icon before the text; other props (title, aria-*) go to the pill.
 */
export function Badge({ tone, status, icon: Icon, className, children, ...rest }) {
  return (
    <span
      {...rest}
      className={cn(
        'inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap ring-1 ring-inset',
        TONES[tone ?? (status !== undefined ? statusTone(status) : 'neutral')] ?? TONES.neutral,
        className,
      )}
    >
      {Icon ? <Icon className="mr-1 inline size-3.5 shrink-0" aria-hidden /> : null}
      <span className="truncate">{children ?? status}</span>
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
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};
/** Status tones map onto the tints, so a status card and a status badge of the same status share one colour. */
const TONE_TINT = {
  success: 'green',
  danger: 'red',
  warning: 'amber',
  info: 'sky',
  neutral: 'slate',
  brand: 'brand',
};
/** Value colour per tone (money in/out and status figures read at a glance). */
const TONE_VALUE = {
  success: 'text-emerald-700',
  danger: 'text-red-600',
  warning: 'text-amber-700',
  info: 'text-sky-700',
};

/**
 * THE status / KPI card of the app (every module uses this one): tinted icon, big value, small label.
 * `tone` = success | danger | warning | info | neutral | brand (same colours as Badge); `tint` (brand/green/red/amber/sky/
 * violet/slate) is the older way to pick the icon colour and still works. `hint` = optional small line under the label.
 * Sizing is automatic: container queries put the icon above the figure in a narrow tile and beside it from 15rem, and
 * the figure's font scales with the tile's width (clamp + cqi) so ₹10,00,000 fits without clipping.
 */
export function StatCard({ icon: Icon, value, label, hint, tone, tint, valueClassName, className, onClick }) {
  const iconTint = TINTS[tint ?? TONE_TINT[tone] ?? 'brand'] ?? TINTS.brand;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'group @container relative h-full min-h-[5.25rem] w-full overflow-hidden rounded-2xl border border-line bg-white text-left shadow-card',
        'transition duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        onClick && 'focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none',
        className,
      )}
    >
      <span className="absolute inset-x-0 top-0 h-px hairline-gold opacity-0 transition group-hover:opacity-100" />
      <div className="flex h-full flex-col items-start gap-2.5 p-3.5 @[15rem]:flex-row @[15rem]:items-center @[15rem]:gap-3.5 @[15rem]:p-4">
        {Icon ? (
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset @[15rem]:size-11',
              iconTint,
            )}
          >
            <Icon className="size-5" aria-hidden />
          </span>
        ) : null}
        <div className="max-w-full min-w-0">
          <div
            className={cn(
              'font-display text-[clamp(1rem,9cqi,1.375rem)] leading-tight font-extrabold [overflow-wrap:anywhere] text-brand-800 tabular-nums',
              TONE_VALUE[tone],
              valueClassName,
            )}
          >
            {value}
          </div>
          <div className="mt-0.5 line-clamp-2 text-xs leading-snug font-medium text-slate-500">{label}</div>
          {hint ? (
            <div
              className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-400"
              title={typeof hint === 'string' ? hint : undefined}
            >
              {hint}
            </div>
          ) : null}
        </div>
      </div>
    </Tag>
  );
}

const STAT_COLS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-3 lg:grid-cols-5',
  6: 'sm:grid-cols-3 lg:grid-cols-6',
};

/** The one grid for status cards: 2 per row on phones, up to `cols` (2-6) on wider screens, equal-height tiles. */
export function StatGrid({ cols = 4, className, children }) {
  return (
    <div
      className={cn(
        'grid auto-rows-fr grid-cols-2 gap-3 sm:gap-4',
        STAT_COLS[cols] ?? STAT_COLS[4],
        className,
      )}
    >
      {children}
    </div>
  );
}
