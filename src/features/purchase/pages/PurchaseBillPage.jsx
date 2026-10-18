/**
 * Purchase Bill screen — replaces original-app/purchase.html + js/purchase.js.
 * Enter a supplier bill (supplier by phone, shortcut-only products, previous balance, payments), save it, or share
 * the acknowledgement. Layout (TwoPane / sticky action bar) is shared with Edit Purchase via PurchaseBillLayout.
 * Logic lives in usePurchaseBillForm.
 */
import { Box, Building2, Receipt, RotateCcw } from 'lucide-react';
import { InvoiceHeaderFields, PartyPicker, ProductRowsEditor } from '@/components/bill';
import { Button, Card, ErrorState, LoadingState, Page, SectionHeader } from '@/ui';
import { PurchaseBillLayout } from '../components/PurchaseBillLayout';
import { PurchaseTotalsCard } from '../components/PurchaseTotalsCard';
import { SupplierNotFoundHint } from '../components/SupplierNotFoundHint';
import { usePurchaseBillForm } from '../hooks/usePurchaseBillForm';

export default function PurchaseBillPage() {
  const bill = usePurchaseBillForm();
  const { form, patch, totals } = bill;

  if (bill.initialLoading && !bill.error) {
    return (
      <Page title="Purchase Bill" icon={Receipt}>
        <LoadingState label="Loading suppliers..." />
      </Page>
    );
  }

  const main = (
    <>
      {bill.error ? (
        <ErrorState
          message={`Could not load suppliers or bills. ${bill.error}`}
          onRetry={bill.refresh}
          className="rounded-2xl border border-red-200 bg-red-50/40 py-6"
        />
      ) : null}
      <Card className="relative animate-rise overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-gradient" aria-hidden />
        <SectionHeader
          title="Invoice"
          icon={Receipt}
          right={
            <Button variant="ghost" size="sm" icon={RotateCcw} onClick={bill.reset}>
              Clear
            </Button>
          }
        />
        <InvoiceHeaderFields
          lastLabel="Last Purchase"
          last={bill.suggestion.lastInvoiceNo}
          suggested={bill.suggestion.nextInvoiceNo}
          onApplySuggestion={bill.applySuggestion}
          invoiceNo={form.invoiceNo}
          onInvoiceNoChange={(invoiceNo) => patch({ invoiceNo })}
          date={form.invoiceDate}
          onDateChange={(invoiceDate) => patch({ invoiceDate })}
        />
      </Card>
      <Card>
        <SectionHeader title="Supplier" icon={Building2} />
        <PartyPicker
          partyLabel="Supplier"
          parties={bill.suppliers}
          phone={form.supplierPhone}
          name={form.supplierName}
          address={form.supplierAddress}
          onPhoneChange={bill.onPhoneChange}
          onSelect={bill.onSelectSupplier}
          notFound={bill.supplierMissing ? <SupplierNotFoundHint phone={form.supplierPhone} /> : null}
        />
      </Card>
      <Card>
        <SectionHeader title="Products" icon={Box} />
        <ProductRowsEditor rows={form.rows} onChange={(rows) => patch({ rows })} shortcuts={bill.shortcuts} />
      </Card>
    </>
  );

  return (
    <PurchaseBillLayout
      title="Purchase Bill"
      saveLabel="Save Purchase Bill"
      saving={bill.saving}
      onSave={bill.save}
      onShare={bill.share}
      onRefresh={bill.refresh}
      refreshing={bill.refreshing}
      main={main}
      summary={<PurchaseTotalsCard form={form} totals={totals} onChange={patch} />}
    />
  );
}
