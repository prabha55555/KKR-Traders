/**
 * Sales Bill screen — replaces original-app/sales.html + js/script.js (+ print / WhatsApp share from js/pdf.js).
 * Create a bill, or edit one when opened as /sales/bill?edit=<invoiceNo>.
 * Desktop: form on the left, calculation + payments + actions on the right (TwoPane).
 * Phones: stacked cards (product rows become cards) with a sticky action bar above the tab bar.
 * Logic lives in useSalesBill (session, lookup, save / generate / share / reset).
 */
import { Box, Camera, Receipt, ReceiptText, User, Wallet, Zap } from 'lucide-react';
import { useEffect } from 'react';
import { InvoiceHeaderFields, ProductRowsEditor } from '@/components/bill';
import { formatCurrency, formatInvoiceNo } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Badge, Button, Card, ErrorState, LoadingState, Modal, Page, SectionHeader, TwoPane } from '@/ui';
import { BillActionBar } from './BillActionBar';
import { EditBanner, SaveBadge } from './BillStatusBar';
import { CalculationSection } from './CalculationSection';
import { CustomerSection } from './CustomerSection';
import { ManualBillAttachment } from './ManualBillAttachment';
import { useCustomerSummary } from './useCustomerSummary';
import { useSalesBill } from './useSalesBill';

export default function SalesBillPage() {
  const bill = useSalesBill();
  const { isExpanded } = useBreakpoint();
  const { form, session } = bill;
  const summary = useCustomerSummary({
    customerName: form.customerName,
    customerPhone: form.customerPhone,
    invoiceNo: form.invoiceNo.trim(),
    invoiceDate: form.invoiceDate,
    refreshKey: session.persistedNo,
  });

  // Ctrl/Cmd + S saves (desktop keyboards); the browser's own "save page" is suppressed on this screen.
  const { save } = bill;
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  if (!bill.ready) {
    return (
      <Page title="Sales Bill" icon={ReceiptText}>
        {bill.initialLoading || bill.refreshing ? (
          <LoadingState label="Loading billing system..." />
        ) : (
          <ErrorState
            message={bill.loadError ?? 'There was an error initializing the application. Please try again.'}
            onRetry={bill.refresh}
          />
        )}
      </Page>
    );
  }

  const editing = session.editingNo !== null;
  const actions = (layout) => (
    <BillActionBar
      layout={layout}
      saveLabel={bill.saveLabel}
      saved={session.saved}
      onSave={bill.save}
      onGenerate={bill.generate}
      onShare={bill.share}
      onReset={() => bill.reset(!session.saved)}
    />
  );

  const main = (
    <>
      <EditBanner
        saved={session.saved}
        editingNo={session.editingNo}
        onNewBill={() => bill.reset(!session.saved)}
      />
      <Card className="relative animate-rise overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-gradient" aria-hidden />
        <SectionHeader
          title="Invoice"
          icon={Receipt}
          right={
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {form.invoiceNo.trim() ? (
                <span className="max-w-full truncate rounded-lg bg-brand-800 px-2.5 py-1 font-display text-xs font-bold tracking-wide text-gold-300 tabular-nums">
                  {formatInvoiceNo(form.invoiceNo)}
                </span>
              ) : null}
              {editing ? null : <SaveBadge saved={session.saved} />}
            </div>
          }
        />
        <InvoiceHeaderFields
          last={bill.suggestion?.lastInvoiceNo ?? '-'}
          suggested={bill.suggestion?.nextInvoiceNo ?? '-'}
          cycleRestarted={bill.suggestion?.cycleRestarted}
          onApplySuggestion={bill.applySuggestion}
          invoiceNo={form.invoiceNo}
          onInvoiceNoChange={(invoiceNo) => bill.patch({ invoiceNo })}
          invoiceNoReadOnly={editing}
          date={form.invoiceDate}
          onDateChange={(invoiceDate) => bill.patch({ invoiceDate })}
        />
      </Card>
      <Card>
        <SectionHeader title="Bill to Party" icon={User} />
        <CustomerSection
          customers={bill.customers}
          phone={form.customerPhone}
          name={form.customerName}
          address={form.customerAddress}
          notFoundPhone={bill.lookup.notFoundPhone}
          onPhoneChange={bill.lookup.onPhoneChange}
          onSelect={bill.lookup.onSelect}
          summary={summary}
        />
      </Card>
      <Card>
        <SectionHeader title="Products" icon={Box} />
        <ProductRowsEditor
          rows={form.rows}
          shortcuts={bill.shortcuts}
          onChange={(rows) => bill.patch({ rows })}
          showAvgCost
        />
      </Card>
      <Card>
        <SectionHeader
          title="Manual Bill Attachment"
          icon={Camera}
          right={form.manualBillImage ? <Badge tone="success">Slip Attached</Badge> : null}
        />
        <ManualBillAttachment
          value={form.manualBillImage}
          onChange={(manualBillImage) => bill.patch({ manualBillImage })}
        />
      </Card>
    </>
  );

  const side = (
    <>
      <CalculationSection form={form} totals={bill.totals} onChange={bill.patch} />
      {isExpanded ? (
        <Card>
          <SectionHeader title="Actions" icon={Zap} />
          {actions('panel')}
        </Card>
      ) : null}
    </>
  );

  return (
    <Page title="Sales Bill" icon={ReceiptText} max="7xl">
      <TwoPane main={main} side={side} />
      {isExpanded ? null : (
        <div className="no-print sticky bottom-[calc(3.7rem+env(safe-area-inset-bottom))] z-20 mt-4 rounded-2xl border border-line bg-white p-2 shadow-pop ring-1 ring-brand-900/5">
          {actions('bar')}
        </div>
      )}

      {/* Popup: Customer Opening Balance Notice */}
      <Modal
        open={Boolean(bill.openingBalancePopup)}
        onClose={bill.closeOpeningBalancePopup}
        title="Customer Opening Balance"
        size="sm"
        footer={
          <Button variant="purple" onClick={bill.closeOpeningBalancePopup} className="w-full sm:w-auto">
            Acknowledge & Continue
          </Button>
        }
      >
        <div className="flex flex-col items-center p-2 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-xs ring-8 ring-amber-50/50">
            <Wallet className="size-7" aria-hidden />
          </div>
          <h3 className="max-w-full font-display text-lg font-bold break-words text-brand-900">
            {bill.openingBalancePopup?.customerName || 'Customer'}
          </h3>
          {bill.openingBalancePopup?.customerPhone ? (
            <p className="text-xs text-slate-500 tabular-nums">
              Phone: {bill.openingBalancePopup.customerPhone}
            </p>
          ) : null}
          <div className="mt-4 w-full rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <span className="text-xs font-semibold tracking-wider text-amber-700 uppercase">
              Opening Balance Amount
            </span>
            <div className="mt-1 font-display text-3xl font-extrabold [overflow-wrap:anywhere] text-amber-900 tabular-nums">
              ₹{formatCurrency(bill.openingBalancePopup?.openingBalance || 0)}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            This customer has an existing opening balance on record. It will be accounted for in their billing
            statements.
          </p>
        </div>
      </Modal>
    </Page>
  );
}
