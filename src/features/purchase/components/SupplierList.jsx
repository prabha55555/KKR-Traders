import { useBreakpoint } from '@/hooks/useBreakpoint';
import { InitialAvatar } from '@/features/customerForm/InitialAvatar';
import { Badge, DataTable, TotalInvoicesClickable } from '@/ui';
import { formatRupees } from '@/core/format';
import { RevealablePhone } from './RevealablePhone';
import { SupplierSummaryCard } from './SupplierSummaryCard';

const num = (key, header, value) => ({ key, header, align: 'right', className: 'tabular-nums', value });

/** The columns of the original supplier table (supplier-details.html). */
export const SUPPLIER_COLUMNS = [
  {
    key: 'name',
    header: 'Supplier Name',
    mobile: 'title',
    render: (s) => (
      <div className="flex items-center gap-3">
        <InitialAvatar name={s.name} size="sm" />
        <span className="min-w-0 font-semibold text-brand-800">{s.name}</span>
      </div>
    ),
  },
  { key: 'phone', header: 'Phone', render: (s) => <RevealablePhone phone={s.phone} /> },
  { key: 'address', header: 'Address', className: 'max-w-xs text-slate-600', value: (s) => s.address || '—' },
  num('openingBalance', 'Opening Balance', (s) => formatRupees(s.openingBalance)),
  {
    key: 'bills',
    header: 'Bills',
    align: 'right',
    className: 'tabular-nums',
    render: (s) => (
      <TotalInvoicesClickable
        count={s.totalBills}
        invoiceNumbers={s.allInvoiceNumbers}
        entityName={s.name}
        module="purchase"
      />
    ),
  },
  num('amount', 'Total Amount', (s) => formatRupees(s.totalAmount)),
  num('paid', 'Amount Paid', (s) => formatRupees(s.totalPaid)),
  num('discount', 'Discount', (s) => formatRupees(s.totalDiscount)),
  num('returns', 'Returns', (s) => formatRupees(s.totalReturns)),
  {
    key: 'balance',
    header: 'Balance Due',
    align: 'right',
    className: 'tabular-nums',
    render: (s) => (
      <Badge tone={s.balanceDue > 0 ? 'danger' : 'success'} className="tabular-nums">
        {formatRupees(s.balanceDue)}
      </Badge>
    ),
  },
];

/** Dense table on desktop windows (>= 1024px), a card grid (1 column on phones, 2 on tablets) otherwise. */
export function SupplierList({ suppliers, empty }) {
  const { isExpanded } = useBreakpoint();
  if (suppliers.length === 0)
    return <div className="rounded-2xl border border-line bg-white shadow-card">{empty}</div>;
  if (isExpanded) {
    return <DataTable columns={SUPPLIER_COLUMNS} rows={suppliers} rowKey={(s) => s.key} dense />;
  }
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      {suppliers.map((s, i) => (
        <div key={s.key} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <SupplierSummaryCard supplier={s} />
        </div>
      ))}
    </div>
  );
}
