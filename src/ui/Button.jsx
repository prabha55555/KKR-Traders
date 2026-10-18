import { Loader2 } from 'lucide-react';
import { cn } from './cn';

const RING = 'focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white';

const VARIANTS = {
  // Brand gold — the main call-to-action
  primary: cn(
    'bg-gold-sheen text-brand-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_2px_rgb(120_80_0/0.35)]',
    'hover:brightness-105 hover:shadow-gold focus-visible:ring-gold-400',
  ),
  // Deep ink
  secondary: cn(
    'bg-linear-to-b from-brand-600 to-brand-800 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(12_16_34/0.4)]',
    'hover:from-brand-500 hover:to-brand-700 focus-visible:ring-brand-400',
  ),
  success: cn(
    'bg-linear-to-b from-emerald-500 to-emerald-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]',
    'hover:from-emerald-600 hover:to-emerald-700 focus-visible:ring-emerald-400',
  ),
  danger: cn(
    'bg-linear-to-b from-red-500 to-red-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]',
    'hover:from-red-600 hover:to-red-700 focus-visible:ring-red-400',
  ),
  warning: cn(
    'bg-linear-to-b from-amber-300 to-amber-400 text-slate-900 shadow-[inset_0_1px_0_rgb(255_255_255/0.4)]',
    'hover:from-amber-400 hover:to-amber-500 focus-visible:ring-amber-300',
  ),
  info: cn(
    'bg-linear-to-b from-sky-500 to-sky-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]',
    'hover:from-sky-600 hover:to-sky-700 focus-visible:ring-sky-400',
  ),
  purple: cn(
    'bg-linear-to-b from-violet-500 to-violet-600 text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]',
    'hover:from-violet-600 hover:to-violet-700 focus-visible:ring-violet-400',
  ),
  whatsapp: cn(
    'bg-linear-to-b from-[#2fe07a] to-whatsapp-dark text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]',
    'hover:brightness-95 focus-visible:ring-green-400',
  ),
  // Refresh / reload — soft sky, clearly secondary
  refresh: cn(
    'border border-sky-200 bg-sky-50 text-sky-700 shadow-sm',
    'hover:border-sky-300 hover:bg-sky-100 focus-visible:ring-sky-300',
  ),
  // Edit — blue
  edit: cn(
    'border border-blue-200 bg-blue-50 text-blue-700 shadow-sm',
    'hover:border-blue-300 hover:bg-blue-100 focus-visible:ring-blue-300',
  ),
  outline: cn(
    'border border-slate-300 bg-white text-slate-800 shadow-sm',
    'hover:border-gold-400 hover:bg-gold-50 focus-visible:ring-gold-300',
  ),
  outlineDanger: cn(
    'border border-red-200 bg-red-50 text-red-600 shadow-sm',
    'hover:border-red-300 hover:bg-red-100 focus-visible:ring-red-300',
  ),
  ghost: 'text-slate-700 hover:bg-slate-100 hover:text-brand-800 focus-visible:ring-gold-300',
  subtle: 'bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-300',
};

const SIZES = {
  sm: 'min-h-9 px-3 text-[13px]',
  md: 'min-h-11 px-4 text-sm sm:min-h-10',
  lg: 'min-h-12 px-6 text-base',
};

/**
 * <Button variant="primary" icon={Save} onClick={...}>Save</Button>
 * `icon` is a lucide-react component; `loading` shows a spinner and disables the button.
 * Variants (action-based colour system):
 *  primary (gold) Add / Create / Generate · success (green) Save / Submit / Restore · edit (blue) Edit · purple Share / Acknowledge
 *  info (sky) neutral info actions
 *  warning (amber) Reset / Clear · danger / outlineDanger (red) Delete · refresh (soft blue) Refresh · outline / ghost / subtle Cancel & neutral
 *  secondary (ink) Export / neutral dark · whatsapp (WhatsApp green) WhatsApp-only actions.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  className,
  children,
  onClick,
  ...rest
}) {
  const inactive = disabled || loading;
  return (
    <button
      type={type}
      disabled={inactive}
      aria-busy={loading || undefined}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold whitespace-nowrap',
        'transition duration-150 ease-out focus-visible:outline-none active:translate-y-px active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:brightness-100',
        RING,
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon className="size-4 shrink-0" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

/** Square icon-only button (toolbar actions). Always pass `label` for screen readers. */
export function IconButton({ icon: Icon, label, variant = 'ghost', className, ...rest }) {
  return (
    <Button
      variant={variant}
      aria-label={label}
      title={label}
      className={cn('min-h-10! w-10! px-0! sm:min-h-9! sm:w-9!', className)}
      {...rest}
    >
      <Icon className="size-5" aria-hidden />
    </Button>
  );
}
