/** Cells shared by the party table (desktop) and the party cards (phones / tablets) of both details pages. */
import { Eye, EyeOff, MapPin, Phone, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { InitialAvatar } from '@/features/customerForm/InitialAvatar';
import { Badge, cn } from '@/ui';
import {
  balanceStatusTone,
  isAddressTruncated,
  isPhoneMasked,
  maskPhone,
  PHONE_REVEAL_MS,
  previewAddress,
  revealPhone,
} from './display';

/** The money columns (table headers / card labels), in the same order on both pages, before Balance Due. */
export const PARTY_AMOUNT_COLUMNS = [
  ['openingBalance', 'Opening Balance'],
  ['amount', 'Total Amount'],
  ['paid', 'Amount Paid'],
  ['discount', 'Discount'],
  ['returns', 'Returns'],
];

const FOCUS = 'focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:outline-none';

/**
 * Colour of a money figure by column, the same in the table and on the cards: paid green, returns amber when there
 * are any (muted ₹0.00 otherwise), everything else neutral ink. The balance has its own status badge / well.
 */
export function amountClass(key, row) {
  if (key === 'paid') return 'text-emerald-700';
  if (key === 'returns') return row.hasReturns ? 'text-amber-700' : 'text-slate-400';
  return 'text-slate-800';
}

/** Amber "has returns" marker next to a party's name. */
function ReturnsMark({ noun }) {
  const label = `This ${noun} has returns`;
  return (
    <span
      role="img"
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center rounded-full bg-amber-50 px-1.5 py-1 text-amber-800 ring-1 ring-amber-200 ring-inset"
    >
      <Undo2 className="size-3" aria-hidden />
    </span>
  );
}

/** Initial tile + name (+ returns marker). `size="card"` = large heading of a card; `table` = compact table cell. */
export function PartyName({ name, hasReturns, kind, size = 'table' }) {
  const card = size === 'card';
  const Text = card ? 'h3' : 'span';
  return (
    <div className="flex min-w-0 items-center gap-3">
      <InitialAvatar name={name} size={card ? 'lg' : 'sm'} />
      <Text
        className={cn(
          'min-w-0 break-words text-brand-800',
          card ? 'text-[17px] leading-snug font-bold' : 'text-sm font-semibold',
        )}
      >
        {name}
      </Text>
      {hasReturns ? <ReturnsMark noun={kind.noun} /> : null}
    </div>
  );
}

/** Masked phone that shows the full number for 5 seconds when clicked (web: togglePhoneNumber). */
function usePhoneReveal(phone) {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef(null);
  const canReveal = isPhoneMasked(phone);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const toggle = useCallback(() => {
    if (!canReveal) return;
    if (timer.current) clearTimeout(timer.current);
    if (revealed) {
      setRevealed(false);
      return;
    }
    setRevealed(true);
    timer.current = setTimeout(() => setRevealed(false), PHONE_REVEAL_MS);
  }, [canReveal, revealed]);

  return { text: revealed ? revealPhone(phone) : maskPhone(phone), revealed, canReveal, toggle };
}

/** Muted "No phone" / "No address" line, keeping the icon column of the card well aligned. */
function Missing({ icon: Icon, showIcon, children }) {
  return (
    <span className="flex min-h-8 items-center gap-1.5 text-sm text-slate-400 italic">
      {showIcon ? <Icon className="size-4 shrink-0 text-gold-600/60" aria-hidden /> : null}
      {children}
    </span>
  );
}

/** Masked phone number; a click / tap reveals the digits for a few seconds (the eye shows it can be revealed). */
export function PartyPhone({ phone, showIcon }) {
  const { text, revealed, canReveal, toggle } = usePhoneReveal(phone);
  if (!phone) {
    return (
      <Missing icon={Phone} showIcon={showIcon}>
        No phone
      </Missing>
    );
  }
  const Toggle = revealed ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      disabled={!canReveal}
      title={canReveal ? (revealed ? 'Click to hide the number' : 'Click to reveal full number') : undefined}
      aria-label={`Phone ${text}`}
      aria-pressed={canReveal ? revealed : undefined}
      className={cn(
        '-mx-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-left text-sm tracking-wide whitespace-nowrap tabular-nums',
        FOCUS,
        revealed ? 'font-semibold text-brand-800' : 'font-medium text-slate-500',
        canReveal && 'cursor-pointer hover:bg-gold-50 hover:text-gold-800',
      )}
    >
      {showIcon ? <Phone className="size-4 shrink-0 text-gold-600" aria-hidden /> : null}
      <span>{text}</span>
      {canReveal ? <Toggle className="size-3.5 shrink-0 text-slate-400" aria-hidden /> : null}
    </button>
  );
}

/** First 30 characters; the full address is in the tooltip, and a tap expands it (phones have no hover). */
export function PartyAddress({ address, showIcon }) {
  const [expanded, setExpanded] = useState(false);
  if (!address) {
    return (
      <Missing icon={MapPin} showIcon={showIcon}>
        No address
      </Missing>
    );
  }
  const truncated = isAddressTruncated(address);
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      disabled={!truncated}
      title={address}
      aria-label={`Address ${address}`}
      aria-expanded={truncated ? expanded : undefined}
      className={cn(
        '-mx-1.5 flex min-h-8 items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-sm text-slate-600',
        FOCUS,
        truncated && 'cursor-pointer hover:bg-gold-50 hover:text-gold-800',
      )}
    >
      {showIcon ? <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden /> : null}
      <span className="min-w-0 break-words">{expanded ? address : previewAddress(address)}</span>
    </button>
  );
}

/** Balance Due as a status pill: red while owed, green in credit, grey when settled. */
export function PartyBalanceBadge({ row }) {
  return (
    <Badge tone={balanceStatusTone(row.balanceValue)} className="tabular-nums">
      {row.balance}
    </Badge>
  );
}
