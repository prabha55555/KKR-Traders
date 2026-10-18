import logoFull from '@/assets/brand/logo.png';
import mark from '@/assets/brand/mark.png';
import { PRODUCT } from '@/core/branding';
import { cn } from '@/ui';

/** The "B" monogram on a white tile — readable on both dark and light surfaces. */
export function BrandMark({ size = 'md', className }) {
  const sizes = {
    sm: 'size-9 p-1.5 rounded-xl',
    md: 'size-11 p-2 rounded-2xl',
    lg: 'size-16 p-3 rounded-3xl',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-white shadow-[0_6px_18px_-6px_rgb(0_0_0/0.5)] ring-1 ring-gold-300/60',
        sizes[size],
        className,
      )}
    >
      <img src={mark} alt="" className="size-full object-contain" draggable="false" />
    </span>
  );
}

/** Mark + product name lock-up, used in the sidebar and headers. */
export function BrandLockup({ tone = 'dark', className }) {
  const dark = tone === 'dark';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <BrandMark />
      <div className="leading-tight">
        <div
          className={cn(
            'font-display text-[17px] font-extrabold tracking-tight',
            dark ? 'text-white' : 'text-brand-800',
          )}
        >
          Brightlight
        </div>
        <div className="text-[10px] font-semibold tracking-[0.28em] text-gold-400 uppercase">
          Billing Suite
        </div>
      </div>
    </div>
  );
}

/** Full colour logo (black + gold) — for white surfaces such as the login card. */
export function BrandLogo({ className }) {
  return (
    <img
      src={logoFull}
      alt={PRODUCT.name}
      className={cn('h-auto select-none', className)}
      draggable="false"
    />
  );
}
