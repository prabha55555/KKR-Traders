import { Banknote, CheckCircle2, Clock, FileText, Tag, Undo2, Users } from 'lucide-react';
import { memo, useMemo } from 'react';

import { StatCard, StatGrid } from '@/ui';
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

/**
 * App-wide status colour of each tile: counts info, money in green, the billed / discount totals neutral, returns amber
 * (same as every returns badge). The balance follows its sign: owed = red, credit = green, nil = neutral.
 */
const TONE = {
  customers: 'info',
  invoices: 'info',
  amount: 'brand',
  paid: 'success',
  discount: 'neutral',
  returns: 'warning',
};
const BALANCE_TONE = { negative: 'danger', positive: 'success', neutral: 'neutral' };

const toneOf = (tile) => (tile.key === 'balance' ? BALANCE_TONE[tile.tone] : TONE[tile.key]) ?? 'neutral';

/** Stat tiles of the Customer Details page (Customers, Invoices, Amount, Paid, Discount, [Returns], Balance). */
export const StatsGrid = memo(function StatsGrid({ stats }) {
  const tiles = useMemo(() => buildStatTiles(stats), [stats]);
  return (
    // 6 tiles: 3 + 3; 7 tiles (with returns): 4 + 3 on desktops
    <StatGrid cols={tiles.length > 6 ? 4 : 3} className="mb-5">
      {tiles.map((t) => (
        <StatCard
          key={t.key}
          icon={ICONS[t.icon] ?? Users}
          tone={toneOf(t)}
          label={t.label}
          value={t.value}
          hint={t.subtitle}
        />
      ))}
    </StatGrid>
  );
});
