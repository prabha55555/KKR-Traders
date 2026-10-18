import { useRouteParams } from '@/hooks/useRouteParams';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFeedback } from '@/ui';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { db } from '@/core/db';
import { addCustomer, deleteCustomer, updateCustomer } from './customerService';
import { EMPTY_CUSTOMER_DRAFT, filterCustomers } from './customerValidation';
const freshAddTarget = (phone = '') => ({ mode: 'add', initial: { ...EMPTY_CUSTOMER_DRAFT, phone } });
/**
 * Controller of the Add Customer tab (manage-customers.js): loads the directory, filters it, and runs add / edit /
 * delete through the confirm + toast + loading helpers. On desktop the form is an always-visible card driven by
 * `form.mode` / `form.initial`; on phones `form.open` shows it in a sheet.
 */
export function useCustomerManager() {
  const { toast, confirm, loading } = useFeedback();
  const { isExpanded } = useBreakpoint();
  const { params, setParams } = useRouteParams();
  const phoneParam = Array.isArray(params.phone) ? params.phone[0] : params.phone;
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [target, setTarget] = useState(() => freshAddTarget());
  const focusLoad = useFocusLoad(async () => {
    setCustomers(await db.getAllCustomers());
  });
  const visible = useMemo(() => filterCustomers(customers, query), [customers, query]);
  const openAdd = useCallback(
    (phone = '') => {
      setTarget(freshAddTarget(phone));
      setFormOpen(!isExpanded);
    },
    [isExpanded],
  );
  const openEdit = useCallback(
    (customer) => {
      setTarget({
        mode: 'edit',
        original: customer,
        initial: {
          phone: customer.phone ?? '',
          name: customer.name ?? '',
          address: customer.address ?? '',
          openingBalance: customer.openingBalance ?? '',
        },
      });
      setFormOpen(!isExpanded);
    },
    [isExpanded],
  );
  /** Desktop card: back to an empty add form. */
  const resetForm = useCallback(() => setTarget(freshAddTarget()), []);
  // The Sales Bill screen sends users here with the phone number it could not find: open the add form pre-filled.
  useEffect(() => {
    if (!phoneParam) return;
    openAdd(phoneParam);
    setParams({ phone: undefined });
  }, [setParams, openAdd, phoneParam]);
  const submit = useCallback(
    async (draft) => {
      const adding = target.mode === 'add';
      try {
        const result =
          adding || !target.original
            ? await addCustomer(draft)
            : await updateCustomer(target.original, draft);
        if (!result.ok) return result.errors;
        setFormOpen(false);
        if (isExpanded) setTarget(freshAddTarget());
        setCustomers(await db.getAllCustomers());
        setQuery('');
        toast(
          'Success',
          adding ? 'Customer added successfully!' : 'Customer updated successfully!',
          'success',
        );
      } catch (error) {
        console.error(adding ? 'Error adding customer:' : 'Error updating customer:', error);
        toast('Error', adding ? 'Failed to add customer.' : 'Failed to update customer.', 'error');
      }
      return null;
    },
    [isExpanded, target, toast],
  );
  const remove = useCallback(
    async (customer) => {
      if (!customer.phone) return;
      const confirmed = await confirm({
        title: 'Delete Customer',
        message: `WARNING: Deleting ${customer.name || 'this customer'} will also delete ALL INVOICES associated with them (they are moved to the Recycle Bin). Are you absolutely sure you want to proceed?`,
        tone: 'danger',
        confirmText: 'Delete',
      });
      if (!confirmed) return;
      try {
        await loading.run(
          'Deleting Customer',
          () => deleteCustomer(customer.phone),
          'Moving their invoices to the Recycle Bin...',
        );
        setCustomers(await db.getAllCustomers());
        toast('Success', 'Customer deleted. Their invoices were moved to the Recycle Bin.', 'success');
      } catch (error) {
        console.error('Error deleting customer:', error);
        toast('Error', 'Failed to delete customer.', 'error');
      }
    },
    [confirm, loading, toast],
  );
  return {
    ...focusLoad,
    customers,
    visible,
    query,
    setQuery,
    form: {
      open: formOpen,
      mode: target.mode,
      initial: target.initial,
      close: () => setFormOpen(false),
      reset: resetForm,
      submit,
    },
    openAdd,
    openEdit,
    remove,
  };
}
