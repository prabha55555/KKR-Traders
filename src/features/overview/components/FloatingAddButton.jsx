import { Plus } from 'lucide-react';

import { Button } from '@/ui';

/** Phone-only floating "add" button (the gold primary action), parked above the bottom tab bar. */
export default function FloatingAddButton({ label, onClick }) {
  return (
    <Button
      variant="primary"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="no-print fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 size-14! min-h-14! rounded-full! px-0! shadow-gold! ring-4 ring-white/70 sm:hidden"
    >
      <Plus className="size-7" strokeWidth={2.5} aria-hidden />
    </Button>
  );
}
