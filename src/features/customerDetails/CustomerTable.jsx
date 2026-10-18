import { Users } from 'lucide-react';
import { useMemo } from 'react';

import { DataTable, EmptyState, TotalInvoicesClickable } from '@/ui';
import { AddressText, CustomerName, PhoneReveal, ReminderAction, TONE_CLASS } from './CustomerCells';
import { buildRowModel } from './rowModel';

const AMOUNT_COLUMNS = [
  ['openingBalance', 'Opening Balance'],
  ['amount', 'Total Amount'],
  ['paid', 'Amount Paid'],
  ['discount', 'Discount'],
  ['returns', 'Returns'],
  ['balance', 'Balance Due'],
];

/** Desktop table: the same ten columns, in the same order, as the web page's `<table>`. */
export function CustomerTable({ rows, onRemind }) {
  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'Customer Name',
        render: (c) => <CustomerName name={c.name} hasReturns={buildRowModel(c).hasReturns} size="table" />,
      },
      { key: 'phone', header: 'Phone', render: (c) => <PhoneReveal phone={c.phone} /> },
      { key: 'address', header: 'Address', render: (c) => <AddressText address={c.address} /> },
      {
        key: 'invoices',
        header: 'Total Invoices',
        align: 'right',
        render: (c) => (
          <TotalInvoicesClickable
            count={buildRowModel(c).invoices}
            invoiceNumbers={c.allInvoiceNumbers}
            entityName={c.name}
            module="sales"
          />
        ),
      },
      ...AMOUNT_COLUMNS.map(([key, header]) => ({
        key,
        header,
        align: 'right',
        render: (c) => {
          const m = buildRowModel(c);
          return <span className={`font-semibold ${TONE_CLASS[m.tones[key]]}`}>{m[key]}</span>;
        },
      })),
      {
        key: 'reminder',
        header: 'WhatsApp Reminder',
        align: 'center',
        render: (c) => <ReminderAction customer={c} onRemind={onRemind} dense />,
      },
    ],
    [onRemind],
  );

  return (
    <DataTable
      dense
      rows={rows}
      columns={columns}
      rowKey={(c) => c.name}
      empty={
        <EmptyState
          icon={Users}
          title="No Customers Found"
          message="Add customers or create invoices to see customer data here"
        />
      }
    />
  );
}
