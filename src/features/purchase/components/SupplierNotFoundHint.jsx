import { Info, UserPlus } from 'lucide-react';
import { useAppNavigate } from '@/hooks/useRouteParams';
import { Button } from '@/ui';

/** Shown under the supplier fields when the typed phone number matches no supplier. */
export function SupplierNotFoundHint({ phone }) {
  const nav = useAppNavigate();
  const typed = (phone || '').trim();
  return (
    <div className="mt-1 rounded-xl bg-amber-50 p-3.5 text-amber-900 ring-1 ring-amber-200" role="status">
      <div className="flex items-start gap-2 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <p className="min-w-0">
          No supplier found for {typed}. Add the supplier first, then come back and enter the number again.
        </p>
      </div>
      <Button
        variant="warning"
        icon={UserPlus}
        className="mt-2.5"
        onClick={() => nav.push(`/purchase/add-supplier?phone=${encodeURIComponent(typed)}`)}
      >
        Add Supplier
      </Button>
    </div>
  );
}
