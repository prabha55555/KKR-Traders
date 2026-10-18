/**
 * PartyStatementSection – "Customer / Supplier Statement": search by (part of) a party's name -> combined summary of
 * all matching invoices, with the combined PDF, the simplified ("easy") PDF and a WhatsApp message.
 * Desktop: search on the left, results on the right. Phones/tablets: collapsed behind the heading until needed.
 *
 * Props:
 *   labels            { party, formatInvoiceNo? }
 *   query / onQueryChange(text)
 *   state             StatementState: { status: 'idle' | 'loading' | 'error' } | { status: 'empty', query } |
 *                     { status: 'ready', statement }  (statement = lib/statement.js buildCombinedStatement())
 *   busy              null | 'pdf' | 'easy' | 'whatsapp'  (which export is running)
 *   onGenerate() · onClear() · onDownloadPdf() · onDownloadEasyPdf() · onShareWhatsApp()
 */
import {
  ChevronDown,
  Download,
  FileSearch,
  FileText,
  MessageCircle,
  ReceiptText,
  RotateCcw,
  User,
} from 'lucide-react';
import { useState } from 'react';
import { formatCurrency, formatDateIN } from '@/core/format';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { Badge, Button, EmptyState, TextField, cn } from '@/ui';
import { statementBalanceLabel } from '../lib/statement';
import { displayInvoiceNo } from '../lib/types';
import { SkeletonBlock } from './Skeleton';

const rs = (n) => `₹${formatCurrency(n)}`;

function Tile({ label, value, tone, highlight }) {
  return (
    <div
      className={cn(
        'min-w-36 flex-1 basis-36 rounded-xl p-3 text-center',
        highlight
          ? 'border border-white/10 surface-ink text-white shadow-lift'
          : 'border border-line bg-slate-50/70',
      )}
    >
      <div
        className={cn(
          'font-display text-xl font-extrabold tabular-nums',
          tone ?? (highlight ? 'text-gold-300' : 'text-brand-800'),
        )}
      >
        {value}
      </div>
      <div className={cn('mt-1 text-xs font-medium', highlight ? 'text-brand-200' : 'text-slate-500')}>
        {label}
      </div>
    </div>
  );
}

function Results({ statement, labels, busy, onDownloadPdf, onDownloadEasyPdf, onShareWhatsApp }) {
  const { totals } = statement;
  const balance = totals.adjustedBalanceDue;
  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 border-b border-line pb-2.5 font-display text-lg font-extrabold text-brand-800">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-200">
          <User className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 truncate">
          {labels.party}: {statement.partyName}
        </span>
      </h3>
      <div className="mb-4 flex flex-wrap gap-2">
        <Tile label="Total Invoices" value={String(totals.totalInvoices)} />
        <Tile label="Total Current Bill Amount" value={rs(totals.totalCurrentBill)} />
        <Tile label="Total Paid" value={rs(totals.totalPaid)} />
        {totals.totalDiscount > 0 ? <Tile label="Total Discount" value={rs(totals.totalDiscount)} /> : null}
        {totals.totalReturns > 0 ? (
          <Tile label="Total Returns" value={`-${rs(totals.totalReturns)}`} tone="text-amber-600" />
        ) : null}
        <Tile
          label={statementBalanceLabel(totals)}
          value={rs(balance)}
          tone={balance > 0 ? 'text-red-300' : balance < 0 ? 'text-emerald-300' : undefined}
          highlight
        />
      </div>

      <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
        {statement.invoices.map((invoice) => {
          const hasReturns = invoice.totalReturns > 0;
          return (
            <li
              key={invoice.invoiceNo}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-l-[3px] border-line border-l-gold-400 bg-white px-3 py-2.5 text-sm shadow-sm transition hover:bg-gold-50/40"
            >
              <div className="min-w-48 flex-1">
                <p className="font-display font-bold text-brand-800">
                  Invoice #{displayInvoiceNo(labels, invoice.invoiceNo)} - {formatDateIN(invoice.invoiceDate)}
                </p>
                <p className="text-[13px] text-slate-600 tabular-nums">
                  {`Current: ${rs(invoice.subtotal)}`}
                  {invoice.previousBalance > 0 ? ` - Prev Bal: ${rs(invoice.previousBalance)}` : ''}
                  {invoice.discountAmount ? ` - Discount: ${rs(invoice.discountAmount)}` : ''}
                  {` - Paid: ${rs(invoice.amountPaid)}`}
                  {hasReturns ? ` - Returns: ${rs(invoice.totalReturns)}` : ''}
                  {` - Due: ${rs(hasReturns ? invoice.adjustedBalanceDue : invoice.balanceDue)}`}
                  {hasReturns ? ' (Adjusted)' : ''}
                </p>
              </div>
              {hasReturns ? (
                <Badge tone="warning" className="gap-1">
                  <RotateCcw className="size-3" aria-hidden />
                  Returns: {rs(invoice.totalReturns)}
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
        <Button
          variant="secondary"
          icon={Download}
          className="grow basis-36"
          onClick={onDownloadPdf}
          loading={busy === 'pdf'}
          disabled={!!busy}
        >
          Download PDF
        </Button>
        <Button
          variant="outline"
          icon={FileText}
          className="grow basis-36"
          onClick={onDownloadEasyPdf}
          loading={busy === 'easy'}
          disabled={!!busy}
        >
          Simple PDF
        </Button>
        <Button
          variant="whatsapp"
          icon={MessageCircle}
          className="grow basis-36"
          onClick={onShareWhatsApp}
          loading={busy === 'whatsapp'}
          disabled={!!busy}
        >
          Share on WhatsApp
        </Button>
      </div>
    </div>
  );
}

export function PartyStatementSection(props) {
  const { labels, query, onQueryChange, state, onGenerate, onClear } = props;
  const { isExpanded } = useBreakpoint();
  const [open, setOpen] = useState(false);
  const showBody = isExpanded || open;
  const party = labels.party.toLowerCase();

  const search = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGenerate();
      }}
      className={cn(
        'space-y-3',
        isExpanded && 'w-96 shrink-0 self-start rounded-2xl border border-line bg-slate-50/70 p-4',
      )}
    >
      <TextField
        type="search"
        placeholder={`Enter ${party} name`}
        aria-label={`${labels.party} name`}
        leftIcon={User}
        autoComplete="off"
        value={query}
        onChange={onQueryChange}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" icon={FileText} className="grow">
          Generate Combined Statement
        </Button>
        <Button variant="outlineDanger" onClick={onClear}>
          Clear
        </Button>
      </div>
    </form>
  );

  const results =
    state.status === 'loading' ? (
      <div className="space-y-2" role="status" aria-label="Loading statement">
        <SkeletonBlock className="h-24 w-full" />
        <SkeletonBlock className="h-14 w-full" />
        <SkeletonBlock className="h-14 w-full" />
      </div>
    ) : state.status === 'empty' ? (
      <EmptyState
        icon={FileSearch}
        title={`No invoices found for ${party}: "${state.query}"`}
        className="py-10"
      />
    ) : state.status === 'error' ? (
      <EmptyState title={`Error loading ${party} statement.`} className="py-10" />
    ) : state.status === 'ready' ? (
      <Results
        statement={state.statement}
        labels={labels}
        busy={props.busy}
        onDownloadPdf={props.onDownloadPdf}
        onDownloadEasyPdf={props.onDownloadEasyPdf}
        onShareWhatsApp={props.onShareWhatsApp}
      />
    ) : isExpanded ? (
      <p className="flex h-full min-h-32 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/40 px-6 py-8 text-center text-sm text-slate-500">
        {`Type part of a ${party}'s name and press Generate Combined Statement to see all their invoices, totals and the PDF / WhatsApp options here.`}
      </p>
    ) : null;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-line bg-white p-3.5 shadow-card sm:p-4">
      <span className="absolute inset-x-0 top-0 h-[2px] hairline-gold" aria-hidden />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isExpanded}
        aria-expanded={showBody}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl text-left focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none disabled:cursor-default"
      >
        <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-brand-800">
          <span className="flex size-8 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-200">
            <ReceiptText className="size-[18px]" aria-hidden />
          </span>
          {labels.party} Statement
        </h2>
        {!isExpanded ? (
          <ChevronDown
            className={cn('size-5 text-slate-500 transition-transform duration-200', open && 'rotate-180')}
            aria-hidden
          />
        ) : null}
      </button>
      {showBody ? (
        isExpanded ? (
          <div className="mt-4 flex items-stretch gap-6">
            {search}
            <div className="min-w-0 flex-1">{results}</div>
          </div>
        ) : (
          <div className="mt-3">
            {search}
            {results ? (
              <div className="mt-3 border-t border-dashed border-slate-300 pt-3">{results}</div>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}
