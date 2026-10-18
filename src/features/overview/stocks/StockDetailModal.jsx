import { PackageMinus, PackagePlus } from 'lucide-react';
import { useRef } from 'react';

import { formatRupees } from '@/core/format';
import { Button, DataTable, Modal, cn } from '@/ui';

import { useAppNavigate } from '@/hooks/useRouteParams';
import { AvailableValue, OpeningValue, RollsLine } from './StockRowParts';
import {
  hasRolls,
  historyDate,
  historyInvoiceNo,
  historyQty,
  historyRolls,
  historyTotal,
  rollsText,
} from './stocksLogic';

const PURCHASE = {
  key: 'purchase',
  title: 'Purchase History',
  party: 'Supplier',
  empty: 'No purchases found.',
  Icon: PackagePlus,
  tile: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  heading: 'text-emerald-800',
};
const SALES = {
  key: 'sales',
  title: 'Sales History',
  party: 'Customer',
  empty: 'No sales found.',
  Icon: PackageMinus,
  tile: 'bg-sky-50 text-sky-600 ring-sky-200',
  heading: 'text-sky-800',
};

function SummaryItem({ label, children }) {
  return (
    <div className="min-w-0 text-center">
      <dt className="text-[10px] font-bold tracking-[0.08em] text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/** `showRolls`: the product is counted in rolls (a Rolls column + total; entries without rolls show '-'). */
function HistorySection({ kind, entries, onSelectBill, showRolls }) {
  const columns = [
    { key: 'date', header: 'Date', className: 'whitespace-nowrap', value: (e) => historyDate(e.date) },
    {
      key: 'invoice',
      header: 'Invoice No',
      // the plain invoice number, or the return / batch / DC reference text
      render: (e) => (
        <span className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-2 hover:text-brand-900">
          {historyInvoiceNo(e.invoiceNo)}
        </span>
      ),
    },
    { key: 'party', header: kind.party, value: (e) => e.party },
    ...(showRolls
      ? [
          {
            key: 'rolls',
            header: 'Rolls',
            align: 'right',
            className: 'tabular-nums',
            value: (e) => (e.rolls ? e.rolls : '-'),
          },
        ]
      : []),
    { key: 'qty', header: 'Qty', align: 'right', className: 'tabular-nums', value: (e) => e.qty },
    {
      key: 'rate',
      header: 'Rate',
      align: 'right',
      className: 'tabular-nums',
      value: (e) => formatRupees(e.rate),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      className: 'font-semibold tabular-nums',
      value: (e) => formatRupees(e.amount),
    },
  ];
  return (
    <section className="mb-6 last:mb-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className={cn('flex items-center gap-2.5 text-base font-bold', kind.heading)}>
          <span
            className={cn('flex size-8 items-center justify-center rounded-lg ring-1 ring-inset', kind.tile)}
          >
            <kind.Icon className="size-[18px]" aria-hidden />
          </span>
          {kind.title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums">
            {entries.length}
          </span>
        </h3>
        {entries.length > 0 ? (
          <span className="hidden text-[11px] font-medium text-slate-400 sm:inline">
            Click row to view bill →
          </span>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        rows={entries}
        rowKey={(_, i) => i}
        onRowClick={(e) => onSelectBill?.(kind, e)}
        dense
        empty={<p className="py-6 text-center text-sm text-slate-500">{kind.empty}</p>}
        renderCard={(e) => {
          const display = historyInvoiceNo(e.invoiceNo);
          return (
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{historyDate(e.date)}</span>
                <span className="font-display font-bold text-brand-800 underline decoration-brand-300 underline-offset-2">
                  {display}
                </span>
              </div>
              <div className="text-slate-800">
                {kind.party}: {e.party}
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 tabular-nums">
                  {e.qty} × {formatRupees(e.rate)}
                  {showRolls && e.rolls ? ` · ${rollsText(e.rolls)}` : ''}
                </span>
                <span className="font-display font-bold text-brand-800 tabular-nums">
                  {formatRupees(e.amount)}
                </span>
              </div>
            </div>
          );
        }}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3 font-display font-bold text-brand-800">
            <span className="text-sm">Total</span>
            <div className="flex flex-wrap items-center gap-4 text-sm tabular-nums">
              <span className="font-semibold text-slate-600">
                Total Qty: <strong className="text-brand-800">{historyQty(entries)}</strong>
              </span>
              {showRolls ? (
                <span className="font-semibold text-slate-600">
                  Total Rolls: <strong className="text-brand-800">{historyRolls(entries)}</strong>
                </span>
              ) : null}
              {kind === PURCHASE && entries.length > 0 ? (
                <span className="font-semibold text-slate-600">
                  Avg Rate:{' '}
                  <strong className="text-emerald-700">
                    {historyQty(entries) > 0
                      ? formatRupees(historyTotal(entries) / historyQty(entries))
                      : '-'}
                  </strong>
                </span>
              ) : null}
              <span className="text-base text-brand-900">{formatRupees(historyTotal(entries))}</span>
            </div>
          </div>
        }
      />
    </section>
  );
}

/** The original "Stock Details" modal: purchase history and sales history of one product. `row` null = closed. */
export default function StockDetailModal({ row, onClose }) {
  const nav = useAppNavigate();
  // keep the content while the dialog is closing / for the title
  const last = useRef(null);
  if (row) last.current = row;
  const shown = row ?? last.current;

  const handleSelectBill = (kind, entry) => {
    const rawNo = entry.rawInvoiceNo || entry.invoiceNo || '';
    if (!rawNo) return;
    onClose();
    if (entry.isProcessingIssue || entry.isProcessingReceipt || entry.isProcessingReturn) {
      const where = entry.isProcessingReceipt ? '/processing/completed' : '/processing/lots';
      nav.push(`${where}?search=${encodeURIComponent(rawNo)}`);
      return;
    }
    if (entry.isCombingReceipt || entry.isCombingIssue || String(rawNo).startsWith('CB-')) {
      nav.push('/processing/old');
      return;
    }
    if (
      entry.isDyeingReceipt ||
      entry.isDyeingIssue ||
      String(rawNo).startsWith('B-') ||
      String(rawNo).startsWith('Batch')
    ) {
      nav.push('/processing/old');
      return;
    }
    const cleanNo = String(rawNo)
      .replace(/^Return\s*(?:-\s*Invoice No\s*|#)?/i, '')
      .trim();
    if (!cleanNo) return;
    if (kind === PURCHASE) {
      nav.push(`/purchase/history?search=${encodeURIComponent(cleanNo)}&view=${encodeURIComponent(cleanNo)}`);
    } else {
      nav.push(`/sales/history?search=${encodeURIComponent(cleanNo)}&view=${encodeURIComponent(cleanNo)}`);
    }
  };

  return (
    <Modal
      open={row !== null}
      onClose={onClose}
      title={shown?.description ?? 'Product Details'}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose} className="max-sm:w-full">
          Close
        </Button>
      }
    >
      {shown ? (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-gold-50/60 p-3 ring-1 ring-gold-100 sm:grid-cols-5">
            <SummaryItem label="Opening">
              <OpeningValue row={shown} />
              <RollsLine row={shown} rolls={shown.openingRolls} />
            </SummaryItem>
            <SummaryItem label="Purchased">
              <span className="font-semibold text-slate-800 tabular-nums">{shown.purchased}</span>
              <RollsLine row={shown} rolls={shown.purchasedRolls} />
            </SummaryItem>
            <SummaryItem label="Avg Purchase Rate">
              <span className="font-semibold text-brand-800 tabular-nums">
                {shown.avgPurchaseRate > 0 ? formatRupees(shown.avgPurchaseRate) : '-'}
              </span>
            </SummaryItem>
            <SummaryItem label="Sold">
              <span className="font-semibold text-slate-800 tabular-nums">{shown.sold}</span>
              <RollsLine row={shown} rolls={shown.soldRolls} />
            </SummaryItem>
            <SummaryItem label="Available">
              <AvailableValue row={shown} showLabel />
              <RollsLine row={shown} rolls={shown.availableRolls} strong />
            </SummaryItem>
          </dl>
          <HistorySection
            kind={PURCHASE}
            entries={shown.purchaseHistory}
            onSelectBill={handleSelectBill}
            showRolls={hasRolls(shown)}
          />
          <HistorySection
            kind={SALES}
            entries={shown.salesHistory}
            onSelectBill={handleSelectBill}
            showRolls={hasRolls(shown)}
          />
        </>
      ) : null}
    </Modal>
  );
}
