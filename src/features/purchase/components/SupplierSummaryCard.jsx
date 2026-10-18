import { MapPin } from 'lucide-react';
import { InitialAvatar } from '@/features/customerForm/InitialAvatar';
import { Card, KeyValue, TotalInvoicesClickable } from '@/ui';
import { formatRupees } from '@/core/format';
import { RevealablePhone } from './RevealablePhone';

/**
 * One supplier of the Supplier Details list on phones / tablets (a row of the desktop table). Balance Due is the
 * supplier's ledger balance; below zero it is an advance / credit with the supplier.
 */
export function SupplierSummaryCard({ supplier }) {
  const owing = supplier.balanceDue > 0;
  return (
    <Card className="h-full p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-4">
      <div className="flex items-center gap-3">
        <InitialAvatar name={supplier.name} size="lg" />
        <h3 className="min-w-0 flex-1 text-[17px] leading-snug font-bold break-words text-brand-800">
          {supplier.name}
        </h3>
      </div>
      <div className="mt-3 space-y-0.5 rounded-xl bg-slate-50/70 px-3 py-2">
        <RevealablePhone phone={supplier.phone} />
        <div className="flex items-start gap-2 py-1 text-sm text-slate-500">
          <MapPin className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden />
          <span className="min-w-0 break-words">{supplier.address || '—'}</span>
        </div>
      </div>
      <div className="mt-3 px-0.5">
        <KeyValue
          label="Total Bills"
          value={
            <TotalInvoicesClickable
              count={String(supplier.totalBills)}
              invoiceNumbers={supplier.allInvoiceNumbers}
              entityName={supplier.name}
              module="purchase"
            />
          }
        />
        <KeyValue label="Opening Balance" value={formatRupees(supplier.openingBalance)} />
        <KeyValue label="Total Amount" value={formatRupees(supplier.totalAmount)} />
        <KeyValue label="Amount Paid" value={formatRupees(supplier.totalPaid)} />
        <KeyValue label="Discount" value={formatRupees(supplier.totalDiscount)} />
        <KeyValue label="Returns" value={formatRupees(supplier.totalReturns)} />
      </div>
      <div
        className={
          owing
            ? 'mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-red-50/80 px-3.5 py-2.5 ring-1 ring-red-200 ring-inset'
            : 'mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-emerald-50/80 px-3.5 py-2.5 ring-1 ring-emerald-200 ring-inset'
        }
      >
        <span className="text-sm font-semibold text-slate-700">Balance Due</span>
        <span
          className={
            owing
              ? 'font-display text-lg font-extrabold text-red-600 tabular-nums'
              : 'font-display text-lg font-extrabold text-emerald-600 tabular-nums'
          }
        >
          {formatRupees(supplier.balanceDue)}
        </span>
      </div>
    </Card>
  );
}
