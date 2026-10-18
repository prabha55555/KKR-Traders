import { Banknote, CheckCircle2, Clock, FileText, Tag, Undo2 } from 'lucide-react';
import { memo } from 'react';

import { StatCard, StatGrid, cn } from '@/ui';

const ICONS = {
  invoices: FileText,
  amount: Banknote,
  paid: CheckCircle2,
  discount: Tag,
  returns: Undo2,
  balance: Clock,
};

/**
 * The status-card grid of both party details pages (tiles from `buildPartyStatTiles`). Same app StatCard, icons, tones
 * and columns on both pages: 2 per row on phones; 6 tiles = 3 + 3 from tablets; 7 tiles (with returns) = 4 + 3 on
 * desktops. With an odd number of tiles the Total Balance card — the figure that matters most — spans two columns so
 * every row is full.
 * `kind` = PARTY_KINDS entry (its icon marks the party-count tile).
 */
export const PartyStatsGrid = memo(function PartyStatsGrid({ tiles, kind, className }) {
  const odd = tiles.length % 2 === 1;
  return (
    <StatGrid cols={tiles.length > 6 ? 4 : 3} className={className}>
      {tiles.map((t, i) => (
        <div
          key={t.key}
          className={cn('animate-rise', odd && t.key === 'balance' && 'col-span-2')}
          style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
        >
          <StatCard
            icon={t.key === 'parties' ? kind.icon : ICONS[t.key]}
            tone={t.tone}
            label={t.label}
            value={t.value}
            hint={t.hint}
          />
        </div>
      ))}
    </StatGrid>
  );
});
