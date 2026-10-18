/**
 * Building blocks shared by the invoice card and the invoice detail sheet.
 *
 * InvoiceSummaryBox({ invoice })                       – bill, previous balance, discount, total, paid split, returns, balance.
 *                                                        Only returns settled against the balance lower the due; refunded
 *                                                        returns are listed ("Returns (refunded)") without changing it.
 * InvoiceProducts({ invoice })                         – Product / Qty / Rate list ("View Details").
 * InvoiceHistoryLinks({ invoice, onViewPayments, onViewReturns })
 *                                                      – "Payment History (₹x)" / "Return History (₹x)" rows.
 * InvoiceActionButtons({ invoice, actions, compact })  – wrapped button grid (see HistoryInvoiceActions in ./types.js);
 *                                                        `compact` (phone/tablet card) folds the rare actions behind "More actions".
 * InvoiceStatusBadge({ invoice })                      – Paid / Part paid / Unpaid pill (presentational).
 * PaidProgress({ invoice })                            – slim gold -> emerald bar: paid share of the invoice total.
 *
 * `invoice` is a HistoryInvoice view model, so the same parts serve sales and purchase.
 */
import {
  Banknote,
  Camera,
  ChevronRight,
  Download,
  FileText,
  MessageCircle,
  Printer,
  RotateCcw,
  Share2,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useMemo } from 'react';
import { formatCurrency } from '@/core/format';
import { methodLabel } from '@/core/paymentMethods';
import { Badge, Button, cn } from '@/ui';
import { additionalPaymentsLabel, splitPayments } from '../lib/payments';
import { balanceReturnsOf, invoiceDue, refundedReturnsOf } from '../lib/statement';

const rs = (amount) => `₹${formatCurrency(amount)}`;

/** Paid / Part paid / Unpaid – purely a visual reading of the invoice figures. */
export function InvoiceStatusBadge({ invoice, className }) {
  const due = invoiceDue(invoice);
  if (due <= 0) {
    return (
      <Badge tone="success" className={className}>
        Paid
      </Badge>
    );
  }
  return invoice.amountPaid > 0 ? (
    <Badge tone="warning" className={className}>
      Part paid
    </Badge>
  ) : (
    <Badge tone="danger" className={className}>
      Unpaid
    </Badge>
  );
}

/** Visual indicator badge when an invoice has a manual bill / physical slip attached. */
export function InvoiceSlipBadge({ invoice, className, onClick }) {
  if (!invoice?.manualBillImage && !invoice?.hasManualBillImage) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 shadow-2xs ring-1 ring-emerald-600/20',
        onClick && 'cursor-pointer transition-colors hover:bg-emerald-100',
        className,
      )}
      onClick={onClick}
      title="Manual bill slip attached"
    >
      <Camera className="size-3 shrink-0 text-emerald-600" aria-hidden />
      <span>Slip Attached</span>
    </span>
  );
}

/** Slim progress bar (gold -> emerald): paid share of the invoice total. */
export function PaidProgress({ invoice, className }) {
  const total = Number(invoice.grandTotal) || 0;
  const paid = Number(invoice.amountPaid) || 0;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((paid / total) * 100))) : 0;
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label="Paid share of invoice total"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-gold-400 to-emerald-500 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-9 text-right text-[11px] font-semibold text-slate-500 tabular-nums">{pct}%</span>
    </div>
  );
}

function Line({ label, value, valueClassName, bold, className }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 text-sm', className)}>
      <span className={bold ? 'font-semibold text-brand-800' : 'text-slate-500'}>{label}</span>
      <span
        className={cn(
          'tabular-nums',
          bold ? 'font-display text-base font-extrabold' : 'font-semibold',
          valueClassName ?? (bold ? 'text-brand-800' : 'text-slate-800'),
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function InvoiceSummaryBox({ invoice }) {
  const { payments } = invoice;
  const split = useMemo(() => splitPayments(payments), [payments]);
  const additional = additionalPaymentsLabel(split.additional);
  const adjusted = balanceReturnsOf(invoice);
  const refunded = refundedReturnsOf(invoice);
  const due = invoiceDue(invoice);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-slate-50/70">
      <div className="space-y-2 p-3">
        <Line
          label="Current Bill Amount:"
          value={rs(invoice.subtotal)}
          className="border-b border-line pb-2"
        />
        <Line label="Previous Balance:" value={rs(invoice.previousBalance)} valueClassName="text-red-600" />
        {invoice.discountAmount ? (
          <Line
            label="Discount Amount:"
            value={`-${rs(invoice.discountAmount)}`}
            valueClassName="text-emerald-600"
          />
        ) : null}
        <Line
          label="Total Amount:"
          value={rs(invoice.grandTotal)}
          bold
          className="border-t border-dashed border-slate-300 pt-2"
        />

        <div className="space-y-1.5 rounded-xl bg-emerald-50/80 p-2.5 text-xs text-emerald-800 ring-1 ring-emerald-200 ring-inset sm:text-sm">
          <div className="flex justify-between gap-3">
            <span>Initial Amount Paid:</span>
            <span className="font-semibold tabular-nums">
              {split.initial.length > 0 ? rs(split.initialTotal) : '-'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Additional Amount Paid:</span>
            <span className="text-right font-semibold tabular-nums">{additional || '-'}</span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-emerald-200 pt-1.5 font-semibold text-emerald-900">
            <span>Total Amount Paid:</span>
            <span className="flex items-center gap-1.5 font-bold tabular-nums">
              {rs(invoice.amountPaid)}
              {invoice.legacyPaymentMethod && payments.length === 0 ? (
                <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {methodLabel(invoice.legacyPaymentMethod).toUpperCase()}
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {adjusted > 0 ? (
          <Line label="Return Amount:" value={`-${rs(adjusted)}`} valueClassName="text-red-600" />
        ) : null}
        {refunded > 0 ? (
          <Line label="Returns (refunded):" value={rs(refunded)} valueClassName="text-amber-700" />
        ) : null}
      </div>
      <div
        className={cn(
          'flex items-baseline justify-between gap-3 border-t px-3 py-2.5 font-bold',
          'border-red-200 bg-red-50 text-red-600',
        )}
      >
        <span className="text-sm">{adjusted > 0 ? 'Current Adjusted Balance Due:' : 'Balance Due:'}</span>
        <span className="font-display text-lg font-extrabold tabular-nums">{rs(due)}</span>
      </div>
    </div>
  );
}

export function InvoiceProducts({ invoice }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white text-sm">
      <div className="flex gap-2 bg-linear-to-b from-slate-50 to-slate-100/70 px-3 py-2 text-[11px] font-bold tracking-[0.08em] text-slate-500 uppercase">
        <span className="flex-1">Product</span>
        <span className="w-16 text-right">Qty</span>
        <span className="w-20 text-right">Rate</span>
      </div>
      {invoice.products.length > 0 ? (
        invoice.products.map((p, i) => (
          <div
            key={`${i}-${p.description}`}
            className="flex gap-2 border-t border-slate-100 px-3 py-2 text-slate-800"
          >
            <span className="min-w-0 flex-1 break-words">{p.description}</span>
            <span className="w-16 text-right tabular-nums">{p.qty}</span>
            <span className="w-20 text-right tabular-nums">{rs(p.rate)}</span>
          </div>
        ))
      ) : (
        <p className="p-3 text-center text-slate-500">No products found</p>
      )}
    </div>
  );
}

function HistoryLink({ label, tone, tile, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'group flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm font-semibold transition hover:bg-gold-50/70 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none',
        tone,
      )}
    >
      <span
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset', tile)}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="flex-1">{label}</span>
      <ChevronRight
        className="size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-gold-600"
        aria-hidden
      />
    </button>
  );
}

export function InvoiceHistoryLinks({ invoice, onViewPayments, onViewReturns }) {
  if (!(invoice.amountPaid > 0 || invoice.totalReturns > 0)) return null;
  return (
    <div className="mt-2 space-y-0.5 border-t border-line pt-2">
      {invoice.amountPaid > 0 ? (
        <HistoryLink
          label={`Payment History (${rs(invoice.amountPaid)})`}
          tone="text-emerald-700"
          tile="bg-emerald-50 text-emerald-600 ring-emerald-200"
          icon={Banknote}
          onClick={onViewPayments}
        />
      ) : null}
      {invoice.totalReturns > 0 ? (
        <HistoryLink
          label={`Return History (${rs(invoice.totalReturns)})`}
          tone="text-red-700"
          tile="bg-red-50 text-red-600 ring-red-200"
          icon={RotateCcw}
          onClick={onViewReturns}
        />
      ) : null}
    </div>
  );
}

export function InvoiceActionButtons({ invoice, actions, compact = false }) {
  const no = invoice.invoiceNo;
  const cell = compact ? 'grow basis-[46%]' : 'grow basis-[46%] sm:basis-[30%]';
  const extras = (
    <>
      {actions.whatsAppMessage ? (
        <Button
          variant="outline"
          icon={MessageCircle}
          className={cell}
          onClick={() => actions.whatsAppMessage(no)}
        >
          WhatsApp Message
        </Button>
      ) : null}
      {actions.printInvoice ? (
        <Button variant="outline" icon={Printer} className={cell} onClick={() => actions.printInvoice(no)}>
          Print Invoice
        </Button>
      ) : null}
      {actions.shareInvoicePdf ? (
        <Button
          variant="outline"
          icon={FileText}
          className={cell}
          onClick={() => actions.shareInvoicePdf(no)}
        >
          Share Invoice PDF
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
      <Button variant="edit" icon={SquarePen} className={cell} onClick={() => actions.edit(no)}>
        Edit
      </Button>
      <Button variant="outlineDanger" icon={Trash2} className={cell} onClick={() => actions.remove(no)}>
        Delete
      </Button>
      {invoice.canAddPayment ? (
        <Button variant="success" icon={Banknote} className={cell} onClick={() => actions.addPayment(no)}>
          Add Payment
        </Button>
      ) : null}
      {invoice.canAddReturn ? (
        <Button variant="warning" icon={RotateCcw} className={cell} onClick={() => actions.addReturn(no)}>
          Add Return
        </Button>
      ) : null}
      <Button
        variant="purple"
        icon={Share2}
        className={cell}
        aria-label="Share Statement"
        onClick={() => actions.shareStatement(no)}
      >
        Share Statement
      </Button>
      <Button
        variant="secondary"
        icon={Download}
        className={cell}
        aria-label="Download Statement"
        onClick={() => actions.downloadStatement(no)}
      >
        Download Statement
      </Button>
      {!compact ? extras : null}
    </div>
  );
}
