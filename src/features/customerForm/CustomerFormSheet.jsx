import { Save, UserPlus } from 'lucide-react';

import { Button, Modal } from '@/ui';
import { CustomerFormFields } from './CustomerFormFields';
import { useCustomerDraft } from './useCustomerDraft';

/**
 * Add / edit customer form in a bottom sheet (phones and tablets; desktops use `CustomerFormCard`).
 * `onSubmit` resolves with field errors to show inline, or null once the customer was saved (the parent closes it).
 */
export function CustomerFormSheet({ visible, mode, initial, onClose, onSubmit }) {
  const form = useCustomerDraft(initial, visible, onSubmit);
  const adding = mode === 'add';

  return (
    <Modal
      open={visible}
      onClose={onClose}
      title={adding ? 'Add New Customer' : 'Edit Customer'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={form.busy} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button
            variant={adding ? 'primary' : 'success'}
            icon={adding ? UserPlus : Save}
            loading={form.busy}
            onClick={form.submit}
            className="flex-1 sm:flex-none"
          >
            {adding ? 'Add Customer' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <CustomerFormFields
        draft={form.draft}
        errors={form.errors}
        change={form.change}
        onSubmit={form.submit}
      />
    </Modal>
  );
}
