import { useRouteParams } from '@/hooks/useRouteParams';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeedback } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useShortcuts } from '@/hooks/useShortcuts';
import { db } from '@/core/db';
import { formatDateIN, formatInvoiceNo, invoiceNoLabel, todayISO } from '@/core/format';
import { printInvoice, shareInvoicePdf } from '@/core/services/invoiceShare';
import { buildSalesInvoice, saveSalesBill, salesFormTotals } from '@/core/services/salesBill';
import { openInvoiceForEditing } from './billLoader';
import {
  editBill,
  editParamAction,
  markSaved,
  newBillSession,
  planSave,
  saveButtonLabel,
  savedBillMessage,
  withRefreshedPreviousBalance,
  withSavedLedger,
} from './billSession';
import { previousBalanceFor } from './customerLookup';
import { useCustomerLookup } from './useCustomerLookup';
import { useInvoiceSuggestion } from './useInvoiceSuggestion';
/**
 * Controller of the Sales Bill screen (sales.html + script.js): holds the bill session, loads reference data,
 * reacts to the `?edit=` route param and implements Save / Generate / Share / Reset.
 */
export function useSalesBill() {
  const { toast, confirm, loading } = useFeedback();
  const { params, setParams } = useRouteParams();
  const editParam = Array.isArray(params.edit) ? params.edit[0] : params.edit;
  const editParamRef = useRef(editParam);
  editParamRef.current = editParam;
  const shortcuts = useShortcuts();
  const [session, setSession] = useState(newBillSession);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const [customers, setCustomers] = useState(null);
  const customersRef = useRef(null);
  /** a Save / Generate / Share is running (the overlay blocks touches, this also blocks a double tap) */
  const busy = useRef(false);
  /** bumped whenever the open bill is replaced, so a slower earlier load cannot overwrite a newer state */
  const openRequest = useRef(0);
  const { form } = session;
  const totals = useMemo(() => salesFormTotals(form), [form]);
  const { suggestion, refresh: refreshSuggestion } = useInvoiceSuggestion(form.invoiceDate);
  const patch = useCallback((change) => setSession((s) => editBill(s, change)), []);
  const getForm = useCallback(() => sessionRef.current.form, []);
  const [openingBalancePopup, setOpeningBalancePopup] = useState(null);
  const handleCustomerFound = useCallback((customer) => {
    const ob = parseFloat(customer?.openingBalance ?? 0);
    if (ob > 0) {
      setOpeningBalancePopup({
        customerName: customer.name || '',
        customerPhone: customer.phone || '',
        openingBalance: ob,
      });
    }
  }, []);
  const lookup = useCustomerLookup({
    customersRef,
    getForm,
    patch,
    onError: (message) => toast('Error', message, 'error'),
    onCustomerFound: handleCustomerFound,
  });
  /** Remove `?edit=` from this screen's own route (not the focused one, which may have changed by now). */
  const clearEditParam = useCallback(() => {
    setParams({ edit: undefined });
  }, [setParams]);
  // ------------------------------------------------------------ edit mode
  /**
   * Opens an invoice for editing. `silent` = background refresh of the invoice that is already open (no overlay, no
   * error toasts, never touches the route param) that is dropped if the user started editing or switched bills meanwhile.
   */
  const openInvoice = useCallback(
    async (invoiceNo, silent = false) => {
      const request = silent ? openRequest.current : ++openRequest.current;
      try {
        const opened = await (silent
          ? openInvoiceForEditing(invoiceNo)
          : loading.run(
              'Loading Invoice',
              () => openInvoiceForEditing(invoiceNo),
              `Loading ${invoiceNoLabel(invoiceNo)} for editing...`,
            ));
        if (request !== openRequest.current) return;
        if (silent) {
          const current = sessionRef.current;
          if (
            !opened ||
            !current.saved ||
            current.editingNo !== invoiceNo ||
            editParamRef.current !== invoiceNo
          )
            return;
        } else if (!opened) {
          toast('Error', 'Invoice not found!', 'error');
          clearEditParam();
          return;
        }
        lookup.cancel();
        setSession(opened);
      } catch (error) {
        console.error('Error loading invoice:', error);
        if (!silent && request === openRequest.current) {
          toast('Error', 'Error loading invoice for editing.', 'error');
          clearEditParam();
        }
      }
    },
    [clearEditParam, lookup, loading, toast],
  );
  const startNewBill = useCallback(() => {
    openRequest.current++;
    lookup.cancel();
    setSession(newBillSession());
    void refreshSuggestion(todayISO());
  }, [lookup, refreshSuggestion]);
  // Tab screens stay mounted, so `?edit=` can change (or be cleared) while this screen lives.
  const onEditParamChange = useRef(() => undefined);
  onEditParamChange.current = () => {
    const action = editParamAction(editParam, sessionRef.current);
    if (action.type === 'load') void openInvoice(action.invoiceNo);
    else if (action.type === 'reset') startNewBill();
  };
  useEffect(() => onEditParamChange.current(), [editParam]);
  // ------------------------------------------------------------ data loading (initial load + every tab focus)
  const load = useCallback(async () => {
    const list = await db.getAllCustomers();
    customersRef.current = list;
    setCustomers(list);
    void refreshSuggestion(sessionRef.current.form.invoiceDate);
    if (busy.current) return;
    const current = sessionRef.current;
    if (current.editingNo !== null) {
      // History may have added payments to the invoice since it was opened: re-read it unless it has local edits.
      if (current.saved && editParamRef.current === current.editingNo)
        await openInvoice(current.editingNo, true);
      return;
    }
    if (current.saved) {
      // a new bill saved on this screen: an earlier bill may have changed since (History, another device) — show what
      // the ledger now carries, so Generate / Share print the stored figure
      const { customerName: name, customerPhone: phone, invoiceDate: date } = current.form;
      if (current.persistedNo && (name || phone)) {
        const previousBalance = await previousBalanceFor(name, phone, current.persistedNo, date);
        if (previousBalance !== null)
          setSession((s) =>
            s.persistedNo === current.persistedNo ? withSavedLedger(s, { previousBalance }) : s,
          );
      }
      return;
    }
    const { customerName, customerPhone, invoiceNo, invoiceDate } = current.form;
    if (customerName || customerPhone) {
      const previousBalance = await previousBalanceFor(customerName, customerPhone, invoiceNo, invoiceDate);
      setSession((s) => withRefreshedPreviousBalance(s, previousBalance));
    }
    lookup.recheck();
  }, [lookup, openInvoice, refreshSuggestion]);
  const focusLoad = useFocusLoad(load);
  const ready = customers !== null;
  // A bill's place in the customer's ledger depends on its number and date: re-read the carried balance when either
  // changes on a new bill or an edited one (customer changes are handled by the lookup itself).
  const { invoiceNo: formInvoiceNo, invoiceDate: formInvoiceDate } = form;
  useEffect(() => {
    const { form: f, saved } = sessionRef.current;
    if (saved || (!f.customerName && !f.customerPhone)) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      const now = sessionRef.current.form;
      previousBalanceFor(now.customerName, now.customerPhone, now.invoiceNo, now.invoiceDate)
        .then((previousBalance) => {
          // a Save that started meanwhile has its own snapshot: do not mark that bill unsaved
          if (!cancelled && !busy.current)
            setSession((s) => withRefreshedPreviousBalance(s, previousBalance));
        })
        .catch((error) => console.error('Error calculating previous balance', error));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [formInvoiceNo, formInvoiceDate]);
  // ------------------------------------------------------------ form editing
  const applySuggestion = useCallback(() => {
    const next = suggestion?.nextInvoiceNo;
    if (!next || next === '-') return;
    patch({ invoiceNo: next });
    toast('Applied!', `Invoice No set to ${formatInvoiceNo(next)}`, 'success');
  }, [patch, suggestion, toast]);
  // ------------------------------------------------------------ actions
  const performSave = useCallback(async () => {
    const snapshot = sessionRef.current;
    const shortcutsList = shortcutsRef.current ?? (await db.getAllShortcuts());
    const plan = await planSave(snapshot, shortcutsList);
    if (plan.kind === 'invalid') {
      toast(plan.error.title, plan.error.message, 'error');
      return null;
    }
    if (plan.kind === 'confirm-overwrite') {
      const existing = await db.getInvoice(plan.invoiceNo).catch(() => null);
      const who = existing
        ? ` (${existing.customerName || 'customer'}, ${formatDateIN(existing.invoiceDate)})`
        : '';
      const proceed = await confirm({
        title: 'Invoice Already Exists',
        message: `${invoiceNoLabel(plan.invoiceNo)}${who} already exists. Saving will move it to the Recycle Bin with its payments and returns, and its amount will no longer count in that customer's balance. Continue?`,
        tone: 'warning',
        confirmText: 'Overwrite',
      });
      if (!proceed) return null;
    }
    const replaceExisting = plan.kind === 'confirm-overwrite';
    const invoice = await loading.run(
      'Saving Bill',
      () => saveSalesBill(snapshot.form, { replaceExisting }),
      'Please wait while we save your invoice...',
    );
    setSession((s) => withSavedLedger(markSaved(s, snapshot.form), invoice));
    void refreshSuggestion(snapshot.form.invoiceDate);
    toast('Bill Saved', savedBillMessage(invoice), 'success');
    return invoice;
  }, [confirm, loading, refreshSuggestion, toast]);

  const save = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await performSave();
    } catch (error) {
      console.error('Error saving bill:', error);
      toast('Error', 'Error saving bill. Please try again.', 'error');
    } finally {
      busy.current = false;
    }
  }, [performSave, toast]);

  const output = useCallback(
    async (kind) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const snapshot = sessionRef.current;
        let invoice;
        if (!snapshot.saved) {
          try {
            invoice = await performSave();
          } catch (error) {
            console.error('Error saving bill before output:', error);
            toast('Error', 'Error saving bill. Please try again.', 'error');
            return;
          }
          if (!invoice) return;
        } else {
          // a payment added later from History is not in the form: print the stored bill (read fresh) instead
          invoice = null;
          if (snapshot.persistedNo) {
            try {
              db.invalidate('invoices');
              invoice = await db.getInvoice(snapshot.persistedNo);
            } catch (error) {
              console.error('Error reading the saved bill, using the form:', error);
            }
          }
          invoice = invoice ?? buildSalesInvoice(snapshot.form);
        }
        if (kind === 'pdf') {
          await loading.run(
            'Generating PDF',
            () => printInvoice(invoice),
            'Creating your invoice document...',
          );
        } else {
          const result = await loading.run(
            'Preparing PDF',
            () => shareInvoicePdf(invoice),
            'Creating your invoice document...',
          );
          if (result === 'fallback') {
            toast(
              'Share not available',
              'Direct PDF sharing is not supported on this device. Opening WhatsApp - please attach the PDF manually.',
              'info',
            );
          }
        }
      } catch (error) {
        console.error(kind === 'pdf' ? 'Error generating PDF:' : 'Error sharing to WhatsApp:', error);
        if (kind === 'pdf') toast('Error', 'Error generating PDF. Please try again.', 'error');
        else
          toast(
            'Error',
            `Failed to share via WhatsApp. ${error instanceof Error ? error.message : ''}`.trim(),
            'error',
          );
      } finally {
        busy.current = false;
      }
    },
    [loading, performSave, toast],
  );
  /** Reset BILL (always asks) or the edit banner's "New bill" (asks only when something would be lost). */
  const reset = useCallback(
    async (askFirst = true) => {
      if (busy.current) return;
      if (askFirst) {
        const proceed = await confirm({
          title: 'Reset Form',
          message: 'Are you sure you want to reset the form? All unsaved data will be lost.',
          tone: 'warning',
          confirmText: 'Reset',
        });
        if (!proceed) return;
      }
      startNewBill();
      if (editParam) clearEditParam();
    },
    [clearEditParam, confirm, editParam, startNewBill],
  );
  return {
    ready,
    initialLoading: focusLoad.loading,
    loadError: focusLoad.error,
    refreshing: focusLoad.refreshing,
    refresh: focusLoad.refresh,
    session,
    form,
    totals,
    shortcuts,
    customers: customers ?? [],
    suggestion,
    saveLabel: saveButtonLabel(session),
    patch,
    lookup,
    applySuggestion,
    save,
    generate: () => output('pdf'),
    share: () => output('whatsapp'),
    reset,
    openingBalancePopup,
    closeOpeningBalancePopup: () => setOpeningBalancePopup(null),
  };
}
