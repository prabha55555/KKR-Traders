import { MapPin, Phone, Truck } from 'lucide-react';
import { cn, TextField } from '@/ui';

/**
 * Phone / name / address inputs shared by the "Add New Supplier" card and the edit sheet. Wrap in a <form> so Enter
 * submits (the original fields were single-line inputs). `layout="row"` puts the fields side by side from `sm` up.
 */
export function SupplierFormFields({ value, onChange, layout = 'stack', idPrefix = 'supplier' }) {
  const set = (key) => (v) => onChange({ ...value, [key]: v });
  return (
    <div className={cn('grid gap-4', layout === 'row' && 'sm:grid-cols-3 xl:grid-cols-1')}>
      <TextField
        id={`${idPrefix}-phone`}
        label="Phone Number *"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="98765 43210"
        leftIcon={Phone}
        value={value.phone}
        onChange={set('phone')}
      />
      <TextField
        id={`${idPrefix}-name`}
        label="Supplier Name *"
        autoComplete="off"
        placeholder="e.g. ABC Traders"
        leftIcon={Truck}
        value={value.name}
        onChange={set('name')}
      />
      <TextField
        id={`${idPrefix}-address`}
        label="Address"
        autoComplete="off"
        placeholder="Street, area, city"
        leftIcon={MapPin}
        value={value.address}
        onChange={set('address')}
      />
    </div>
  );
}
