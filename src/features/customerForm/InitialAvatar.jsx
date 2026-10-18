import { cn } from '@/ui';

const SIZES = {
  sm: 'size-9 rounded-xl text-sm',
  md: 'size-11 rounded-xl text-base',
  lg: 'size-12 rounded-2xl text-lg',
};

/** First letter / digit of a name, upper-cased ("?" when there is none). Purely presentational. */
export function initialOf(name) {
  const match = String(name ?? '').match(/[\p{L}\p{N}]/u);
  return match ? match[0].toUpperCase() : '?';
}

/** Gold-gradient tile with the party's initial — used by the customer / supplier directories. */
export function InitialAvatar({ name, size = 'md', className }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center bg-gold-gradient font-display font-extrabold text-brand-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_1px_2px_rgb(120_80_0/0.3)] select-none',
        SIZES[size],
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}
