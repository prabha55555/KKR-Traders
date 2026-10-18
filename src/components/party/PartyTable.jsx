import { useMemo } from 'react';

import { DataTable, TotalInvoicesClickable } from '@/ui';
import {
  amountClass,
  PARTY_AMOUNT_COLUMNS,
  PartyAddress,
  PartyBalanceBadge,
  PartyName,
  PartyPhone,
} from './PartyCells';

/**
 * Columns of the party table — identical for customers and suppliers: name, phone, address, invoice count (opens the
 * invoice list), the five money columns, Balance Due (status badge) and, when the page has row actions, an
 * `actionsHeader` column of coloured icon buttons. Right-aligned columns are one-line tabular figures (.erp-table).
 */
export function partyTableColumns(kind, { renderActions, actionsHeader = 'Actions' } = {}) {
  const columns = [
    {
      key: 'name',
      header: `${kind.name} Name`,
      render: (r) => <PartyName name={r.name} hasReturns={r.hasReturns} kind={kind} />,
    },
    { key: 'phone', header: 'Phone', render: (r) => <PartyPhone phone={r.phone} /> },
    { key: 'address', header: 'Address', render: (r) => <PartyAddress address={r.address} /> },
    {
      key: 'invoices',
      header: 'Total Invoices',
      align: 'right',
      render: (r) => (
        <TotalInvoicesClickable
          count={r.invoiceCount}
          invoiceNumbers={r.invoiceNumbers}
          entityName={r.name}
          module={kind.module}
        />
      ),
    },
    ...PARTY_AMOUNT_COLUMNS.map(([key, header]) => ({
      key,
      header,
      align: 'right',
      render: (r) => <span className={`font-medium ${amountClass(key, r)}`}>{r[key]}</span>,
    })),
    { key: 'balance', header: 'Balance Due', align: 'right', render: (r) => <PartyBalanceBadge row={r} /> },
  ];
  if (renderActions) {
    columns.push({
      key: 'actions',
      header: actionsHeader,
      align: 'center',
      render: (r) => <div className="flex justify-center gap-1.5">{renderActions(r, { dense: true })}</div>,
    });
  }
  return columns;
}

/** Desktop table (app `.erp-table`, dense): scrolls sideways inside its own frame when the window is too narrow. */
export function PartyTable({ kind, rows, renderActions, actionsHeader }) {
  const columns = useMemo(
    () => partyTableColumns(kind, { renderActions, actionsHeader }),
    [kind, renderActions, actionsHeader],
  );
  return <DataTable dense rows={rows} columns={columns} rowKey={(r) => r.key} />;
}
