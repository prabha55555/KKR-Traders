/**
 * Live preview of the Settings page, built from the values being typed (not the saved ones):
 *  - Sales bill: the REAL printed bill (the same builder as printing / sharing, core/services/invoiceHtml.js) with a
 *    sample invoice, scaled to fit the card — exactly what will print, header, GST number, bank lines, terms and all;
 *  - Dashboard: the greeting, welcome heading, tagline and browser tab title;
 *  - WhatsApp: how the business signs shared statements and purchase acknowledgements.
 */
import { Eye, LayoutDashboard, Maximize2, MessageCircle, Receipt } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { CREDIT_LINE } from '@/core/branding';
import { normalizeBusiness, printName, purchaseAckLine, sharePhonesOf } from '@/core/business';
import { buildInvoiceHtml } from '@/core/services/invoiceHtml';
import { Button, Card, ChoiceChips, Modal, SectionHeader, cn } from '@/ui';
import { logoPreviewSrc } from './LogoField';

/** A4 at 96 dpi: the printed bill is laid out for this page size. */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

/** Sample bill for the preview only (never saved). */
const SAMPLE_INVOICE = {
  invoiceNo: '001',
  invoiceDate: new Date().toISOString().slice(0, 10),
  customerName: 'Sample Customer',
  customerAddress: 'Customer address',
  products: [
    { sno: 1, description: 'Cotton Fabric 40s', rolls: 4, qty: 120, rate: 145, amount: 17400 },
    { sno: 2, description: 'Dyed Fabric — Navy', rolls: 2, qty: 60, rate: 210, amount: 12600 },
  ],
  subtotal: 30000,
  previousBalance: 5000,
  discountAmount: 500,
  grandTotal: 34500,
  amountPaid: 20000,
  balanceDue: 14500,
  paymentBreakdown: { cash: 8000, account: 12000 },
};

const VIEWS = [
  { value: 'bill', label: 'Sales bill' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/**
 * The sample bill scaled to the width of its frame. In the full-size dialog (`minScale`) it is never smaller than that
 * scale: a narrow phone screen scrolls sideways instead of shrinking the A4 page to an unreadable size.
 */
function BillPreview({ business, logo, minScale = 0 }) {
  const frameRef = useRef(null);
  const width = useWidth(frameRef);
  const scale = width > 0 ? Math.max(minScale, Math.min(1, width / PAGE_WIDTH)) : Math.max(minScale, 0.45);
  const html = useMemo(
    () => buildInvoiceHtml({ invoice: SAMPLE_INVOICE, business, logoSrc: logoPreviewSrc(logo) }),
    [business, logo],
  );
  return (
    <div
      ref={frameRef}
      className={cn(
        'relative rounded-xl border border-slate-300 bg-white shadow-inner',
        minScale ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden',
      )}
      style={{ height: Math.round(PAGE_HEIGHT * scale) + (minScale ? 12 : 0) }}
    >
      <div
        className="relative"
        style={{ width: Math.round(PAGE_WIDTH * scale), height: Math.round(PAGE_HEIGHT * scale) }}
      >
        <iframe
          title={minScale ? 'Sales bill full-size preview' : 'Sales bill preview'}
          srcDoc={html}
          sandbox=""
          tabIndex={-1}
          className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
          style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}

function DashboardPreview({ business, username }) {
  const greetName = business.ownerName || username || 'Owner';
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-white/10 surface-ink p-4 text-white shadow-lift">
        <p className="text-xs font-semibold text-gold-300">Good morning, {greetName}</p>
        <p className="mt-1.5 font-display text-xl leading-tight font-extrabold wrap-anywhere">
          {business.welcomeMessage ? (
            business.welcomeMessage
          ) : (
            <>
              Welcome to <span className="text-gold-gradient">{business.name}</span>
            </>
          )}
        </p>
        {business.tagline ? <p className="mt-1.5 text-sm text-brand-200">{business.tagline}</p> : null}
      </div>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-500">Browser tab:</span>
        <span className="truncate rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
          {business.name} · Billing
        </span>
      </div>
    </div>
  );
}

function Bubble({ label, children }) {
  return (
    <figure className="space-y-1">
      <figcaption className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </figcaption>
      <div className="rounded-2xl rounded-tl-sm bg-[#dcf8c6] px-3.5 py-2.5 text-[13px] leading-relaxed wrap-anywhere whitespace-pre-wrap text-slate-900 shadow-sm ring-1 ring-black/5">
        {children}
      </div>
    </figure>
  );
}

function WhatsAppPreview({ business }) {
  const name = printName(business);
  const phones = sharePhonesOf(business);
  const contact = [
    '*CONTACT INFORMATION*',
    `🏢 *${name}*`,
    business.shareLocation ? `📍 ${business.shareLocation}` : null,
    phones ? `📞 *Phone: ${phones}*` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <div className="space-y-3 rounded-xl bg-[#ece5dd] p-3">
      <Bubble label="Shared statement">
        {`*${name} - ACCOUNT STATEMENT*\n…\n${contact}\n\n${CREDIT_LINE}`}
      </Bubble>
      <Bubble label="Purchase acknowledgement">{`…\n${purchaseAckLine(business)}\n\n${CREDIT_LINE}`}</Bubble>
    </div>
  );
}

/** A cheap fingerprint of a (up to 900 KB) logo data URL: its length and ~1000 sampled characters. */
function logoKey(logo) {
  if (!logo) return '';
  const step = Math.max(1, Math.floor(logo.length / 1000));
  let hash = 0;
  for (let i = 0; i < logo.length; i += step) hash = (hash * 31 + logo.charCodeAt(i)) | 0;
  return `${logo.length}:${hash}`;
}

export function BusinessPreview({ values, username }) {
  const [view, setView] = useState('bill');
  const [fullSize, setFullSize] = useState(false);
  const typed = normalizeBusiness(values);
  // re-built only when a typed value changes (the logo is compared by its fingerprint, not stringified every render)
  const { logo: typedLogo, ...typedRest } = typed;
  const key = `${JSON.stringify(typedRest)}|${logoKey(typedLogo)}`;
  // a blank name still shows where it will print
  const business = useMemo(
    () => (typed.name ? typed : { ...typed, name: 'Your Business Name' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return (
    <Card as="section" aria-label="Bill preview">
      <SectionHeader title="Live preview" icon={Eye} />
      <p className="-mt-2 mb-3 text-xs text-slate-500">
        Exactly how these details appear — it changes as you type (sample bill, not saved).
      </p>
      <ChoiceChips value={view} onChange={setView} options={VIEWS} label="Preview of" className="mb-3" />
      {view === 'bill' ? (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <Receipt className="size-3.5" aria-hidden /> Printed / shared sales bill
          </p>
          <BillPreview business={business} logo={business.logo} />
          <Button
            variant="outline"
            size="sm"
            icon={Maximize2}
            className="mt-2"
            onClick={() => setFullSize(true)}
          >
            Full-size preview
          </Button>
          <Modal open={fullSize} onClose={() => setFullSize(false)} title="Sales bill preview" size="xl">
            <BillPreview business={business} logo={business.logo} minScale={0.6} />
          </Modal>
        </div>
      ) : view === 'dashboard' ? (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <LayoutDashboard className="size-3.5" aria-hidden /> Dashboard welcome
          </p>
          <DashboardPreview business={business} username={username} />
        </div>
      ) : (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <MessageCircle className="size-3.5" aria-hidden /> WhatsApp messages
          </p>
          <WhatsAppPreview business={business} />
        </div>
      )}
    </Card>
  );
}
