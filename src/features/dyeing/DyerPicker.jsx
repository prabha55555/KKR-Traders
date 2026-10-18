import { Building2, Check, ExternalLink, Info, MapPin, Phone, User, Users } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';

import { digitsOnly } from '@/core/format';
import { Badge, TextField, cn } from '@/ui';
import { filterDyers } from './dyeingLogic';

/**
 * Autocomplete-enabled Dyer & Processor selector for Dyeing batches.
 * Allows searching by Dyeing Name, Owner Name, or Phone number.
 * Selecting a dyer auto-populates Dyeing Name, Owner Name, Phone, and Address.
 */
export function DyerPicker({
  dyers = [],
  dyeingName = '',
  ownerName = '',
  phone = '',
  address = '',
  onSelect,
  onDyeingNameChange,
  onOwnerNameChange,
  onPhoneChange,
  onAddressChange,
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Suggestions based on what user types in Dyeing Name
  const matches = focused && !dismissed ? filterDyers(dyers, dyeingName) : [];
  const open = matches.length > 0;

  const handlePick = (dyer) => {
    onSelect(dyer);
    setDismissed(true);
  };

  const handleDyeingNameChange = (val) => {
    setDismissed(false);
    setHighlight(-1);
    onDyeingNameChange(val);

    const match = dyers.find(
      (d) => (d.dyeingName || '').trim().toLowerCase() === val.trim().toLowerCase(),
    );
    if (match) {
      onSelect(match);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setDismissed(true);
    } else if (e.key === 'Enter') {
      const target = matches[highlight] ?? matches[0];
      if (target) {
        e.preventDefault();
        handlePick(target);
      }
    }
  };

  const isSavedDyer = dyers.some(
    (d) =>
      (d.dyeingName && d.dyeingName.toLowerCase() === (dyeingName || '').trim().toLowerCase()) ||
      (d.phone && digitsOnly(d.phone) === digitsOnly(phone || '') && digitsOnly(phone).length >= 10),
  );

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-brand-600" />
          <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase">
            Dye House & Processing Unit Details
          </h3>
          {isSavedDyer && (
            <Badge tone="success" className="gap-1 text-[11px] py-0.5 px-2">
              <Check className="size-3" /> Saved Dyer
            </Badge>
          )}
        </div>
        <Link
          to="/dyeing/details"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition"
        >
          <Users className="size-3.5" />
          <span>Manage Dyers Directory</span>
          <ExternalLink className="size-3 text-slate-400" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Dyeing Name with Autocomplete */}
        <div className="relative">
          <TextField
            label="Dyeing / Mill Name *"
            value={dyeingName}
            placeholder="Type dyeing or mill name..."
            autoComplete="off"
            leftIcon={Building2}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            onChange={handleDyeingNameChange}
            onFocus={() => {
              setFocused(true);
              setDismissed(false);
            }}
            onBlur={() => setTimeout(() => setFocused(false), 200)}
            onKeyDown={handleKeyDown}
          />

          {open && (
            <ul
              id={listId}
              role="listbox"
              aria-label="Dyer suggestions"
              className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-60 overflow-auto rounded-xl border border-line bg-white p-1 shadow-xl ring-1 ring-black/5"
            >
              {matches.map((d, i) => (
                <li
                  key={d.id || d.phone || d.dyeingName}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handlePick(d);
                  }}
                  className={cn(
                    'group flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition',
                    i === highlight ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-100 text-slate-800',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-brand-900 group-hover:text-brand-700">
                      {d.dyeingName}
                    </span>
                    {d.phone && (
                      <span className="font-mono text-xs text-slate-500 font-semibold">{d.phone}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    {d.ownerName && (
                      <span className="flex items-center gap-1">
                        <User className="size-3 text-gold-600" /> {d.ownerName}
                      </span>
                    )}
                    {d.address && (
                      <span className="flex items-center gap-1 truncate text-slate-500 max-w-[180px]">
                        <MapPin className="size-3 text-slate-400 shrink-0" /> {d.address}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 2. Owner Name (Read Only) */}
        <TextField
          label="Dyeing Owner Name"
          value={ownerName}
          readOnly
          placeholder="Owner / contact person"
          leftIcon={User}
        />

        {/* 3. Phone (Read Only) */}
        <TextField
          label="Mobile / Phone Number"
          value={phone}
          readOnly
          placeholder="10-digit mobile"
          leftIcon={Phone}
          type="tel"
        />

        {/* 4. Address (Read Only) */}
        <TextField
          label="Mill / Factory Address"
          value={address}
          readOnly
          placeholder="Mill / factory address"
          leftIcon={MapPin}
        />
      </div>

      {!isSavedDyer && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
          <Info className="size-3.5 text-slate-400 shrink-0" />
          <span>
            Select a dyeing unit above to load owner, phone, and address from your directory.{' '}
            <Link to="/dyeing/details" target="_blank" className="text-brand-700 underline font-semibold">
              Manage Dyers
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
