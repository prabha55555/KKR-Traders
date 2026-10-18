/**
 * Building blocks shared by the invoice table, the invoice card and the invoice detail sheet.
 *
 * InvoiceSummaryBox({ invoice })                       – bill, previous balance, discount, total, paid (initial /
 *                                                        additional / total + Cash / Account split), returns, balance.
 *                                                        Only returns settled against the balance lower the due; refunded
 *                                                        returns are listed ("Returns (refunded)") without changing it.
 * InvoiceProducts({ invoice })                         – Product / (Rolls) / Qty / Rate / Amount table (detail sheet); the
 *                                                        Rolls column only when a line has a roll count.
 * InvoiceProductLines({ invoice, limit, stacked })     – every product line inline ("description · rolls · qty × rate =
 *                                                        amount"): the first `limit` (3) lines, "+N more" expands in place.
 * PartyContact({ invoice, labels, clampAddress })      – party name, phone and address.
 * PaidSplit({ invoice, short })                        – the Cash / Account split of what was paid (right-aligned lines).
 * PaymentRecordsSummary({ invoice })                   – initial / additional payments (or the method of an older bill).
 * InvoiceHistoryLinks({ invoice, onViewPayments, onViewReturns })
 *                                                      – "Payment History (₹x)" / "Return History (₹x)" rows.
 * InvoiceActionButtons({ invoice, actions, compact, onDetails })
 *                                                      – wrapped button grid (see HistoryInvoiceActions in ./types.js);
 *                                                        `compact` (phone/tablet card) leaves out the rare actions;
 *                                                        `onDetails` adds a "Details" button (opens the detail sheet).
 * InvoiceStatusBadge({ invoice })                      – Paid / Partially Paid / Unpaid <Badge status> (presentational).
 * InvoiceSlipBadge({ invoice })                        – "Slip Attached" when a manual bill slip image is stored.
 * PaidProgress({ invoice })                            – slim gold -> emerald bar: paid share of the invoice total.
 *
 * `invoice` is a HistoryInvoice view model, so the same parts serve sales and purchase.
 */
import {
  Banknote,
  Camera,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  MapPin,
  MessageCircle,
  Phone,
  Printer,
  RotateCcw,
  Share2,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { formatCurrency, toNum } from '@/core/format';
import { methodLabel } from '@/core/paymentMethods';
import { Badge, Button, cn } from '@/ui';
import { additionalPaymentsLabel, splitPayments } from '../lib/payments';
import { balanceReturnsOf, invoiceDue, refundedReturnsOf } from '../lib/statement';

const rs = (amount) => `₹${formatCurrency(amount)}`;

/** 'Paid' | 'Partially Paid' | 'Unpaid' – purely a visual reading of the invoice figures. */
export function invoiceStatusText(invoice) {
  if (invoiceDue(invoice) <= 0) return 'Paid';
  return invoice.amountPaid > 0 ? 'Partially Paid' : 'Unpaid';
}

/** Paid / Partially Paid / Unpaid pill, coloured by the app-wide status map (same colours as every other module). */
export function InvoiceStatusBadge({ invoice, className }) {
  return <Badge status={invoiceStatusText(invoice)} className={className} />;
}

/** Visual indicator badge when an invoice has a manual bill / physical slip attached. */
export function InvoiceSlipBadge({ invoice, className }) {
  if (!invoice?.manualBillImage && !invoice?.hasManualBillImage) return null;
  return (
    <Badge tone="success" className={className}>
      <Camera className="mr-1 inline size-3 align-[-2px]" aria-hidden />
      Slip Attached
    </Badge>
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

// ------------------------------------------------------------------ party / payment split

/**
 * Party name, phone and address. `clampAddress` keeps the address on one line (full text in the tooltip) – the table
 * cell; the phone card shows it in full. The name stays in its own element (tests and screen readers find it alone).
 */
export function PartyContact({ invoice, labels, clampAddress = false, className }) {
  const phone = String(invoice.partyPhone ?? '').trim();
  const address = String(invoice.partyAddress ?? '').trim();
  return (
    <div className={cn('min-w-0', className)}>
      <p className="leading-snug font-semibold wrap-break-word text-slate-800">
        {labels ? <span className="sr-only">{labels.party}: </span> : null}
        <span>{invoice.partyName || '-'}</span>
      </p>
      {phone ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 tabular-nums">
          <Phone className="size-3 shrink-0 text-slate-400" aria-hidden />
          <span className="sr-only">Phone: </span>
          <span>{phone}</span>
        </p>
      ) : null}
      {address ? (
        <p
          className={cn(
            'mt-0.5 text-xs leading-snug text-slate-500',
            clampAddress ? 'line-clamp-1 wrap-anywhere' : 'wrap-break-word',
          )}
          title={clampAddress ? address : undefined}
        >
          <MapPin className="mr-1.5 inline size-3 align-[-2px] text-slate-400" aria-hidden />
          <span className="sr-only">Address: </span>
          {address}
        </p>
      ) : null}
    </div>
  );
}

/** Cash / Account parts of what was paid on the bill (non-zero parts only; [] when no split is stored). */
export function paidSplitParts(invoice) {
  const pb = invoice?.paymentBreakdown;
  if (!pb || typeof pb !== 'object') return [];
  return [
    { key: 'cash', label: 'Cash', amount: toNum(pb.cash) },
    { key: 'account', label: 'Account', amount: toNum(pb.account) },
  ].filter((part) => part.amount > 0);
}

/** 'Cash' / 'Account' of an older bill that stored one method and no payment records, else ''. */
function legacyMethodOf(invoice) {
  if (!invoice?.legacyPaymentMethod || (invoice.payments ?? []).length > 0) return '';
  return methodLabel(invoice.legacyPaymentMethod);
}

/**
 * The Cash / Account split under a "Paid" figure (right-aligned lines). An older bill without a split shows its
 * stored method instead. `short` (table column) writes Account as "A/c".
 */
export function PaidSplit({ invoice, short = false, className }) {
  const parts = paidSplitParts(invoice);
  const legacy = parts.length === 0 && toNum(invoice.amountPaid) > 0 ? legacyMethodOf(invoice) : '';
  if (parts.length === 0 && !legacy) return null;
  return (
    <span
      className={cn(
        'flex flex-col items-end text-[11px] leading-snug font-medium text-slate-500 tabular-nums',
        className,
      )}
    >
      {parts.map((part) => (
        <span key={part.key}>
          {short && part.key === 'account' ? (
            <abbr title="Account" className="no-underline">
              A/c
            </abbr>
          ) : (
            part.label
          )}{' '}
          {rs(part.amount)}
        </span>
      ))}
      {legacy ? <span>via {legacy}</span> : null}
    </span>
  );
}

/** True when PaymentRecordsSummary has something to show (payment records, or the method of an older bill). */
export const hasPaymentRecordsSummary = (invoice) =>
  (invoice?.payments ?? []).length > 0 || legacyMethodOf(invoice) !== '';

const NO_PAYMENTS = [];

/**
 * Initial / additional payments of the bill (the same figures as the summary box). Null when the bill has no payment
 * records and no stored method.
 */
export function PaymentRecordsSummary({ invoice, className }) {
  const payments = invoice.payments ?? NO_PAYMENTS;
  const split = useMemo(() => splitPayments(payments), [payments]);
  const additional = additionalPaymentsLabel(split.additional);
  const legacy = legacyMethodOf(invoice);
  if (payments.length === 0 && !legacy) return null;
  return (
    <dl className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-[13px]', className)}>
      {payments.length > 0 ? (
        <>
          <dt className="text-slate-500">Initial paid</dt>
          <dd className="text-right font-semibold text-slate-800 tabular-nums">
            {split.initial.length > 0 ? rs(split.initialTotal) : '-'}
          </dd>
          <dt className="text-slate-500">Additional paid</dt>
          <dd className="text-right font-semibold wrap-anywhere text-slate-800 tabular-nums">
            {additional || '-'}
          </dd>
        </>
      ) : null}
      {legacy ? (
        <>
          <dt className="text-slate-500">Method</dt>
          <dd className="text-right font-semibold text-slate-800">{legacy}</dd>
        </>
      ) : null}
    </dl>
  );
}

// ------------------------------------------------------------------ summary box

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
  const methodParts = paidSplitParts(invoice);
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
                <Badge tone="success" className="text-[10px]">
                  {methodLabel(invoice.legacyPaymentMethod).toUpperCase()}
                </Badge>
              ) : null}
            </span>
          </div>
          {methodParts.map((part) => (
            <div key={part.key} className="flex justify-between gap-3 pl-3 text-emerald-700">
              <span>{part.label}:</span>
              <span className="font-semibold tabular-nums">{rs(part.amount)}</span>
            </div>
          ))}
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

// ------------------------------------------------------------------ products

/** A product line's amount: the stored `amount`, else qty × rate (a line saved without one). */
export function productLineAmount(p) {
  const stored = p?.amount;
  return stored !== undefined && stored !== null && stored !== ''
    ? toNum(stored)
    : toNum(p?.qty) * toNum(p?.rate);
}
const rollsText = (p) => {
  const rolls = toNum(p?.rolls);
  return rolls > 0 ? `${rolls} roll${rolls === 1 ? '' : 's'}` : '';
};
const qtyText = (p) => (p?.qty === undefined || p?.qty === null || p?.qty === '' ? '0' : String(p.qty));

export function InvoiceProducts({ invoice }) {
  const showRolls = invoice.products.some((p) => toNum(p?.rolls) > 0);
  return (
    <div className="erp-table-wrap erp-table-flat">
      <table className="erp-table erp-table-dense">
        <thead>
          <tr>
            <th scope="col">Product</th>
            {showRolls ? (
              <th scope="col" className="num">
                Rolls
              </th>
            ) : null}
            <th scope="col" className="num">
              Qty
            </th>
            <th scope="col" className="num">
              Rate
            </th>
            <th scope="col" className="num">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.products.length > 0 ? (
            invoice.products.map((p, i) => (
              <tr key={`${i}-${p.description}`}>
                <td className="w-full">{p.description}</td>
                {showRolls ? <td className="num">{toNum(p.rolls) > 0 ? toNum(p.rolls) : '-'}</td> : null}
                <td className="num">{p.qty}</td>
                <td className="num">{rs(p.rate)}</td>
                <td className="num font-semibold">{rs(productLineAmount(p))}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={showRolls ? 5 : 4} className="text-center text-slate-500">
                No products found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every product line of a bill, inline (no popup): "description · rolls · qty × rate = amount".
 * Row layout (table): one aligned line per product – description | rolls | qty × rate | = | amount.
 * `stacked` (phone card): description and amount on one line, rolls · qty × rate under it.
 * Bills with more than `limit` lines show the first `limit` and a "+N more" toggle that expands the list in place.
 */
export function InvoiceProductLines({ invoice, limit = 3, stacked = false, className }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const products = invoice.products ?? [];
  if (products.length === 0) {
    return <p className={cn('text-[13px] text-slate-500', className)}>No products found</p>;
  }
  const hiddenCount = Math.max(0, products.length - limit);
  const shown = expanded || hiddenCount === 0 ? products : products.slice(0, limit);

  return (
    <div className={className}>
      {stacked ? (
        <ul id={listId} role="list" className="divide-y divide-line">
          {shown.map((p, i) => (
            <li key={`${i}-${p.description}`} className="py-1.5 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-medium wrap-break-word text-slate-800">
                  {p.description || '-'}
                </span>
                <span className="shrink-0 font-semibold text-slate-800 tabular-nums">
                  {rs(productLineAmount(p))}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
                {[rollsText(p), `${qtyText(p)} × ${rs(p.rate)}`].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <ul
          id={listId}
          role="list"
          className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-baseline gap-x-3 gap-y-1 text-[13px]"
        >
          {shown.map((p, i) => (
            <li key={`${i}-${p.description}`} className="col-span-full grid grid-cols-subgrid items-baseline">
              <span className="min-w-0 font-medium wrap-break-word text-slate-800">
                {p.description || '-'}
              </span>
              <span className="text-right whitespace-nowrap text-slate-500 tabular-nums">{rollsText(p)}</span>
              <span className="text-right whitespace-nowrap text-slate-600 tabular-nums">
                {qtyText(p)} × {rs(p.rate)}
              </span>
              <span className="text-slate-400">=</span>
              <span className="text-right font-semibold whitespace-nowrap text-slate-800 tabular-nums">
                {rs(productLineAmount(p))}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hiddenCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className="mt-1 -ml-2 gap-1! px-2!"
        >
          {expanded ? (
            'Show less'
          ) : (
            <>
              +{hiddenCount} more <span className="sr-only">products</span>
            </>
          )}
          <ChevronDown
            className={cn('size-4 transition-transform duration-200', expanded && 'rotate-180')}
            aria-hidden
          />
        </Button>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ history links / actions

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
          tone="text-amber-800"
          tile="bg-amber-50 text-amber-600 ring-amber-200"
          icon={RotateCcw}
          onClick={onViewReturns}
        />
      ) : null}
    </div>
  );
}

export function InvoiceActionButtons({ invoice, actions, compact = false, onDetails }) {
  const no = invoice.invoiceNo;
  const cell = compact ? 'grow basis-[46%]' : 'grow basis-[46%] sm:basis-[30%]';
  const extras = (
    <>
      {actions.whatsAppMessage ? (
        <Button
          variant="whatsapp"
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
          variant="outlinePurple"
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
      {onDetails ? (
        <Button variant="outlineInfo" icon={Eye} className={cell} onClick={onDetails}>
          Details
        </Button>
      ) : null}
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
