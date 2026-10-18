/**
 * Edit Purchase Bill screen — replaces original-app/edit-purchase.html + js/edit-purchase.js. Route /purchase/edit/:invoiceNo,
 * reached from Purchase History. Loads the bill, lets everything but the invoice number be edited (supplier phone,
 * name and address are plain inputs here), then updates it and goes back. Logic lives in usePurchaseEditForm.
 */
import { Box, Building2, FileX, Receipt } from 'lucide-react';
import { InvoiceHeaderFields, ProductRowsEditor } from '@/components/bill';
import { useAppNavigate, useRouteParams } from '@/hooks/useRouteParams';
import { Button, Card, EmptyState, ErrorState, LoadingState, Page, SectionHeader } from '@/ui';
import { PurchaseBillLayout } from '../components/PurchaseBillLayout';
import { PurchaseSupplierFields } from '../components/PurchaseSupplierFields';
import { PurchaseTotalsCard } from '../components/PurchaseTotalsCard';
import { usePurchaseEditForm } from '../hooks/usePurchaseEditForm';

const noop = () => undefined;

export default function PurchaseEditPage() {
  const { params } = useRouteParams();
  const invoiceNo = String(params.invoiceNo ?? '');
  const edit = usePurchaseEditForm(invoiceNo);
  const nav = useAppNavigate();
  const { form, totals } = edit;
  const goBack = () => (nav.canGoBack() ? nav.back() : nav.replace('/purchase/history'));
  const title = 'Edit Purchase Bill';

  if (edit.status === 'loading') {
    return (
      <Page title={title} icon={Receipt}>
        <LoadingState label="Loading purchase bill..." />
      </Page>
    );
  }
  if (edit.status === 'error') {
    return (
      <Page title={title} icon={Receipt}>
        <ErrorState message="Failed to load invoice data." onRetry={edit.reload} />
      </Page>
    );
  }
  if (edit.status === 'notFound' || !form || !totals) {
    return (
      <Page title={title} icon={Receipt}>
        <EmptyState
          icon={FileX}
          title="Purchase bill not found"
          message={invoiceNo ? `There is no purchase bill numbered ${invoiceNo}.` : undefined}
          action={
            <Button variant="outline" onClick={goBack}>
              Go Back
            </Button>
          }
        />
      </Page>
    );
  }

  const main = (
    <>
      <Card className="relative animate-rise overflow-hidden">
        <span className="absolute inset-x-0 top-0 h-[3px] bg-gold-gradient" aria-hidden />
        <SectionHeader title="Invoice" icon={Receipt} />
        <InvoiceHeaderFields
          last=""
          suggested=""
          onApplySuggestion={noop}
          invoiceNo={form.invoiceNo}
          onInvoiceNoChange={noop}
          invoiceNoReadOnly
          date={form.invoiceDate}
          onDateChange={(invoiceDate) => edit.patch({ invoiceDate })}
        />
      </Card>
      <Card>
        <SectionHeader title="Supplier" icon={Building2} />
        <PurchaseSupplierFields
          phone={form.supplierPhone}
          name={form.supplierName}
          address={form.supplierAddress}
          onPhoneChange={edit.onPhoneChange}
          onNameChange={(supplierName) => edit.patch({ supplierName })}
          onAddressChange={(supplierAddress) => edit.patch({ supplierAddress })}
        />
      </Card>
      <Card>
        <SectionHeader title="Products" icon={Box} />
        <ProductRowsEditor
          rows={form.rows}
          onChange={(rows) => edit.patch({ rows })}
          shortcuts={edit.shortcuts}
        />
      </Card>
    </>
  );

  return (
    <PurchaseBillLayout
      title={form.invoiceNo ? `${title} #${form.invoiceNo}` : title}
      saveLabel="Update Purchase Bill"
      saving={edit.saving}
      onSave={edit.save}
      onShare={edit.share}
      main={main}
      summary={
        <PurchaseTotalsCard
          form={form}
          totals={totals}
          onChange={edit.patch}
          additionalPaid={form.additionalPaymentsTotal}
        />
      }
    />
  );
}
