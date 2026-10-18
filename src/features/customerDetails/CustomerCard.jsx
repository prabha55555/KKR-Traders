import { memo } from 'react';

import { Card, KeyValue, TotalInvoicesClickable } from '@/ui';
import { AddressText, CustomerName, PhoneReveal, ReminderAction, TONE_CLASS } from './CustomerCells';
import { buildRowModel } from './rowModel';

const BALANCE_WELL = {
  negative: 'bg-red-50/80 ring-red-200',
  positive: 'bg-emerald-50/80 ring-emerald-200',
  neutral: 'bg-slate-50 ring-slate-200',
};

/** One table row of the web page as a card (phones / tablets): identity, the six amounts, reminder action. */
export const CustomerCard = memo(function CustomerCard({ customer, onRemind }) {
  const row = buildRowModel(customer);
  return (
    <Card className="flex h-full flex-col p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-lift sm:p-4">
      <CustomerName name={customer.name} hasReturns={row.hasReturns} />
      <div className="mt-3 space-y-0.5 rounded-xl bg-slate-50/70 px-3 py-2">
        <PhoneReveal phone={customer.phone} showIcon />
        <AddressText address={customer.address} showIcon />
      </div>
      <div className="mt-3 px-0.5">
        <KeyValue
          label="Total Invoices"
          value={
            <TotalInvoicesClickable
              count={row.invoices}
              invoiceNumbers={customer.allInvoiceNumbers}
              entityName={customer.name}
              module="sales"
            />
          }
        />
        <KeyValue
          label="Opening Balance"
          value={row.openingBalance}
          valueClassName={TONE_CLASS[row.tones.openingBalance]}
        />
        <KeyValue label="Total Amount" value={row.amount} valueClassName={TONE_CLASS[row.tones.amount]} />
        <KeyValue label="Amount Paid" value={row.paid} valueClassName={TONE_CLASS[row.tones.paid]} />
        <KeyValue label="Discount" value={row.discount} valueClassName={TONE_CLASS[row.tones.discount]} />
        <KeyValue label="Returns" value={row.returns} valueClassName={TONE_CLASS[row.tones.returns]} />
      </div>
      <div
        className={`mt-3 flex items-baseline justify-between gap-3 rounded-xl px-3.5 py-2.5 ring-1 ring-inset ${BALANCE_WELL[row.tones.balance] ?? BALANCE_WELL.neutral}`}
      >
        <span className="text-sm font-semibold text-slate-700">Balance Due</span>
        <span className={`font-display text-lg font-extrabold tabular-nums ${TONE_CLASS[row.tones.balance]}`}>
          {row.balance}
        </span>
      </div>
      <div className="mt-auto pt-3">
        <ReminderAction customer={customer} onRemind={onRemind} />
      </div>
    </Card>
  );
});
