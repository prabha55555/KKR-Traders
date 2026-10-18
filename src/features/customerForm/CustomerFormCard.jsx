import { Save, UserPen, UserPlus } from 'lucide-react';

import { Button, Card, SectionHeader } from '@/ui';
import { CustomerFormFields } from './CustomerFormFields';
import { useCustomerDraft } from './useCustomerDraft';

/**
 * Add / edit customer form as an always-visible card (the website's "Add New Customer" form). Switching to edit mode
 * loads the chosen customer into the same card; Cancel (or a successful save) returns it to an empty add form.
 */
export function CustomerFormCard({ mode, initial, onCancel, onSubmit }) {
  const form = useCustomerDraft(initial, true, onSubmit);
  const adding = mode === 'add';

  return (
    <Card className="relative overflow-hidden">
      <span className="absolute inset-x-0 top-0 h-[2px] hairline-gold" aria-hidden />
      <SectionHeader
        title={adding ? 'Add New Customer' : 'Edit Customer'}
        icon={adding ? UserPlus : UserPen}
        className="mb-1"
      />
      <p className="mb-4 text-[13px] text-slate-500">
        {adding
          ? 'Phone number and name are required; address is optional.'
          : 'Update the details, then save your changes.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.submit();
        }}
        noValidate
      >
        <CustomerFormFields
          draft={form.draft}
          errors={form.errors}
          change={form.change}
          onSubmit={form.submit}
        />
        <div className="mt-5 flex gap-3">
          {adding ? null : (
            <Button variant="outline" onClick={onCancel} disabled={form.busy} className="flex-1">
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            variant={adding ? 'primary' : 'success'}
            icon={adding ? UserPlus : Save}
            loading={form.busy}
            className="flex-1"
          >
            {adding ? 'Add Customer' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
