import { Calendar, Clock, Eye, FileText, Trash2, Undo2, User } from 'lucide-react';

import { formatCurrency, formatDateIN } from '@/core/format';
import { Badge, Button, Card } from '@/ui';
import { binItemName, daysAgo, daysAgoText, formatBinDate, partyName, toDate } from './binLogic';

/** "3/10/2026 (2 days ago)" or "-" when the deletion time is unknown. */
export function deletedAtText(item, now) {
  const deleted = toDate(item.deletedAt);
  return deleted ? `${formatBinDate(deleted)} (${daysAgoText(daysAgo(deleted, now))})` : '-';
}

/** Small type pill shown on every bin entry: sales invoice or purchase bill. */
export function BinTypeBadge({ item }) {
  const purchase = item.type === 'purchase_invoice';
  return <Badge tone={purchase ? 'info' : 'brand'}>{purchase ? 'Purchase Bill' : 'Invoice'}</Badge>;
}

/** View / Restore / Delete as one compact row (table rows on the website). */
export function BinRowActions({ item, onView, onRestore, onDelete }) {
  const name = binItemName(item);
  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="outline" icon={Eye} onClick={onView} aria-label={`View ${name}`}>
        View
      </Button>
      <Button size="sm" variant="success" icon={Undo2} onClick={onRestore} aria-label={`Restore ${name}`}>
        Restore
      </Button>
      <Button
        size="sm"
        variant="outlineDanger"
        icon={Trash2}
        onClick={onDelete}
        aria-label={`Delete ${name} permanently`}
      >
        Delete
      </Button>
    </div>
  );
}

function MetaLine({ icon: Icon, text }) {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-600">
      <Icon className="size-3.5 shrink-0 text-gold-600" aria-hidden />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}

/** One deleted bill (the web `.bin-item` row): name, dates, party, amount and the three actions. */
export function BinItemCard({ item, now, onView, onRestore, onDelete }) {
  const name = binItemName(item);
  const deleted = toDate(item.deletedAt);
  return (
    <Card className="p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-700 ring-1 ring-gold-200">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[17px] leading-snug font-bold text-brand-800">{name}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <BinTypeBadge item={item} />
            {deleted ? (
              <Badge tone="warning">
                <Clock className="mr-1 size-3" aria-hidden />
                {daysAgoText(daysAgo(deleted, now))}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right font-display text-lg font-extrabold text-brand-800 tabular-nums">
          ₹{formatCurrency(item.grandTotal)}
        </div>
      </div>
      <div className="mt-3 space-y-1.5 rounded-xl bg-slate-50/70 p-3">
        <MetaLine icon={Calendar} text={`Deleted ${deletedAtText(item, now)}`} />
        {item.invoiceDate ? (
          <MetaLine icon={FileText} text={`Invoice date ${formatDateIN(item.invoiceDate)}`} />
        ) : null}
        {partyName(item) ? <MetaLine icon={User} text={partyName(item)} /> : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" icon={Eye} onClick={onView} aria-label={`View ${name}`}>
          View
        </Button>
        <Button variant="success" icon={Undo2} onClick={onRestore} aria-label={`Restore ${name}`}>
          Restore
        </Button>
      </div>
      <Button
        variant="outlineDanger"
        icon={Trash2}
        fullWidth
        className="mt-2"
        onClick={onDelete}
        aria-label={`Delete ${name} permanently`}
      >
        Delete Permanently
      </Button>
    </Card>
  );
}
