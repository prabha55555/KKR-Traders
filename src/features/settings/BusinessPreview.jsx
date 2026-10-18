import { Eye } from 'lucide-react';

import {
  bankLines,
  billTermLines,
  DEFAULT_BUSINESS,
  monogramOf,
  normalizeBusiness,
  printName,
} from '@/core/business';
import { Card, SectionHeader } from '@/ui';
import { logoPreviewSrc } from './LogoField';

/**
 * A small mock of the printed sales bill built from the values being typed (not the saved ones): the heading with
 * logo, name, contact line and GST number, the bill title, then the payment / bank lines and the terms above the
 * signatures. Container queries lay it out in a row only when the card itself is wide enough.
 */
export function BusinessPreview({ values }) {
  const b = normalizeBusiness(values);
  const name = printName(b);
  const logoSrc = logoPreviewSrc(b.logo);
  const contact = [b.address, b.phones && `CELL: ${b.phones}`, b.email, b.website].filter(Boolean);
  const bank = bankLines({ ...b, bankIfsc: b.bankIfsc.toUpperCase() });
  const terms = billTermLines(b);
  const monogram = monogramOf(b);

  return (
    <Card as="section" aria-label="Bill preview">
      <SectionHeader title="Live preview" icon={Eye} />
      <p className="-mt-2 mb-3 text-xs text-slate-500">
        How your details print on a sales bill — it changes as you type.
      </p>

      <div className="@container relative overflow-hidden rounded-xl border border-slate-300 bg-white p-3 text-slate-900 shadow-inner sm:p-4">
        {monogram ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex -rotate-12 items-center justify-center font-display text-6xl font-black whitespace-nowrap text-slate-900/4 select-none"
          >
            {monogram}
          </span>
        ) : null}

        <div className="relative flex flex-col gap-3 @lg:flex-row @lg:items-start @lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            {logoSrc ? <img src={logoSrc} alt="" className="size-14 shrink-0 object-contain" /> : null}
            <div className="min-w-0">
              <p className="text-[15px] leading-tight font-extrabold tracking-wide [overflow-wrap:anywhere]">
                {name || <span className="text-slate-400">YOUR BUSINESS NAME</span>}
              </p>
              {b.tagline ? (
                <p className="mt-0.5 text-[11px] font-bold [overflow-wrap:anywhere] text-slate-700">
                  {b.tagline}
                </p>
              ) : null}
              {contact.length ? (
                <p className="mt-1 text-[11px] leading-snug [overflow-wrap:anywhere] text-slate-700">
                  {contact.join(' | ')}
                </p>
              ) : null}
              {b.gstin ? (
                <p className="mt-0.5 text-[11px] font-bold [overflow-wrap:anywhere]">
                  GSTIN: {b.gstin.toUpperCase()}
                </p>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 border-t border-slate-200 pt-2 @lg:border-0 @lg:pt-0 @lg:text-right">
            <p className="text-sm font-extrabold tracking-wider [overflow-wrap:anywhere]">
              {b.salesBillTitle || DEFAULT_BUSINESS.salesBillTitle}
            </p>
            <p className="text-[10px] text-slate-500">(ORIGINAL)</p>
            <p className="mt-0.5 text-[11px]">
              <strong>Invoice No:</strong> 001
            </p>
          </div>
        </div>

        <div className="relative my-3 rounded-md border border-dashed border-slate-300 py-3 text-center text-[11px] text-slate-400">
          Customer, items and totals
        </div>

        {b.paymentNo || bank.length ? (
          <div className="relative space-y-0.5 text-[11px] [overflow-wrap:anywhere]">
            {b.paymentNo ? <p className="font-bold">Payment No : {b.paymentNo}</p> : null}
            {bank.length ? <p>{bank.join(' | ')}</p> : null}
          </div>
        ) : null}

        <div className="relative mt-3 grid gap-3 border-t border-slate-200 pt-2 text-[10px] @lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0 space-y-0.5 [overflow-wrap:anywhere] text-slate-700">
            {terms.length ? (
              terms.map((line, i) => <p key={i}>{line}</p>)
            ) : (
              <p className="text-slate-400">No terms printed</p>
            )}
          </div>
          <div className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">
            <p>For {name || 'YOUR BUSINESS NAME'}</p>
            <p className="mt-5 border-t border-slate-400 pt-0.5 font-normal text-slate-600">
              AUTHORIZED SIGNATORY
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
