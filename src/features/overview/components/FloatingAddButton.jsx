import { Plus } from 'lucide-react';

/** Phone-only floating "add" button (gold), parked above the bottom tab bar. */
export default function FloatingAddButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="no-print fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-full bg-gold-sheen text-brand-900 shadow-gold ring-4 ring-white/70 transition duration-150 hover:brightness-105 focus-visible:ring-4 focus-visible:ring-gold-300 focus-visible:outline-none active:scale-95 sm:hidden"
    >
      <Plus className="size-7" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
