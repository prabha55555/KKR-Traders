import { cn } from './cn';

const WIDTHS = {
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-none',
};

/**
 * Page scaffold used inside the app shell: title row (with actions) + content, centred up to `max` width.
 * <Page title="Sales History" icon={History} actions={<Button/>}>…</Page>
 */
export function Page({ title, icon: Icon, actions, max = '6xl', className, children }) {
  return (
    <div
      className={cn(
        'mx-auto w-full animate-rise px-3.5 py-5 sm:px-6 sm:py-7 lg:px-8',
        WIDTHS[max] ?? WIDTHS['6xl'],
        className,
      )}
    >
      {title ? (
        <div className="top-app-header sticky z-20 -mx-3.5 mb-4 flex items-center justify-between gap-2 border-b border-line bg-canvas/95 px-3.5 py-2.5 backdrop-blur-md sm:-mx-6 sm:mb-6 sm:px-6 lg:static lg:mx-0 lg:flex-wrap lg:gap-3 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="flex min-w-0 items-center gap-3.5">
            {Icon ? (
              <span className="hidden size-12 shrink-0 items-center justify-center rounded-2xl bg-gold-sheen text-brand-900 shadow-gold sm:flex">
                <Icon className="size-6" aria-hidden />
              </span>
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg leading-tight font-extrabold text-brand-800 sm:text-xl lg:text-[26px]">
                {title}
              </h1>
              <span
                className="mt-1.5 hidden h-[3px] w-10 rounded-full bg-gold-gradient lg:block"
                aria-hidden
              />
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2 lg:flex-wrap">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Form on the left, sticky summary / payment / action card on the right (stacked on phones & tablets). */
export function TwoPane({ main, side, className }) {
  return (
    <div
      className={cn(
        'grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]',
        className,
      )}
    >
      <div className="min-w-0 space-y-5">{main}</div>
      <div className="min-w-0 space-y-5 lg:sticky lg:top-20">{side}</div>
    </div>
  );
}

/** Responsive grid: <Grid cols={{ base: 1, sm: 2, lg: 4 }}> — written out so Tailwind can see every class. */
const COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};
const SM = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };
const LG = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
};

export function Grid({ cols = { base: 1, sm: 2, lg: 3 }, gap = 'gap-3.5', className, children }) {
  return (
    <div
      className={cn(
        'grid',
        COLS[cols.base ?? 1],
        cols.sm && SM[cols.sm],
        cols.lg && LG[cols.lg],
        gap,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Pill-style single choice: <ChoiceChips value onChange options={[{value,label}]}/> */
export function ChoiceChips({ value, onChange, options, className }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-9 rounded-full border px-4 text-sm font-semibold transition duration-150',
              active
                ? 'border-brand-800 bg-linear-to-b from-brand-600 to-brand-800 text-gold-200 shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:border-gold-400 hover:bg-gold-50',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
