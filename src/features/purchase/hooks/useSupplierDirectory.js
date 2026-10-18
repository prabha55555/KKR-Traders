import { useRouteParams } from '@/hooks/useRouteParams';
import { useEffect, useMemo, useState } from 'react';
import { useFeedback } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { db } from '@/core/db';
import {
  addSupplier,
  filterSupplierDirectory,
  removeSupplier,
  updateSupplier,
  validateNewSupplier,
  validateSupplierEdit,
} from '../supplierAdmin';
const EMPTY_SUPPLIER = { phone: '', name: '', address: '' };
/** State + actions of the Add Supplier screen — manage-suppliers.js. */
export function useSupplierDirectory() {
  const { toast, confirm } = useFeedback();
  const [suppliers, setSuppliers] = useState([]);
  const [query, setQuery] = useState('');
  const [newSupplier, setNewSupplier] = useState(EMPTY_SUPPLIER);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const { loading, refreshing, error, refresh, reload } = useFocusLoad(async () => {
    setSuppliers(await db.getAllSuppliers());
  });
  // "Add Supplier" button of the Purchase Bill screen hands over the phone number it could not find
  const { phone: phoneParam } = useRouteParams().params;
  useEffect(() => {
    if (typeof phoneParam === 'string' && phoneParam) setNewSupplier((s) => ({ ...s, phone: phoneParam }));
  }, [phoneParam]);
  const visible = useMemo(() => filterSupplierDirectory(suppliers, query), [suppliers, query]);
  const add = async () => {
    const message = validateNewSupplier(newSupplier);
    if (message) {
      toast('Invalid Information', message, 'error');
      return;
    }
    setAdding(true);
    try {
      if ((await addSupplier(newSupplier)) === 'duplicate') {
        toast('Duplicate Supplier', 'A supplier with this phone number already exists.', 'error');
        return;
      }
      setNewSupplier(EMPTY_SUPPLIER);
      setQuery('');
      await reload();
      toast('Supplier Added', 'Supplier added successfully!', 'success');
      return true;
    } catch (e) {
      console.error('Error adding supplier:', e);
      toast('Error', 'Failed to add supplier.', 'error');
      return false;
    } finally {
      setAdding(false);
    }
  };
  const startEdit = (supplier) =>
    setEditing({
      original: supplier,
      draft: { phone: supplier.phone || '', name: supplier.name || '', address: supplier.address || '' },
    });
  const saveEdit = async () => {
    if (!editing) return;
    const message = validateSupplierEdit(editing.draft);
    if (message) {
      toast('Invalid Information', message, 'error');
      return;
    }
    setSavingEdit(true);
    try {
      const result = await updateSupplier(editing.original, editing.draft);
      if (result.status === 'duplicate') {
        toast('Duplicate Supplier', 'A supplier with the new phone number already exists.', 'error');
        return;
      }
      setEditing(null);
      await reload();
      toast('Supplier Updated', 'Supplier updated successfully!', 'success');
    } catch (e) {
      console.error('Error updating supplier:', e);
      toast('Error', 'Failed to update supplier.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };
  const remove = async (supplier) => {
    if (!supplier.phone) return;
    const ok = await confirm({
      title: `Delete ${supplier.name || 'supplier'}?`,
      message: 'Are you sure you want to delete this supplier?',
      tone: 'danger',
      confirmText: 'Delete',
    });
    if (!ok) return;
    try {
      await removeSupplier(supplier.phone);
      await reload();
      toast('Supplier Deleted', 'Supplier deleted successfully.', 'success');
    } catch (e) {
      console.error('Error deleting supplier:', e);
      toast('Error', 'Failed to delete supplier.', 'error');
    }
  };
  return {
    suppliers,
    visible,
    query,
    setQuery,
    loading,
    refreshing,
    error,
    refresh,
    newSupplier,
    setNewSupplier,
    adding,
    add,
    editing,
    setEditing,
    savingEdit,
    startEdit,
    saveEdit,
    remove,
  };
}
