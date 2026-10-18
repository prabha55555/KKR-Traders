/**
 * HistoryInvoiceDetailSheet – full detail of one invoice (summary, products, history links, every action).
 * Opened by clicking a table row on desktop.
 *
 * Props: invoice (HistoryInvoice | null; null = closed) · labels ({ party, formatInvoiceNo? }) ·
 *        actions (HistoryInvoiceActions) · onClose().
 * The page should pass actions that close the sheet first (a stacked dialog would hide toasts / confirms).
 */
import { Camera, ZoomIn } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, formatDateIN } from '@/core/format';
import { Button, Modal } from '@/ui';
import { displayInvoiceNo } from '../lib/types';
import { HistorySheet } from './HistorySheet';
import {
  InvoiceActionButtons,
  InvoiceHistoryLinks,
  InvoiceProducts,
  InvoiceSlipBadge,
  InvoiceStatusBadge,
  InvoiceSummaryBox,
  PaidProgress,
} from './InvoiceParts';

export function HistoryInvoiceDetailSheet({ invoice, labels, actions, onClose }) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <>
      <HistorySheet
        open={!!invoice}
        onClose={onClose}
        title={invoice ? `Invoice No ${displayInvoiceNo(labels, invoice.invoiceNo)}` : ''}
        size="lg"
      >
        {invoice ? (
          <>
            <div className="rounded-2xl border border-white/10 surface-ink p-4 text-white shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold tracking-[0.08em] text-brand-300 uppercase">
                    {labels.party}
                  </p>
                  <p className="truncate font-display text-lg font-bold" title={invoice.partyName}>
                    {invoice.partyName}
                  </p>
                  <p className="text-xs text-brand-300">{formatDateIN(invoice.invoiceDate)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  <InvoiceSlipBadge invoice={invoice} />
                  <InvoiceStatusBadge invoice={invoice} />
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.08em] text-brand-300 uppercase">Total</p>
                  <p className="font-display text-3xl leading-tight font-extrabold text-gold-300 tabular-nums">
                    ₹{formatCurrency(invoice.grandTotal)}
                  </p>
                </div>
                <p className="text-right text-xs font-semibold text-brand-200 tabular-nums">
                  Paid ₹{formatCurrency(invoice.amountPaid)}
                </p>
              </div>
              <PaidProgress invoice={invoice} className="mt-3 [&>div]:bg-white/15 [&>span]:text-brand-300" />
            </div>

            {invoice.manualBillImage ? (
              <div className="my-3 overflow-hidden rounded-xl border border-line bg-slate-50/70">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-slate-100/80 px-3 py-2 text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-1.5 text-emerald-700">
                    <Camera className="size-3.5" aria-hidden />
                    <span>Manual Bill Slip Attached</span>
                  </div>
                  <Button variant="outlineInfo" size="sm" icon={ZoomIn} onClick={() => setZoomOpen(true)}>
                    Full View
                  </Button>
                </div>
                <button
                  type="button"
                  aria-label="View the full bill slip image"
                  className="group relative block w-full cursor-pointer p-2 text-center focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none focus-visible:ring-inset"
                  onClick={() => setZoomOpen(true)}
                >
                  <img
                    src={invoice.manualBillImage}
                    alt={`Attached manual bill slip for Invoice No ${displayInvoiceNo(labels, invoice.invoiceNo)}`}
                    className="mx-auto max-h-48 rounded-lg object-contain shadow-2xs transition duration-200 group-hover:scale-[1.01]"
                  />
                  <span className="absolute inset-0 flex items-center justify-center rounded-b-xl bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-900 shadow">
                      <ZoomIn className="size-3.5" aria-hidden /> Click to view full image
                    </span>
                  </span>
                </button>
              </div>
            ) : null}

            <InvoiceSummaryBox invoice={invoice} />
            <h3 className="mb-1.5 text-[13px] font-bold tracking-wide text-slate-600">Products</h3>
            <InvoiceProducts invoice={invoice} />
            <InvoiceHistoryLinks
              invoice={invoice}
              onViewPayments={() => actions.viewPayments(invoice.invoiceNo)}
              onViewReturns={() => actions.viewReturns(invoice.invoiceNo)}
            />
            <InvoiceActionButtons invoice={invoice} actions={actions} />
          </>
        ) : null}
      </HistorySheet>

      {/* Full-size slip, above the detail sheet */}
      <Modal
        open={zoomOpen && !!invoice?.manualBillImage}
        onClose={() => setZoomOpen(false)}
        title={invoice ? `Manual Bill Slip - Invoice No ${displayInvoiceNo(labels, invoice.invoiceNo)}` : ''}
        size="lg"
        layer="z-[60]"
        footer={
          <Button variant="neutral" onClick={() => setZoomOpen(false)} className="flex-1 sm:flex-none">
            Close
          </Button>
        }
      >
        {invoice?.manualBillImage ? (
          <>
            <p className="mb-3 truncate text-sm text-slate-500" title={invoice.partyName}>
              {invoice.partyName}
            </p>
            <div className="rounded-xl bg-slate-100 p-3">
              <img
                src={invoice.manualBillImage}
                alt={`Full size manual bill slip for Invoice No ${displayInvoiceNo(labels, invoice.invoiceNo)}`}
                className="mx-auto max-h-[65dvh] max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
