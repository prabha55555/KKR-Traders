import { useAppNavigate } from '@/hooks/useRouteParams';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useFeedback } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useShortcuts } from '@/hooks/useShortcuts';
import { db } from '@/core/db';
import {
  buildAcknowledgementMessage,
  emptyPurchaseForm,
  loadPurchaseSuggestion,
  purchaseFormTotals,
  savePurchaseBillWithPayments,
} from '@/core/services/purchaseBill';
import { accountLabel } from '@/core/accountLabel';
import { formatCurrency } from '@/core/format';
import { loadLiveAccountBalances } from '@/features/finance/accountsLogic';
import { shareAcknowledgement, validateAcknowledgement } from '../acknowledgement';
import { checkPurchaseBeforeSave, lookupSupplier, previousBalanceFor } from '../purchaseCreate';
/** State + actions of the Purchase Bill (create) screen — purchase.js. */
export function usePurchaseBillForm() {
  const { toast, confirm, loading } = useFeedback();
  const nav = useAppNavigate();
  const shortcuts = useShortcuts();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState(() => {
    const initialForm = emptyPurchaseForm();
    const paramProduct = searchParams.get('product');
    if (paramProduct) {
      initialForm.rows = [
        {
          description: paramProduct,
          qty: searchParams.get('qty') || '',
          rate: '',
        },
        { description: '', qty: '', rate: '' },
      ];
    }
    return initialForm;
  });

  const [suppliers, setSuppliers] = useState([]);
  const [suggestion, setSuggestion] = useState({ lastInvoiceNo: '-', nextInvoiceNo: '' });
  /** a >= 10 character phone that matches no supplier */
  const [supplierMissing, setSupplierMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  /** bumped whenever the screen regains focus so the previous balance is re-read */
  const [focusTick, setFocusTick] = useState(0);
  const formRef = useRef(form);
  formRef.current = form;
  const lookupSeq = useRef(0);
  const patch = useCallback((changes) => setForm((f) => ({ ...f, ...changes })), []);
  /** Fills the read-only name/address from the supplier the phone points at; stale answers are dropped. */
  const resolveSupplier = useCallback(
    async (phone, announce) => {
      const seq = ++lookupSeq.current;
      try {
        const result = await lookupSupplier(phone);
        if (seq !== lookupSeq.current) return;
        if (result.kind === 'found') {
          const name = result.supplier.name || '';
          const changed = formRef.current.supplierName !== name;
          patch({ supplierName: name, supplierAddress: result.supplier.address || '' });
          setSupplierMissing(false);
          if (announce && changed) toast('Supplier details loaded.', undefined, 'success');
        } else {
          // PARITY NOTE: between 1 and 9 characters the web kept the previous supplier's name/address, which let a bill
          // be saved under a partial phone number. The read-only details are cleared whenever the phone matches nobody.
          patch({ supplierName: '', supplierAddress: '' });
          setSupplierMissing(result.kind === 'notFound');
        }
      } catch (error) {
        console.error('Error fetching supplier:', error);
      }
    },
    [patch, toast],
  );
  const refreshData = useCallback(async () => {
    const [list, next] = await Promise.all([db.getAllSuppliers(), loadPurchaseSuggestion()]);
    setSuppliers(list);
    setSuggestion(next);
    setFocusTick((t) => t + 1);
    // the supplier may have just been added from the Add tab
    if (formRef.current.supplierPhone.trim()) await resolveSupplier(formRef.current.supplierPhone, false);
  }, [resolveSupplier]);
  const { loading: initialLoading, refreshing, error, refresh } = useFocusLoad(refreshData);
  const { supplierName, supplierPhone, invoiceNo, invoiceDate } = form;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      previousBalanceFor({ supplierName, supplierPhone, invoiceNo, invoiceDate })
        .then((value) => {
          if (!cancelled && value !== null)
            setForm((f) => (f.previousBalance === value ? f : { ...f, previousBalance: value }));
        })
        .catch((e) => console.error('Error calculating previous balance:', e));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supplierName, supplierPhone, invoiceNo, invoiceDate, focusTick]);
  const onPhoneChange = (phone) => {
    patch({ supplierPhone: phone });
    void resolveSupplier(phone, true);
  };
  const onSelectSupplier = (party) => {
    lookupSeq.current++;
    patch({
      supplierPhone: party.phone,
      supplierName: party.name || '',
      supplierAddress: party.address || '',
    });
    setSupplierMissing(false);
    toast('Supplier details loaded.', undefined, 'success');
  };
  const applySuggestion = () => {
    if (suggestion.nextInvoiceNo) patch({ invoiceNo: suggestion.nextInvoiceNo });
  };
  const save = async () => {
    if (saving) return;
    const check = await checkPurchaseBeforeSave(form);
    if (check.error) {
      toast(check.error.title, check.error.message, 'error');
      return;
    }
    if (check.overwrites) {
      const ok = await confirm({
        title: 'Bill number already exists',
        message: `Purchase bill ${form.invoiceNo.trim()} already exists. Saving will move it to the Recycle Bin with its payments and returns, and its amount will no longer count in that supplier's balance. Continue?`,
        tone: 'danger',
        confirmText: 'Overwrite',
      });
      if (!ok) return;
    }

    // Pre-purchase fund balance verification
    try {
      const balances = await loadLiveAccountBalances();
      const cashAmt = parseFloat(form.cash) || 0;
      const bankAmt = parseFloat(form.account) || 0;

      if (cashAmt > 0 && cashAmt > balances.cashBalance) {
        const ok = await confirm({
          title: 'Insufficient Cash in Hand',
          message: `Paying ₹${formatCurrency(cashAmt)} in Cash exceeds available cash balance (₹${formatCurrency(balances.cashBalance)}). This will make your physical cash balance negative.\n\nDo you want to proceed with an overdraft, or cancel and adjust the payment?`,
          tone: 'warning',
          confirmText: 'Proceed Anyway',
          cancelText: 'Cancel & Adjust',
        });
        if (!ok) return;
      }

      if (bankAmt > 0) {
        const targetId = form.bankAccountId || balances.bankAccounts[0]?.id;
        const targetBank = balances.bankAccounts.find((b) => b.id === targetId);
        if (targetBank && bankAmt > targetBank.currentBalance) {
          const bankName = accountLabel(targetBank);
          const ok = await confirm({
            title: `Insufficient Balance in ${bankName}`,
            message: `Paying ₹${formatCurrency(bankAmt)} exceeds the available balance in ${bankName} (₹${formatCurrency(targetBank.currentBalance)}).\n\nDo you want to proceed with account overdraft?`,
            tone: 'warning',
            confirmText: 'Proceed Anyway',
            cancelText: 'Cancel & Adjust',
          });
          if (!ok) return;
        }
      }
    } catch (err) {
      console.error('Error verifying fund balances:', err);
    }

    setSaving(true);
    try {
      await loading.run(
        'Saving Bill',
        () => savePurchaseBillWithPayments(form, { replaceExisting: check.overwrites }),
        'Please wait while we save your invoice...',
      );
      toast('Bill Saved', 'Purchase Bill saved successfully!', 'success');
      setSuggestion(await loadPurchaseSuggestion());
      nav.replace('/purchase/history');
    } catch (e) {
      console.error('Error saving purchase bill:', e);
      toast('Error', 'Error saving purchase bill.', 'error');
    } finally {
      setSaving(false);
    }
  };
  const share = async () => {
    db.invalidate('shortcuts');
    const invalid = validateAcknowledgement(form, await db.getAllShortcuts());
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
  /** Starts the next bill (the web page was simply reloaded). */
  const reset = async () => {
    const ok = await confirm({
      title: 'Clear form?',
      message: 'Everything entered on this bill will be removed.',
      confirmText: 'Clear',
    });
    if (!ok) return;
    lookupSeq.current++;
    setForm(emptyPurchaseForm());
    setSupplierMissing(false);
  };
  return {
    form,
    patch,
    totals: purchaseFormTotals(form),
    suppliers,
    suggestion,
    shortcuts,
    supplierMissing,
    saving,
    initialLoading,
    refreshing,
    error,
    refresh,
    onPhoneChange,
    onSelectSupplier,
    applySuggestion,
    save,
    share,
    reset,
  };
}
