/**
 * Editable supplier block of the Edit Purchase Bill screen (edit-purchase.html): phone, name and address are all
 * typed in (unlike the create screen, where name/address are read-only and come from the supplier directory).
 *
 * Props
 *  - phone, name, address: string
 *  - onPhoneChange(phone) · onNameChange(name) · onAddressChange(address)
 */
import { Phone } from 'lucide-react';
import { Grid, TextArea, TextField } from '@/ui';

export function PurchaseSupplierFields({
  phone,
  name,
  address,
  onPhoneChange,
  onNameChange,
  onAddressChange,
}) {
  return (
    <div className="space-y-3.5">
      <Grid cols={{ base: 1, sm: 2 }}>
        <TextField
          label="Supplier phone"
          type="tel"
          inputMode="tel"
          placeholder="e.g. 98765 43210"
          autoComplete="off"
          leftIcon={Phone}
          value={phone}
          onChange={onPhoneChange}
        />
        <TextField label="Name" placeholder="e.g. ABC Traders" value={name} onChange={onNameChange} />
      </Grid>
      <TextArea
        label="Address"
        placeholder="Street, area, city"
        rows={2}
        value={address}
        onChange={onAddressChange}
      />
    </div>
  );
}
