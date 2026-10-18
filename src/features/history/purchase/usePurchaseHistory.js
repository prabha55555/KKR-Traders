import { useAppNavigate, useRouteParams } from '@/hooks/useRouteParams';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFeedback } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { purchaseBalanceDue } from '@/core/billing';
import { db } from '@/core/db';
import { filterInvoices, recentInvoices } from '../lib/filters';
import { filterByDate, getDateWiseStatistics } from '../lib/grouping';
import { partyReturnProducts, returnSuccessMessage } from '../lib/returns';
import { PURCHASE_LEDGER, balanceReturnsTotal } from '@/core/ledger';
import { EMPTY_FILTERS, isUserError } from '../lib/types';
import { toHistoryReturn } from '../sales/salesModel';
import {
  DELETE_BLOCKED_MESSAGE,
  DELETE_BLOCKED_TITLE,
  deletePurchaseBill,
  hasPurchasePaymentOrReturnHistory,
  purchaseDeleteSuccessMessage,
} from './purchaseDelete';
import { buildPurchaseHistoryData, PURCHASE_LABELS } from './purchaseModel';
import {
  addPurchasePayment,
  loadPurchasePaymentHistory,
  purchasePaymentSuccessMessage,
  PURCHASE_BILL_NOT_FOUND,
  undoAllPurchasePayments,
  undoPurchasePayment,
} from './purchasePayments';
import { savePurchaseReturnDraft, undoAllPurchaseReturns, undoPurchaseReturn } from './purchaseReturns';
import { downloadPurchaseStatement, sharePurchaseStatement } from './purchaseStatements';
const NONE = { kind: 'none' };
/**
 * Controller of the Purchase History screen: loads bills + returns + payments once, applies the filters, owns the
 * open panel, and runs every bill action (payments, returns, delete, statements) through the purchase services.
 * All messages are the web page's (the live versions of its functions).
 */
export function usePurchaseHistory(onDataChanged) {
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
    // One read per collection per load; everything per bill is looked up from these.
    const [bills, returns, payments] = await Promise.all([
      db.getAllPurchaseBills(),
      db.getAllPurchaseReturns(),
      db.getAllPurchasePayments(),
    ]);
    setData(buildPurchaseHistoryData(bills, returns, payments));
  }, []);
  const { loading, error, reload } = useFocusLoad(load);
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
  // ?search=<text> or ?view=<invoiceNo> (the web page filled its search box from the same URL parameter)
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
        const { bill, payments } = await loadPurchasePaymentHistory(invoiceNo);
        if (payments.length === 0) {
          toast('Notification', 'No payment records found for this purchase bill.', 'info');
          return;
        }
        const canAddPayment =
          dataRef.current?.invoices.find((i) => i.invoiceNo === invoiceNo)?.canAddPayment ?? false;
        setSheet({
          kind: 'payments',
          invoiceNo,
          partyName: `${PURCHASE_LABELS.party}: ${bill.supplierName}`,
          // what is still owed on the bill (returns settled on the balance deducted, refunds not)
          balanceDue:
            dataRef.current?.invoices.find((i) => i.invoiceNo === invoiceNo)?.adjustedBalanceDue ??
            purchaseBalanceDue(bill),
          payments,
          canAddPayment,
        });
      } catch (e) {
        console.error('Error viewing payment history:', e);
        toast('Error', isUserError(e) ? e.message : 'Error loading payment history.', 'error');
      }
    },
    [toast],
  );
  const openReturns = useCallback(
    async (invoiceNo) => {
      try {
        const [returns, bill] = await Promise.all([
          db.getPurchaseReturnsByInvoice(invoiceNo),
          db.getPurchaseBill(invoiceNo),
        ]);
        if (!bill) {
          toast('Error', PURCHASE_BILL_NOT_FOUND, 'error');
          return;
        }
        if (returns.length === 0) {
          toast('Notification', 'No return records found for this invoice.', 'info');
          return;
        }
        setSheet({
          kind: 'returns',
          invoiceNo,
          partyName: bill.supplierName,
          bankAccountId: bill.bankAccountId || bill.payment?.bankAccountId,
          returns: returns.map((r) => toHistoryReturn(r)),
        });
      } catch (e) {
        console.error('Error viewing return status:', e);
        toast('Error', 'Error loading return status.', 'error');
      }
    },
    [toast],
  );
  const openAddPayment = useCallback((invoiceNo) => {
    const view = dataRef.current?.invoices.find((i) => i.invoiceNo === invoiceNo);
    setSheet({ kind: 'addPayment', invoiceNo, balanceDue: view?.adjustedBalanceDue ?? view?.balanceDue });
  }, []);
  const openAddReturn = useCallback(
    async (invoiceNo) => {
      try {
        const bill = await db.getPurchaseBill(invoiceNo);
        if (!bill) {
          toast('Error', 'Invoice not found!', 'error');
          return;
        }
        const [allBills, allReturns] = await Promise.all([
          db.getAllPurchaseBills(),
          db.getAllPurchaseReturns(),
        ]);
        // the products of all the supplier's bills — the same list savePurchaseReturnDraft validates against
        const { products, invoiceNos } = partyReturnProducts(PURCHASE_LEDGER, allBills, bill);
        const returns = allReturns.filter((r) => String(r.invoiceNo) === String(invoiceNo));
        setSheet({
          kind: 'addReturn',
          invoiceNo,
          partyName: bill.supplierName,
          invoiceDate: bill.invoiceDate,
          products,
          balanceDue: purchaseBalanceDue(bill) - balanceReturnsTotal(returns),
          returns: returns.map((r) => toHistoryReturn(r)),
          partyReturns: allReturns
            .filter((r) => invoiceNos.has(String(r.invoiceNo)))
            .map((r) => toHistoryReturn(r)),
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
      if (await hasPurchasePaymentOrReturnHistory(invoiceNo)) {
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
        await addPurchasePayment(invoiceNo, submission, submission.paymentDate);
        setSheet(NONE);
        toast('Success', purchasePaymentSuccessMessage(submission), 'success');
        await reloadAll();
        return null;
      } catch (e) {
        console.error('Error adding purchase payment:', e);
        return isUserError(e) ? e.message : 'Error adding payment.';
      }
    },
    [toast, reloadAll],
  );
  const submitReturn = useCallback(
    async (invoiceNo, submission) => {
      try {
        const result = await savePurchaseReturnDraft(invoiceNo, submission);
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
        await overlay.run(
          'Undoing Payment',
          () => undoPurchasePayment(invoiceNo, paymentId),
          'Reverting payment...',
        );
        toast('Success', 'Payment has been successfully undone!', 'success');
      } catch (e) {
        console.error('Error undoing payment:', e);
        toast('Error', isUserError(e) ? e.message : 'Error undoing payment.', 'error');
      }
      await reloadAll();
    },
    [confirm, overlay, toast, reloadAll],
  );
  const undoAllPayments = useCallback(
    async (invoiceNo) => {
      const ok = await confirm({
        title: 'Undo All Payments',
        message: 'Are you sure you want to undo ALL payments for this purchase bill?',
        tone: 'danger',
        confirmText: 'Undo All',
      });
      if (!ok) return;
      setSheet(NONE);
      try {
        const result = await overlay.run(
          'Undoing All Payments',
          () => undoAllPurchasePayments(invoiceNo),
          'Reverting all payments...',
        );
        if (!result) toast('Notification', 'No payments found for this bill.', 'info');
        else toast('Success', 'All payments have been successfully undone!', 'success');
      } catch (e) {
        console.error('Error undoing all payments:', e);
        toast('Error', 'Error undoing payments.', 'error');
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
          () => undoPurchaseReturn(invoiceNo, returnId),
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
          () => undoAllPurchaseReturns(invoiceNo),
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
          () => deletePurchaseBill(invoiceNo),
          'Please wait while we securely remove the invoice and all related data...',
        );
        toast('Success', purchaseDeleteSuccessMessage(invoiceNo), 'success');
      } catch (e) {
        console.error('Error deleting invoice:', e);
        toast('Error', `Error deleting invoice: ${e instanceof Error ? e.message : String(e)}`, 'error');
      }
      await reloadAll();
    },
    [overlay, toast, reloadAll],
  );
  // ------------------------------------------------------------------ statements
  const downloadStatement = useCallback(
    async (invoiceNo) => {
      try {
        await overlay.run('Generating statement', () => downloadPurchaseStatement(invoiceNo));
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
        const result = await overlay.run('Generating statement', () => sharePurchaseStatement(invoiceNo));
        if (result === 'fallback')
          toast('Warning', 'Sharing not supported on this device. Downloading instead.', 'warning');
      } catch (e) {
        console.error('Error sharing purchase statement:', e);
        toast('Error', isUserError(e) ? e.message : 'Error sharing statement. Please try again.', 'error');
      }
    },
    [overlay, toast],
  );
  const edit = useCallback((invoiceNo) => nav.push(`/purchase/edit/${encodeURIComponent(invoiceNo)}`), []);
  const openDetail = useCallback((invoiceNo) => setSheet({ kind: 'detail', invoiceNo }), []);
  /**
   * stable for the lifetime of the screen -> memoised cards / rows never re-render because of it.
   * No printInvoice / shareInvoicePdf / whatsAppMessage: the purchase page has no such buttons (its invoice-PDF helper
   * was never wired), so "Share Statement" (the statement PDF) is also the table's WhatsApp icon.
   */
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
    error,
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
