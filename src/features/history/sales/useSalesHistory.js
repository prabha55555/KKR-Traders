import { useAppNavigate, useRouteParams } from '@/hooks/useRouteParams';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeedback } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { db } from '@/core/db';
import { filterInvoices, recentInvoices } from '../lib/filters';
import { filterByDate, getDateWiseStatistics } from '../lib/grouping';
import { formatCurrency, toNum } from '@/core/format';
import { paymentSuccessMessage } from '../lib/payments';
import { returnSuccessMessage } from '../lib/returns';
import { EMPTY_FILTERS, isUserError } from '../lib/types';
import { buildSalesHistoryData, toHistoryPayment, toHistoryReturn } from './salesModel';
import { addSalesPayment, undoAllSalesPayments, undoSalesPayment } from './salesPayments';
import { saveSalesReturn, undoAllSalesReturns, undoSalesReturn } from './salesReturns';
import {
  DELETE_BLOCKED_MESSAGE,
  DELETE_BLOCKED_TITLE,
  deleteSalesInvoice,
  deleteSuccessMessage,
  hasPaymentOrReturnHistory,
} from './salesDelete';
import { downloadInvoiceStatement, shareInvoiceStatement } from './salesStatements';
const NONE = { kind: 'none' };
/**
 * Controller of the Sales History screen: loads invoices + returns + payments once, applies the filters, owns the
 * open panel, and runs every invoice action (payments, returns, delete, statements, print/share) through the
 * sales services. All messages are the web page's.
 */
export function useSalesHistory(onDataChanged) {
  const { toast, confirm, loading: overlay } = useFeedback();
  const { params } = useRouteParams();
  const nav = useAppNavigate();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(NONE);
  const dataRef = useRef(null);
  dataRef.current = data;
  const load = useCallback(async () => {
    // One read per collection per load; everything per invoice is looked up from these.
    const [invoices, returns, payments] = await Promise.all([
      db.getAllInvoices(),
      db.getAllReturns(),
      db.getAllPayments(),
    ]);
    setData(buildSalesHistoryData(invoices, returns, payments));
  }, []);
  const { loading, refreshing, error, refresh, reload } = useFocusLoad(load);
  const closeSheet = useCallback(() => setSheet(NONE), []);
  /** after any write: reload the list and let the statement section refresh itself */
  const reloadAll = useCallback(async () => {
    await reload();
    onDataChanged?.();
  }, [reload, onDataChanged]);
  // ------------------------------------------------------------------ filters
  const apply = useCallback((next) => {
    setDraft(next);
    setApplied(next);
  }, []);
  // read through a ref so these callbacks stay stable while the user types (memoised list rows keep their props)
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const search = useCallback(() => setApplied(draftRef.current), []);
  const clearFilters = useCallback(() => apply(EMPTY_FILTERS), [apply]);
  const selectRecent = useCallback((invoiceNo) => apply({ ...draftRef.current, search: invoiceNo }), [apply]);
  const filterByDay = useCallback((day) => apply(filterByDate(draftRef.current, day)), [apply]);
  // ?search=<text> or ?view=<invoiceNo> (e.g. from stocks page row click or customer screen link)
  const searchParam = typeof params.search === 'string' ? params.search : '';
  const viewParam = typeof params.view === 'string' ? params.view : '';
  useEffect(() => {
    if (viewParam) {
      apply({ ...EMPTY_FILTERS, search: viewParam });
      setSheet({ kind: 'detail', invoiceNo: viewParam });
    } else if (searchParam) {
      apply({ ...EMPTY_FILTERS, search: searchParam });
    }
  }, [searchParam, viewParam, apply]);
  const filtered = useMemo(
    () => (data ? filterInvoices(data.invoices, applied, (i) => i.partyName) : []),
    [data, applied],
  );
  const stats = useMemo(() => getDateWiseStatistics(filtered), [filtered]);
  const recent = useMemo(() => (data ? recentInvoices(data.invoices, 5) : []), [data]);
  const detailInvoice = useMemo(
    () =>
      sheet.kind === 'detail' ? (data?.invoices.find((i) => i.invoiceNo === sheet.invoiceNo) ?? null) : null,
    [sheet, data],
  );
  // ------------------------------------------------------------------ opening panels
  const openPayments = useCallback(
    async (invoiceNo) => {
      try {
        const [payments, invoice] = await Promise.all([
          db.getPaymentsByInvoice(invoiceNo),
          db.getInvoice(invoiceNo),
        ]);
        if (!invoice) {
          toast('Error', 'Invoice not found!', 'error');
          return;
        }
        const canAddPayment =
          dataRef.current?.invoices.find((i) => i.invoiceNo === invoiceNo)?.canAddPayment ?? false;
        setSheet({
          kind: 'payments',
          invoiceNo,
          partyName: invoice.customerName,
          balanceDue: invoice.balanceDue,
          bankAccountId: invoice.bankAccountId,
          payments: payments.map((p) => toHistoryPayment(p, invoice.bankAccountId)),
          canAddPayment,
        });
      } catch (e) {
        console.error('Error viewing payment history:', e);
        toast('Error', 'Error loading payment history.', 'error');
      }
    },
    [toast],
  );
  const openReturns = useCallback(
    async (invoiceNo) => {
      try {
        const [returns, invoice] = await Promise.all([
          db.getReturnsByInvoice(invoiceNo),
          db.getInvoice(invoiceNo),
        ]);
        if (!invoice) {
          toast('Error', 'Invoice not found!', 'error');
          return;
        }
        setSheet({
          kind: 'returns',
          invoiceNo,
          partyName: invoice.customerName,
          bankAccountId: invoice.bankAccountId,
          returns: returns.map((r) => toHistoryReturn(r, invoice.bankAccountId)),
        });
      } catch (e) {
        console.error('Error viewing return status:', e);
        toast('Error', 'Error loading return status.', 'error');
      }
    },
    [toast],
  );
  const openAddPayment = useCallback((invoiceNo) => {
    const balanceDue = dataRef.current?.invoices.find((i) => i.invoiceNo === invoiceNo)?.balanceDue;
    setSheet({ kind: 'addPayment', invoiceNo, balanceDue });
  }, []);
  const openAddReturn = useCallback(
    async (invoiceNo) => {
      try {
        const invoice = await db.getInvoice(invoiceNo);
        if (!invoice) {
          toast('Error', 'Invoice not found!', 'error');
          return;
        }
        const allInvoices = await db.getAllInvoices();
        const customerInvoices = allInvoices.filter(
          (inv) =>
            inv.customerName &&
            inv.customerName.trim().toLowerCase() === invoice.customerName.trim().toLowerCase(),
        );
        // Combine products from all bills of this customer (unique descriptions with aggregated/total quantities)
        const productMap = new Map();
        for (const inv of customerInvoices) {
          for (const p of inv.products ?? []) {
            if (!p || !p.description) continue;
            const desc = p.description.trim();
            if (!productMap.has(desc)) {
              productMap.set(desc, {
                description: desc,
                qty: Number(toNum(p.qty).toFixed(2)),
                rate: Number(toNum(p.rate).toFixed(2)),
              });
            } else {
              const existing = productMap.get(desc);
              existing.qty = Number((existing.qty + toNum(p.qty)).toFixed(2));
              if (p.rate) existing.rate = Number(toNum(p.rate).toFixed(2));
            }
          }
        }
        const aggregatedProducts = Array.from(productMap.values());

        const returns = await db.getReturnsByInvoice(invoiceNo);
        setSheet({
          kind: 'addReturn',
          invoiceNo,
          partyName: invoice.customerName,
          invoiceDate: invoice.invoiceDate,
          products: aggregatedProducts.length > 0 ? aggregatedProducts : (invoice.products ?? []),
          balanceDue: invoice.balanceDue,
          returns: returns.map(toHistoryReturn),
        });
      } catch (e) {
        console.error('Error opening return dialog:', e);
        toast('Error', 'Error processing return.', 'error');
      }
    },
    [toast],
  );
  const requestDelete = useCallback(
    async (invoiceNo) => {
      if (await hasPaymentOrReturnHistory(invoiceNo)) {
        toast(DELETE_BLOCKED_TITLE, DELETE_BLOCKED_MESSAGE, 'error');
        return;
      }
      setSheet({ kind: 'delete', invoiceNo });
    },
    [toast],
  );
  // ------------------------------------------------------------------ writes
  /** Resolves to an inline error for the Add Payment sheet, or null once saved. */
  const submitPayment = useCallback(
    async (invoiceNo, submission) => {
      try {
        await addSalesPayment(invoiceNo, submission, submission.paymentDate);
        setSheet(NONE);
        toast('Success', paymentSuccessMessage(submission), 'success');
        await reloadAll();
        return null;
      } catch (e) {
        console.error('Error adding payment:', e);
        return isUserError(e) ? e.message : 'Error adding payment.';
      }
    },
    [toast, reloadAll],
  );
  const submitReturn = useCallback(
    async (invoiceNo, submission) => {
      try {
        const result = await saveSalesReturn(invoiceNo, submission);
        if (!result.ok) return result.message;
        setSheet(NONE);
        toast('Success', returnSuccessMessage(result.total), 'success');
        await reloadAll();
        return null;
      } catch (e) {
        console.error('Error saving return:', e);
        return isUserError(e) ? e.message : 'Error processing return.';
      }
    },
    [toast, reloadAll],
  );
  const undoPayment = useCallback(
    async (invoiceNo, paymentId) => {
      const ok = await confirm({
        title: 'Undo Payment',
        message:
          'Are you sure you want to undo this payment? This will add the payment amount back to the balance due.',
        tone: 'danger',
        confirmText: 'Undo Payment',
      });
      if (!ok) return;
      setSheet(NONE);
      try {
        const payment = await overlay.run(
          'Undoing Payment',
          () => undoSalesPayment(invoiceNo, paymentId),
          'Reverting payment and recalculating balance...',
        );
        toast(
          'Success',
          `Payment of ₹${formatCurrency(payment.amount)} has been successfully undone!`,
          'success',
        );
      } catch (e) {
        console.error('Error undoing payment:', e);
        toast(
          'Error',
          isUserError(e) ? e.message : `Error undoing payment: ${e instanceof Error ? e.message : String(e)}`,
          'error',
        );
      }
      await reloadAll();
    },
    [confirm, overlay, toast, reloadAll],
  );
  const undoAllPayments = useCallback(
    async (invoiceNo) => {
      const ok = await confirm({
        title: 'Undo All Payments',
        message:
          'Are you sure you want to undo ALL payments for this invoice? This will set the balance due back to the original invoice amount.',
        tone: 'danger',
        confirmText: 'Undo All',
      });
      if (!ok) return;
      setSheet(NONE);
      try {
        const result = await overlay.run(
          'Undoing All Payments',
          () => undoAllSalesPayments(invoiceNo),
          'Reverting all payments and recalculating balance...',
        );
        if (!result) toast('Notification', 'No payments found for this invoice.', 'info');
        else {
          toast(
            'Success',
            `All ${result.count} payments (total: ₹${formatCurrency(result.total)}) have been successfully undone!`,
            'success',
          );
        }
      } catch (e) {
        console.error('Error undoing all payments:', e);
        toast('Error', 'Error undoing payments. Please try again.', 'error');
      }
      await reloadAll();
    },
    [confirm, overlay, toast, reloadAll],
  );
  const undoReturn = useCallback(
    async (invoiceNo, returnId) => {
      const ok = await confirm({
        title: 'Undo Return',
        message: 'Are you sure you want to undo this return? This action cannot be reversed.',
        tone: 'danger',
        confirmText: 'Undo Return',
      });
      if (!ok) return;
      setSheet(NONE);
      try {
        await overlay.run(
          'Undoing Return',
          () => undoSalesReturn(invoiceNo, returnId),
          'Reverting return and recalculating balance...',
        );
        toast('Success', 'Return has been successfully undone!', 'success');
      } catch (e) {
        console.error('Error undoing return:', e);
        toast('Error', 'Error undoing return. Please try again.', 'error');
      }
      await reloadAll();
    },
    [confirm, overlay, toast, reloadAll],
  );
  const undoAllReturns = useCallback(
    async (invoiceNo) => {
      const ok = await confirm({
        title: 'Undo All Returns',
        message:
          'Are you sure you want to undo ALL returns for this invoice? This action cannot be reversed.',
        tone: 'danger',
        confirmText: 'Undo All',
      });
      if (!ok) return;
      setSheet(NONE);
      try {
        const count = await overlay.run(
          'Undoing All Returns',
          () => undoAllSalesReturns(invoiceNo),
          'Reverting all returns and recalculating balance...',
        );
        if (count === null) toast('Notification', 'No returns found for this invoice.', 'info');
        else toast('Success', `All ${count} returns have been successfully undone!`, 'success');
      } catch (e) {
        console.error('Error undoing all returns:', e);
        toast('Error', 'Error undoing returns. Please try again.', 'error');
      }
      await reloadAll();
    },
    [confirm, overlay, toast, reloadAll],
  );
  const confirmDelete = useCallback(
    async (invoiceNo) => {
      setSheet(NONE);
      try {
        await overlay.run(
          'Deleting Invoice',
          () => deleteSalesInvoice(invoiceNo),
          'Please wait while we securely remove the invoice and all related data...',
        );
        toast('Success', deleteSuccessMessage(invoiceNo), 'success');
      } catch (e) {
        console.error('Error deleting invoice:', e);
        toast('Error', `Error deleting invoice: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
      await reloadAll();
    },
    [overlay, toast, reloadAll],
  );
  // ------------------------------------------------------------------ statements / print / share
  const downloadStatement = useCallback(
    async (invoiceNo) => {
      try {
        await overlay.run('Generating statement', () => downloadInvoiceStatement(invoiceNo));
      } catch (e) {
        console.error('Error generating statement:', e);
        toast('Error', isUserError(e) ? e.message : 'Error generating statement.', 'error');
      }
    },
    [overlay, toast],
  );
  const shareStatement = useCallback(
    async (invoiceNo) => {
      try {
        const result = await overlay.run('Generating statement', () => shareInvoiceStatement(invoiceNo));
        if (result === 'fallback')
          toast('Warning', 'Sharing not supported on this device. Downloading instead.', 'warning');
      } catch (e) {
        console.error('Error sharing invoice statement:', e);
        toast('Error', isUserError(e) ? e.message : 'Error sharing statement. Please try again.', 'error');
      }
    },
    [overlay, toast],
  );
  const edit = useCallback((invoiceNo) => nav.push(`/sales/bill?edit=${encodeURIComponent(invoiceNo)}`), []);
  const openDetail = useCallback((invoiceNo) => setSheet({ kind: 'detail', invoiceNo }), []);
  /** stable for the lifetime of the screen -> memoised cards / rows never re-render because of it */
  const actions = useMemo(
    () => ({
      open: openDetail,
      edit,
      remove: (no) => void requestDelete(no),
      addPayment: openAddPayment,
      addReturn: (no) => void openAddReturn(no),
      downloadStatement: (no) => void downloadStatement(no),
      shareStatement: (no) => void shareStatement(no),
      viewPayments: (no) => void openPayments(no),
      viewReturns: (no) => void openReturns(no),
    }),
    [
      openDetail,
      edit,
      requestDelete,
      openAddPayment,
      openAddReturn,
      downloadStatement,
      shareStatement,
      openPayments,
      openReturns,
    ],
  );
  return {
    loading,
    refreshing,
    error,
    refresh,
    reload,
    draft,
    setDraft,
    search,
    clearFilters,
    selectRecent,
    filterByDay,
    recent,
    stats,
    totalInvoices: data?.invoices.length ?? 0,
    sheet,
    closeSheet,
    detailInvoice,
    actions,
    submitPayment,
    submitReturn,
    undoPayment,
    undoAllPayments,
    undoReturn,
    undoAllReturns,
    confirmDelete,
  };
}
