import { Building2, Check, ExternalLink, Info, MapPin, Phone, User, Users } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';

import { digitsOnly } from '@/core/format';
import { Badge, TextField, cn } from '@/ui';
import { filterProcessors } from './combingLogic';

/**
 * Autocomplete-enabled Processor & Mill selector for Combing & Processing batches.
 * Allows searching by Mill/Processor Name, Owner Name, or Phone number.
 * Selecting a processor auto-populates Processor Name, Owner Name, Phone, and Address.
 */
export function ProcessorPicker({
  processors = [],
  processorName = '',
  ownerName = '',
  phone = '',
  address = '',
  onSelect,
  onProcessorNameChange,
}) {
  const listId = useId();
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Suggestions based on what user types in processor name
  const matches = focused && !dismissed ? filterProcessors(processors, processorName) : [];
  const open = matches.length > 0;

  const handlePick = (proc) => {
    onSelect(proc);
    setDismissed(true);
  };

  const handleNameChange = (val) => {
    setDismissed(false);
    setHighlight(-1);
    onProcessorNameChange(val);

    const match = processors.find(
      (p) => (p.processorName || p.name || '').trim().toLowerCase() === val.trim().toLowerCase(),
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

  const isSavedProcessor = processors.some(
    (p) =>
      ((p.processorName || p.name) &&
        (p.processorName || p.name).toLowerCase() === (processorName || '').trim().toLowerCase()) ||
      (p.phone && digitsOnly(p.phone) === digitsOnly(phone || '') && digitsOnly(phone).length >= 10),
  );

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-brand-600" />
          <h3 className="text-xs font-bold tracking-wider text-slate-700 uppercase">
            Combing Mill & Processor Details
          </h3>
          {isSavedProcessor && (
            <Badge tone="success" className="gap-1 text-[11px] py-0.5 px-2">
              <Check className="size-3" /> Saved Processor
            </Badge>
          )}
        </div>
        <Link
          to="/combing/details"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-800 transition"
        >
          <Users className="size-3.5" />
          <span>Manage Combating Directory</span>
          <ExternalLink className="size-3 text-slate-400" />
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Processor Name with Autocomplete */}
        <div className="relative">
          <TextField
            label="Combing Mill / Processor Name *"
            value={processorName}
            placeholder="Type mill or processor name..."
            autoComplete="off"
            leftIcon={Building2}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-autocomplete="list"
            onChange={handleNameChange}
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
              aria-label="Processor suggestions"
              className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-60 overflow-auto rounded-xl border border-line bg-white p-1 shadow-xl ring-1 ring-black/5"
            >
              {matches.map((p, i) => (
                <li
                  key={p.id || p.phone || p.processorName}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handlePick(p);
                  }}
                  className={cn(
                    'group flex cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition',
                    i === highlight ? 'bg-brand-50 text-brand-900' : 'hover:bg-slate-100 text-slate-800',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-brand-900 group-hover:text-brand-700">
                      {p.processorName || p.name}
                    </span>
                    {p.phone && (
                      <span className="font-mono text-xs text-slate-500 font-semibold">{p.phone}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    {p.ownerName && (
                      <span className="flex items-center gap-1">
                        <User className="size-3 text-gold-600" /> {p.ownerName}
                      </span>
                    )}
                    {p.address && (
                      <span className="flex items-center gap-1 truncate text-slate-500 max-w-[180px]">
                        <MapPin className="size-3 text-slate-400 shrink-0" /> {p.address}
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
          label="Processor Owner Name"
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

      {!isSavedProcessor && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500 pt-1">
          <Info className="size-3.5 text-slate-400 shrink-0" />
          <span>
            Select a processing unit above to load owner, phone, and address from your directory.{' '}
            <Link to="/combing/details" target="_blank" className="text-brand-700 underline font-semibold">
              Manage Combating Details
            </Link>
          </span>
        </div>
      )}
    </div>
  );
}
