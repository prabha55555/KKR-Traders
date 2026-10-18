/**
 * HistoryInvoiceDetailSheet – full detail of one invoice (summary, products, history links, every action).
 * Opened by clicking a table row on desktop.
 *
 * Props: invoice (HistoryInvoice | null; null = closed) · labels ({ party, formatInvoiceNo? }) ·
 *        actions (HistoryInvoiceActions) · onClose().
 * The page should pass actions that close the sheet first (a stacked dialog would hide toasts / confirms).
 */
import { Camera, ZoomIn, X } from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, formatDateIN } from '@/core/format';
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
        title={invoice ? `Invoice #${displayInvoiceNo(labels, invoice.invoiceNo)}` : ''}
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
                  <p className="truncate font-display text-lg font-bold">{invoice.partyName}</p>
                  <p className="text-xs text-brand-300">{formatDateIN(invoice.invoiceDate)}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
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
                <div className="flex items-center justify-between border-b border-line bg-slate-100/80 px-3 py-2 text-xs font-semibold text-slate-700">
                  <div className="flex items-center gap-1.5 text-emerald-700">
                    <Camera className="size-3.5" />
                    <span>Manual Bill Slip Attached</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setZoomOpen(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200/60 hover:text-brand-800"
                  >
                    <ZoomIn className="size-3" /> Full View
                  </button>
                </div>
                <div
                  className="group relative cursor-pointer p-2 text-center"
                  onClick={() => setZoomOpen(true)}
                >
                  <img
                    src={invoice.manualBillImage}
                    alt={`Attached manual bill slip for #${invoice.invoiceNo}`}
                    className="mx-auto max-h-48 rounded-lg object-contain shadow-2xs transition duration-200 group-hover:scale-[1.01]"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-b-xl bg-black/25 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-bold text-slate-900 shadow">
                      <ZoomIn className="size-3.5" /> Click to view full image
                    </span>
                  </div>
                </div>
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

      {/* Modal Preview for Full Size Slip */}
      {zoomOpen && invoice?.manualBillImage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setZoomOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Manual Bill Slip - #{displayInvoiceNo(labels, invoice.invoiceNo)}
                </h3>
                <p className="text-xs text-slate-500">{invoice.partyName}</p>
              </div>
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="max-h-[75vh] overflow-auto bg-slate-100 p-4">
              <img
                src={invoice.manualBillImage}
                alt={`Full size manual bill slip for #${invoice.invoiceNo}`}
                className="mx-auto max-h-full rounded-lg object-contain shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
