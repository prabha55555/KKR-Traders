/**
 * Sales History (`/sales/history`, optional `?search=<text>`) – replaces original-app/invoice-history.html +
 * js/invoice-history.js.
 *
 * Recent invoices strip, customer statement (combined / easy PDF, WhatsApp), search + invoice-number + date filters,
 * and the invoices grouped by day (table on desktop, cards on phones/tablets) with view / edit / print / WhatsApp /
 * add payment / payment history (undo) / returns (add, status, undo) / delete (type the number, moves to the bin).
 * All business rules live in useSalesHistory / useSalesStatement; the UI parts are in ../components (shared with
 * Purchase History).
 */
import { History } from 'lucide-react';
import { useMemo } from 'react';
import { Page, RefreshButton } from '@/ui';
import { AddPaymentSheet } from '../components/AddPaymentSheet';
import { DeleteInvoiceSheet } from '../components/DeleteInvoiceSheet';
import { HistoryDateGroupList } from '../components/HistoryDateGroupList';
import { HistoryFilterBar } from '../components/HistoryFilterBar';
import { HistoryInvoiceDetailSheet } from '../components/HistoryInvoiceDetailSheet';
import { PartyStatementSection } from '../components/PartyStatementSection';
import { PaymentHistorySheet } from '../components/PaymentHistorySheet';
import { RecentInvoicesStrip } from '../components/RecentInvoicesStrip';
import { ReturnSheet } from '../components/ReturnSheet';
import { ReturnStatusSheet } from '../components/ReturnStatusSheet';
import { ScrollToTopButton } from '../components/ScrollToTopButton';
import { SALES_LABELS } from '../lib/types';
import { useSalesHistory } from './useSalesHistory';
import { useSalesStatement } from './useSalesStatement';

export default function SalesHistoryPage() {
  const statement = useSalesStatement();
  const h = useSalesHistory(statement.refresh);
  const { sheet } = h;

  /** Actions offered inside the detail sheet close it first (a stacked dialog would hide toasts / confirms). */
  const detailActions = useMemo(() => {
    const wrapped = {};
    for (const [name, fn] of Object.entries(h.actions)) {
      wrapped[name] = (invoiceNo) => {
        h.closeSheet();
        fn(invoiceNo);
      };
    }
    return wrapped;
  }, [h.actions, h.closeSheet]);

  const { totalDays, overallStats } = h.stats;

  return (
    <Page
      title="Sales History"
      icon={History}
      max="7xl"
      actions={<RefreshButton loading={h.refreshing} onClick={() => void h.refresh()} />}
    >
      <div className="space-y-5">
        {h.error ? null : (
          <RecentInvoicesStrip
            invoices={h.recent}
            loading={h.loading}
            labels={SALES_LABELS}
            onSelect={h.selectRecent}
          />
        )}
        <PartyStatementSection
          labels={SALES_LABELS}
          query={statement.query}
          onQueryChange={statement.setQuery}
          state={statement.state}
          busy={statement.busy}
          onGenerate={() => void statement.generate()}
          onClear={statement.clear}
          onDownloadPdf={() => void statement.downloadPdf()}
          onDownloadEasyPdf={() => void statement.downloadEasyPdf()}
          onShareWhatsApp={() => void statement.shareWhatsApp()}
        />
        <HistoryFilterBar
          value={h.draft}
          onChange={h.setDraft}
          onSearch={h.search}
          onClear={h.clearFilters}
          labels={SALES_LABELS}
        />
        {!h.loading && !h.error ? (
          <p
            className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-slate-600 shadow-sm ring-1 ring-line"
            aria-live="polite"
          >
            <span className="size-1.5 rounded-full bg-gold-500" aria-hidden />
            {`${overallStats.totalInvoices} invoice${overallStats.totalInvoices === 1 ? '' : 's'} on ${totalDays} day${totalDays === 1 ? '' : 's'}`}
            {overallStats.totalInvoices !== h.totalInvoices ? ` (of ${h.totalInvoices})` : ''}
          </p>
        ) : null}

        <HistoryDateGroupList
          groups={h.stats.dateGroups}
          labels={SALES_LABELS}
          actions={h.actions}
          loading={h.loading}
          error={h.error}
          onRetry={() => void h.reload()}
          onFilterDate={h.filterByDay}
        />
      </div>

      <ScrollToTopButton />

      <HistoryInvoiceDetailSheet
        invoice={h.detailInvoice}
        labels={SALES_LABELS}
        actions={detailActions}
        onClose={h.closeSheet}
      />

      {sheet.kind === 'addPayment' ? (
        <AddPaymentSheet
          open
          invoiceNo={sheet.invoiceNo}
          balanceDue={sheet.balanceDue}
          mode="sales"
          onClose={h.closeSheet}
          onSubmit={(submission) => h.submitPayment(sheet.invoiceNo, submission)}
        />
      ) : null}

      {sheet.kind === 'payments' ? (
        <PaymentHistorySheet
          open
          invoiceNo={sheet.invoiceNo}
          partyName={sheet.partyName}
          balanceDue={sheet.balanceDue}
          payments={sheet.payments}
          onClose={h.closeSheet}
          onUndo={(paymentId) => void h.undoPayment(sheet.invoiceNo, paymentId)}
          onUndoAll={() => void h.undoAllPayments(sheet.invoiceNo)}
          onAddPayment={sheet.canAddPayment ? () => h.actions.addPayment(sheet.invoiceNo) : undefined}
        />
      ) : null}

      {sheet.kind === 'addReturn' ? (
        <ReturnSheet
          open
          invoiceNo={sheet.invoiceNo}
          labels={SALES_LABELS}
          partyName={sheet.partyName}
          invoiceDate={sheet.invoiceDate}
          products={sheet.products}
          balanceDue={sheet.balanceDue}
          returns={sheet.returns}
          onClose={h.closeSheet}
          onSubmit={(submission) => h.submitReturn(sheet.invoiceNo, submission)}
        />
      ) : null}

      {sheet.kind === 'returns' ? (
        <ReturnStatusSheet
          open
          invoiceNo={sheet.invoiceNo}
          partyName={sheet.partyName}
          returns={sheet.returns}
          onClose={h.closeSheet}
          onUndo={(returnId) => void h.undoReturn(sheet.invoiceNo, returnId)}
          onUndoAll={() => void h.undoAllReturns(sheet.invoiceNo)}
          onAddReturn={() => h.actions.addReturn(sheet.invoiceNo)}
        />
      ) : null}

      {sheet.kind === 'delete' ? (
        <DeleteInvoiceSheet
          open
          invoiceNo={sheet.invoiceNo}
          onClose={h.closeSheet}
          onConfirm={() => void h.confirmDelete(sheet.invoiceNo)}
        />
      ) : null}
    </Page>
  );
}
