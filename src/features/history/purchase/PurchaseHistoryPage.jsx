/**
 * Purchase History  (route /purchase/history)  – replaces original-app/purchase-history.html + js/purchase-history.js.
 * Recent bills strip, supplier statement, filters and the date-grouped bill list (table on desktop, cards on phones –
 * every bill shows its supplier, products, amounts, payments, returns and balance inline), with details (bill slip),
 * edit / delete (→ Recycle Bin), payments, returns and statement PDFs / WhatsApp. ?search=<text> pre-fills the search
 * box. The shared UI lives in ../components (same layout as Sales History), the rules in the purchase*.js services.
 */
import { History } from 'lucide-react';
import { useMemo } from 'react';
import { Page } from '@/ui';
import {
  AddPaymentSheet,
  DeleteInvoiceSheet,
  HistoryDateGroupList,
  HistoryFilterBar,
  HistoryInvoiceDetailSheet,
  PartyStatementSection,
  PaymentHistorySheet,
  RecentInvoicesStrip,
  ReturnSheet,
  ReturnStatusSheet,
  ScrollToTopButton,
} from '../components';
import { PURCHASE_LABELS } from './purchaseModel';
import { usePurchaseHistory } from './usePurchaseHistory';
import { usePurchaseStatement } from './usePurchaseStatement';

const shownNo = (invoiceNo) => PURCHASE_LABELS.formatInvoiceNo(invoiceNo);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function PurchaseHistoryPage() {
  const statement = usePurchaseStatement();
  const h = usePurchaseHistory(statement.refresh);
  const { sheet } = h;

  /** Actions offered inside the detail sheet close it first (a stacked dialog would hide toasts / confirmations). */
  const detailActions = useMemo(() => {
    const wrapped = {};
    for (const [name, fn] of Object.entries(h.actions)) {
      if (fn) {
        wrapped[name] = (invoiceNo) => {
          h.closeSheet();
          fn(invoiceNo);
        };
      }
    }
    return wrapped;
  }, [h.actions, h.closeSheet]);

  const { totalDays, overallStats } = h.stats;

  return (
    <Page title="Purchase History" icon={History} max="7xl">
      <div className="space-y-5">
        {h.error ? null : (
          <RecentInvoicesStrip
            invoices={h.recent}
            loading={h.loading}
            labels={PURCHASE_LABELS}
            onSelect={h.selectRecent}
            title="Recent Purchase Bills"
          />
        )}
        <PartyStatementSection
          labels={PURCHASE_LABELS}
          query={statement.query}
          onQueryChange={statement.setQuery}
          state={statement.state}
          busy={statement.busy}
          onGenerate={() => void statement.generate()}
          onChooseParty={(partyKey) => void statement.choose(partyKey)}
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
          labels={PURCHASE_LABELS}
        />
        {!h.loading && !h.error ? (
          <p
            className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-semibold text-slate-600 shadow-sm ring-1 ring-line"
            aria-live="polite"
          >
            <span className="size-1.5 rounded-full bg-gold-500" aria-hidden />
            {`${plural(overallStats.totalInvoices, 'invoice')} on ${plural(totalDays, 'day')}`}
            {overallStats.totalInvoices !== h.totalInvoices ? ` (of ${h.totalInvoices})` : ''}
          </p>
        ) : null}
        <HistoryDateGroupList
          groups={h.stats.dateGroups}
          labels={PURCHASE_LABELS}
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
        labels={PURCHASE_LABELS}
        actions={detailActions}
        onClose={h.closeSheet}
      />

      {sheet.kind === 'addPayment' ? (
        <AddPaymentSheet
          open
          invoiceNo={sheet.invoiceNo}
          title={`Add Payment - Invoice No ${shownNo(sheet.invoiceNo)}`}
          invalidAmountMessage="Please enter a valid payment amount."
          balanceDue={sheet.balanceDue}
          mode="purchase"
          onClose={h.closeSheet}
          onSubmit={(submission) => h.submitPayment(sheet.invoiceNo, submission)}
        />
      ) : null}

      {sheet.kind === 'payments' ? (
        <PaymentHistorySheet
          open
          invoiceNo={sheet.invoiceNo}
          title={`Payment History - Invoice No ${shownNo(sheet.invoiceNo)}`}
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
          invoiceNo={shownNo(sheet.invoiceNo)}
          labels={PURCHASE_LABELS}
          partyName={sheet.partyName}
          invoiceDate={sheet.invoiceDate}
          products={sheet.products}
          balanceDue={sheet.balanceDue}
          returns={sheet.returns}
          partyReturns={sheet.partyReturns}
          onClose={h.closeSheet}
          onSubmit={(submission) => h.submitReturn(sheet.invoiceNo, submission)}
        />
      ) : null}

      {sheet.kind === 'returns' ? (
        <ReturnStatusSheet
          open
          invoiceNo={shownNo(sheet.invoiceNo)}
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
          invoiceNo={shownNo(sheet.invoiceNo)}
          note={null}
          onClose={h.closeSheet}
          onConfirm={() => void h.confirmDelete(sheet.invoiceNo)}
        />
      ) : null}
    </Page>
  );
}
