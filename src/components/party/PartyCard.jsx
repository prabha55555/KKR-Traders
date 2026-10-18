import { Card, KeyValue, TotalInvoicesClickable, cn } from '@/ui';
import { balanceStatusTone } from './display';
import { amountClass, PARTY_AMOUNT_COLUMNS, PartyAddress, PartyName, PartyPhone } from './PartyCells';

const BALANCE_WELL = {
  danger: 'bg-red-50/80 ring-red-200',
  success: 'bg-emerald-50/80 ring-emerald-200',
  neutral: 'bg-slate-50 ring-slate-200',
};
const BALANCE_TEXT = {
  danger: 'text-red-600',
  success: 'text-emerald-600',
  neutral: 'text-brand-800',
};

/**
 * One row of the party table as a card (phones / tablets), identical for customers and suppliers: name, contact well,
 * invoice count + the five money figures, the Balance Due well, and the page's row actions (if any) at the bottom.
 */
export function PartyCard({ row, kind, renderActions }) {
  const tone = balanceStatusTone(row.balanceValue);
  return (
    <Card className="flex h-full flex-col transition duration-200 hover:-translate-y-0.5 hover:shadow-lift">
      <PartyName name={row.name} hasReturns={row.hasReturns} kind={kind} size="card" />
      <div className="mt-3 space-y-0.5 rounded-xl bg-slate-50/70 px-3 py-2">
        <PartyPhone phone={row.phone} showIcon />
        <PartyAddress address={row.address} showIcon />
      </div>
      <div className="mt-3 px-0.5">
        <KeyValue
          label="Total Invoices"
          value={
            <TotalInvoicesClickable
              count={row.invoiceCount}
              invoiceNumbers={row.invoiceNumbers}
              entityName={row.name}
              module={kind.module}
            />
          }
        />
        {PARTY_AMOUNT_COLUMNS.map(([key, label]) => (
          <KeyValue key={key} label={label} value={row[key]} valueClassName={amountClass(key, row)} />
        ))}
      </div>
      <div
        className={cn(
          'mt-3 flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5 ring-1 ring-inset',
          BALANCE_WELL[tone],
        )}
      >
        <span className="text-sm font-semibold text-slate-700">Balance Due</span>
        <span className={cn('font-display text-lg font-extrabold tabular-nums', BALANCE_TEXT[tone])}>
          {row.balance}
        </span>
      </div>
      {renderActions ? <div className="mt-auto pt-3">{renderActions(row, { dense: false })}</div> : null}
    </Card>
  );
}
