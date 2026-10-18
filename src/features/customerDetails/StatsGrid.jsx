import { Banknote, CheckCircle2, Clock, FileText, Tag, Undo2, Users } from 'lucide-react';
import { memo, useMemo } from 'react';

import { cn } from '@/ui';
import { buildStatTiles } from './statTiles';

const ICONS = {
  people: Users,
  'document-text': FileText,
  cash: Banknote,
  'checkmark-circle': CheckCircle2,
  pricetag: Tag,
  'arrow-undo': Undo2,
  time: Clock,
};
// Icon tile tint per tile; a negative tone (returns, balance owed) is always red, a positive balance green.
const TINT = {
  customers: 'bg-gold-100 text-gold-700 ring-gold-200',
  invoices: 'bg-sky-50 text-sky-600 ring-sky-200',
  amount: 'bg-gold-100 text-gold-700 ring-gold-200',
  paid: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  discount: 'bg-violet-50 text-violet-600 ring-violet-200',
  returns: 'bg-amber-50 text-amber-600 ring-amber-200',
};
const NEGATIVE_TINT = 'bg-red-50 text-red-600 ring-red-200';
const POSITIVE_TINT = 'bg-emerald-50 text-emerald-600 ring-emerald-200';
const NEUTRAL_TINT = 'bg-slate-100 text-slate-600 ring-slate-200';
const VALUE = { positive: 'text-brand-800', negative: 'text-red-600', neutral: 'text-brand-800' };

function tintOf(tile) {
  if (tile.key !== 'balance') return TINT[tile.key] ?? NEUTRAL_TINT;
  if (tile.tone === 'negative') return NEGATIVE_TINT;
  return tile.tone === 'positive' ? POSITIVE_TINT : NEUTRAL_TINT;
}

/** Stat tiles of the Customer Details page (Customers, Invoices, Amount, Paid, Discount, [Returns], Balance). */
export const StatsGrid = memo(function StatsGrid({ stats }) {
  const tiles = useMemo(() => buildStatTiles(stats), [stats]);
  return (
    <div
      className={cn(
        'mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3',
        tiles.length > 6 ? 'lg:grid-cols-4' : 'lg:grid-cols-3',
      )}
    >
      {tiles.map((t, i) => {
        const Icon = ICONS[t.icon] ?? Users;
        return (
          <div
            key={t.key}
            style={{ animationDelay: `${Math.min(i, 7) * 40}ms` }}
            className="group relative min-w-0 animate-rise overflow-hidden rounded-2xl border border-line bg-white p-3.5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-4"
          >
            <span className="absolute inset-x-0 top-0 h-px hairline-gold opacity-0 transition group-hover:opacity-100" />
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
                  tintOf(t),
                )}
              >
                <Icon className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 text-xs leading-snug font-semibold tracking-wide text-slate-500">
                {t.label}
              </span>
            </div>
            <div
              className={cn(
                'mt-2.5 font-display text-lg leading-tight font-extrabold [overflow-wrap:anywhere] tabular-nums sm:text-[22px]',
                VALUE[t.tone],
              )}
            >
              {t.value}
            </div>
            {t.subtitle ? (
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug font-medium text-gold-700">
                {t.subtitle}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
});
