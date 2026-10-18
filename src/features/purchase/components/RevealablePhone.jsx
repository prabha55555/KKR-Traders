import { Eye, EyeOff, Phone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/ui';
import { maskPhone, revealedPhone } from '../supplierDetails';

/** The original page re-masked a revealed number after 5 seconds. */
const REVEAL_MS = 5000;

/** Masked supplier phone number; a click / tap reveals it for a few seconds (togglePhoneNumber). */
export function RevealablePhone({ phone, className }) {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!phone) return <span className="text-sm text-slate-400 italic">No phone</span>;

  const toggle = (e) => {
    e.stopPropagation();
    if (timer.current) clearTimeout(timer.current);
    if (revealed) {
      setRevealed(false);
      return;
    }
    setRevealed(true);
    timer.current = setTimeout(() => setRevealed(false), REVEAL_MS);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title="Click to reveal full number"
      aria-label={revealed ? 'Hide phone number' : 'Show phone number'}
      className={cn(
        '-mx-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-md px-1.5 text-sm tracking-wide tabular-nums hover:bg-gold-50 hover:text-gold-800 focus-visible:ring-2 focus-visible:ring-gold-300 focus-visible:outline-none',
        revealed ? 'font-semibold text-brand-800' : 'text-slate-500',
        className,
      )}
    >
      <Phone className="size-4 shrink-0 text-gold-600" aria-hidden />
      <span>{revealed ? revealedPhone(phone) : maskPhone(phone)}</span>
      {revealed ? (
        <EyeOff className="size-4 shrink-0 text-slate-400" aria-hidden />
      ) : (
        <Eye className="size-4 shrink-0 text-slate-400" aria-hidden />
      )}
    </button>
  );
}
