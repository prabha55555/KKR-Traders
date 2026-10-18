/**
 * Phone-driven party selector for customers AND suppliers (the web app's phone input + datalist + read-only
 * name/address). Typing filters the party list by phone or name; picking one (click, or Enter / arrow keys)
 * fills the read-only details.
 *
 * Props
 *  - partyLabel?: string        "Customer" (default) or "Supplier": used in the labels
 *  - parties: Array<{phone, name, address}>
 *  - phone, name, address: string          current values (name/address are read-only displays)
 *  - onPhoneChange(phone: string)          the user typed in the phone box
 *  - onSelect(party)                       a suggestion was picked (or Enter on the exact / top match)
 *  - notFound?: ReactNode                  shown under the fields, e.g. <PartyNotFoundHint …/>
 *  - readOnly?: boolean                    lock the phone box (edit screens that must keep the party)
 *  - phoneHint?: string
 * Also exported: `PartyNotFoundHint` ("no <party> with this number: Add <party>" with a link or button).
 */
import { Info, Phone, UserPlus } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Button, TextArea, TextField } from '@/ui';
import { cn } from '@/ui/cn';
import { findPartyByPhone, suggestParties } from './partyMatch';

export function PartyPicker({
  partyLabel = 'Customer',
  parties,
  phone,
  name,
  address,
  onPhoneChange,
  onSelect,
  notFound,
  readOnly,
  phoneHint,
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const matches = focused && !readOnly && !dismissed ? suggestParties(parties, phone) : [];
  const open = matches.length > 0;

  const pick = (party) => {
    onSelect(party);
    setDismissed(true);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setDismissed(true);
    } else if (e.key === 'Enter') {
      // Enter (hardware keyboard): the highlighted row, else the exact match, else the top suggestion.
      const target = matches[highlight] ?? findPartyByPhone(parties, phone) ?? matches[0];
      if (target) {
        e.preventDefault();
        pick(target);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <TextField
          label={`${partyLabel} Phone / Name`}
          type="text"
          placeholder={`Type phone number or ${partyLabel.toLowerCase()} name`}
          autoComplete="off"
          leftIcon={Phone}
          hint={phoneHint}
          value={phone}
          readOnly={readOnly}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          onChange={(v) => {
            setDismissed(false);
            setHighlight(-1);
            onPhoneChange(v);
          }}
          onFocus={() => {
            setFocused(true);
            setDismissed(false);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={`${partyLabel} suggestions`}
            className="absolute top-full right-0 left-0 z-30 mt-1.5 max-h-64 animate-fade-in overflow-auto rounded-xl border border-line bg-white/95 p-1 shadow-pop ring-1 ring-brand-900/5 backdrop-blur-md"
          >
            {matches.map((p, i) => (
              <li
                key={p.phone}
                role="option"
                aria-selected={i === highlight}
                // mousedown (not click) so the phone box keeps focus until the pick lands
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(p);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors',
                  i === highlight && 'bg-gold-50 ring-1 ring-gold-200',
                )}
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-xs font-bold text-gold-800 ring-1 ring-gold-200"
                  aria-hidden
                >
                  {(p.name || '?').trim().charAt(0).toUpperCase() || '?'}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold text-slate-800">
                  {p.name || '(no name)'}
                </span>
                <span className="shrink-0 text-slate-500 tabular-nums">{p.phone}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="grid gap-3.5 rounded-xl bg-slate-50/70 p-3 ring-1 ring-line sm:grid-cols-2">
        <TextField label="Name" placeholder="Filled automatically" value={name} readOnly />
        <TextArea
          label="Address"
          placeholder="Filled automatically"
          value={address}
          readOnly
          rows={1}
          className="sm:col-span-1"
        />
      </div>
      {notFound}
    </div>
  );
}

/**
 * "No <party> with this number yet" hint. Pass `to` (a route such as `/sales/add-customer?phone=…`) for a link,
 * or `onAdd` for a button.
 */
export function PartyNotFoundHint({ partyLabel = 'Customer', to, onAdd }) {
  const lower = partyLabel.toLowerCase();
  const label = `Add ${lower}`;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900 ring-1 ring-amber-200"
    >
      <Info className="size-5 shrink-0 text-amber-600" aria-hidden />
      <p className="min-w-0 flex-1">
        No {lower} with this number yet. Add the {lower} first, then come back to bill them.
      </p>
      {to ? (
        // a real link (navigation), drawn like <Button variant="primary"> — Add = gold in the app's action colours
        <Link
          to={to}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gold-sheen px-4 text-sm font-semibold whitespace-nowrap text-brand-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_2px_rgb(120_80_0/0.35)] transition duration-150 hover:shadow-gold hover:brightness-105 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.985] sm:min-h-10"
        >
          <UserPlus className="size-4" aria-hidden />
          {label}
        </Link>
      ) : (
        <Button variant="primary" icon={UserPlus} onClick={onAdd}>
          {label}
        </Button>
      )}
    </div>
  );
}
