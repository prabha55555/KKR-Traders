import { cn } from '@/ui';

/** A shortcut key drawn as a monospace gold-ink "key cap". */
export default function KeyCap({ children, className }) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-9 items-center justify-center rounded-lg border border-b-2 border-gold-300 bg-linear-to-b from-white to-gold-100 px-2.5 py-1 font-mono text-sm font-bold break-all text-brand-800 shadow-sm',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
