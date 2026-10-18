import { useAppNavigate } from '@/hooks/useRouteParams';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeedback } from '@/ui';
import { useShortcuts } from '@/hooks/useShortcuts';
import { db } from '@/core/db';
import { buildAcknowledgementMessage, validatePurchaseBill } from '@/core/services/purchaseBill';
import { shareAcknowledgement, validateAcknowledgement } from '../acknowledgement';
import { MIN_SUPPLIER_PHONE_LENGTH, previousBalanceFor } from '../purchaseCreate';
import { loadPurchaseForEdit, purchaseEditTotals, savePurchaseEdit } from '../purchaseEdit';
/** The web waited 500 ms after the last keystroke before looking the supplier up. */
const PHONE_LOOKUP_DELAY_MS = 500;
/** State + actions of the Edit Purchase Bill screen — edit-purchase.js. */
export function usePurchaseEditForm(invoiceNo) {
  const { toast, loading } = useFeedback();
  const shortcuts = useShortcuts();
  const nav = useAppNavigate();
  const [status, setStatus] = useState('loading');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const phoneTimer = useRef(null);
  const patch = useCallback((changes) => setForm((f) => (f ? { ...f, ...changes } : f)), []);
  const load = useCallback(async () => {
    setStatus('loading');
    try {
      // the list screens cache these; an edit must start from what is stored now
      db.invalidate('purchaseInvoices', 'purchasePayments');
      const loaded = await loadPurchaseForEdit(invoiceNo);
      if (!loaded) {
        setStatus('notFound');
        toast('Not Found', 'Purchase bill not found.', 'error');
        return;
      }
      setForm(loaded.form);
      setStatus('ready');
    } catch (e) {
      console.error('Failed to load invoice:', e);
      setStatus('error');
      toast('Error', 'Failed to load invoice data.', 'error');
    }
  }, [invoiceNo, toast]);
  useEffect(() => {
    void load();
  }, [load]);
  // Moving the bill to another date or supplier changes its place in the ledger: re-read what it carries in.
  const supplierName = form?.supplierName;
  const supplierPhone = form?.supplierPhone;
  const invoiceDate = form?.invoiceDate;
  const editedNo = form?.invoiceNo;
  useEffect(() => {
    if (editedNo === undefined) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      previousBalanceFor({ supplierName, supplierPhone, invoiceNo: editedNo, invoiceDate })
        .then((value) => {
          if (!cancelled && value !== null)
            setForm((f) => (!f || f.previousBalance === value ? f : { ...f, previousBalance: value }));
        })
        .catch((e) => console.error('Error calculating previous balance:', e));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supplierName, supplierPhone, invoiceDate, editedNo]);
  useEffect(
    () => () => {
      if (phoneTimer.current) clearTimeout(phoneTimer.current);
    },
    [],
  );
  /** Phone is editable here; a known number fills name + address, clearing it clears them (an unknown number keeps them). */
  const onPhoneChange = (phone) => {
    patch({ supplierPhone: phone });
    if (phoneTimer.current) clearTimeout(phoneTimer.current);
    phoneTimer.current = setTimeout(async () => {
      const p = phone.trim();
      if (p.length >= MIN_SUPPLIER_PHONE_LENGTH) {
        try {
          const supplier = await db.getSupplier(p);
          if (supplier) {
            patch({ supplierName: supplier.name || '', supplierAddress: supplier.address || '' });
            toast('Supplier details loaded.', undefined, 'success');
          }
        } catch (error) {
          console.error('Error fetching supplier:', error);
        }
      } else if (p.length === 0) {
        patch({ supplierName: '', supplierAddress: '' });
      }
    }, PHONE_LOOKUP_DELAY_MS);
  };
  const save = async () => {
    if (!form || saving) return;
    const shortcutsList = shortcuts ?? (await db.getAllShortcuts());
    const invalid = validatePurchaseBill(form, shortcutsList);
    if (invalid) {
      toast(invalid.title, invalid.message, 'error');
      return;
    }
    setSaving(true);
    try {
      await loading.run(
        'Updating Bill',
        () => savePurchaseEdit(form),
        'Please wait while we save your changes...',
      );
      toast('Bill Updated', 'Purchase bill updated successfully!', 'success');
      nav.replace('/purchase/history');
    } catch (e) {
      console.error('Error updating purchase bill:', e);
      toast('Error', 'Error updating purchase bill.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const share = async () => {
    if (!form) return;
    const invalid = validateAcknowledgement(form, null);
    if (invalid) {
      toast(invalid.title, invalid.message, 'error');
      return;
    }
    const outcome = await shareAcknowledgement(await buildAcknowledgementMessage(form));
    if (outcome === 'shared') toast('Shared', 'Acknowledgement shared successfully!', 'success');
    else if (outcome === 'copied')
      toast('Copied', 'Message copied to clipboard! You can paste it to share.', 'success');
    else if (outcome === 'failed') toast('Error', 'Failed to share or copy to clipboard.', 'error');
  };
  return {
    status,
    form,
    patch,
    totals: form ? purchaseEditTotals(form) : null,
    shortcuts,
    saving,
    reload: load,
    onPhoneChange,
    save,
    share,
  };
}
