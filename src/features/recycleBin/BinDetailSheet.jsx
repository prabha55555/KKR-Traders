import { EyeOff, Trash2 } from 'lucide-react';
import { useRef } from 'react';

import { formatCurrency, formatDateIN } from '@/core/format';
import { Button, Card, EmptyState, Modal } from '@/ui';
import { buildBinDetail } from './binLogic';

const rupees = (n) => `₹${formatCurrency(n)}`;

function Box({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-line bg-slate-50/70 px-3.5 py-1 ${className}`}>{children}</div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="mt-5 mb-2 flex items-center gap-2 text-sm font-bold tracking-wide text-brand-800 uppercase">
      <span className="h-4 w-1 rounded-full bg-gold-gradient" aria-hidden />
      {children}
    </h3>
  );
}

function Line({ first, title, sub, amount }) {
  return (
    <div className={`py-2.5 ${first ? '' : 'border-t border-line'}`}>
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-0.5 flex justify-between gap-3 text-sm">
        <span className="text-slate-500">{sub}</span>
        <span className="font-bold text-brand-800 tabular-nums">{amount}</span>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-sm">
      <span className="shrink-0 font-medium text-slate-500">{label}</span>
      <span className="min-w-0 text-right font-semibold break-words text-slate-900">{value}</span>
    </div>
  );
}

function TotalRow({ label, value, valueClassName = 'text-white', bold }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className={bold ? 'font-semibold text-brand-100' : 'text-brand-300'}>{label}</span>
      <span className={`font-semibold tabular-nums ${valueClassName}`}>{value}</span>
    </div>
  );
}

function DetailBody({ detail }) {
  const { summary } = detail;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-xl font-extrabold text-brand-800">{detail.heading}</h3>
        <span className="text-sm font-medium text-slate-500">Date: {detail.dateText}</span>
      </div>

      <Box className="py-2">
        <Info label={detail.partyLabel} value={detail.partyName} />
        <Info label="Phone" value={detail.phone} />
        <Info label="Address" value={detail.address} />
        <p className="mt-1 flex items-center gap-1.5 border-t border-line pt-2 text-sm font-medium text-red-600">
          <Trash2 className="size-3.5" aria-hidden /> Deleted: {detail.deletedText}
        </p>
      </Box>

      <SectionTitle>Items</SectionTitle>
      <Box>
        {detail.lines.length === 0 ? (
          <p className="py-3 text-center text-slate-500">No items found</p>
        ) : (
          detail.lines.map((l, i) => (
            <Line
              key={i}
              first={i === 0}
              title={l.description}
              sub={`${l.qty} � ${rupees(l.rate)}`}
              amount={rupees(l.amount)}
            />
          ))
        )}
      </Box>

      <Card tone="ink" className="mt-3.5 p-4">
        <TotalRow label="Subtotal:" value={rupees(summary.subtotal)} />
        <TotalRow label="Old Balance:" value={rupees(summary.oldBalance)} />
        <hr className="my-2 border-white/10" />
        <div className="flex items-baseline justify-between gap-3 py-1">
          <span className="text-sm font-semibold text-brand-100">Grand Total:</span>
          <span className="font-display text-2xl font-extrabold text-gold-300 tabular-nums">
            {rupees(summary.grandTotal)}
          </span>
        </div>
        <TotalRow label="Paid:" value={rupees(summary.paid)} valueClassName="text-emerald-300" />
        <TotalRow
          label="Balance Due:"
          value={rupees(summary.balanceDue)}
          valueClassName="text-red-300"
          bold
        />
      </Card>

      {detail.payments.length > 0 ? (
        <>
          <SectionTitle>Payments ({detail.payments.length})</SectionTitle>
          <Box>
            {detail.payments.map((p, i) => (
              <Line
                key={p.id}
                first={i === 0}
                title={`${formatDateIN(p.date)} � ${p.method}`}
                sub={p.type}
                amount={rupees(p.amount)}
              />
            ))}
          </Box>
        </>
      ) : null}

      {detail.returns.length > 0 ? (
        <>
          <SectionTitle>Returns ({detail.returns.length})</SectionTitle>
          <Box>
            {detail.returns.map((r, i) => (
              <Line
                key={r.id}
                first={i === 0}
                title={r.description}
                sub={`${formatDateIN(r.date)} � Qty ${r.qty}`}
                amount={rupees(r.amount)}
              />
            ))}
          </Box>
        </>
      ) : null}
    </div>
  );
}

/** "View Details" dialog of the web bin (products + totals) plus the payments / returns that come back on restore. */
export function BinDetailSheet({ item, config, onClose }) {
  // keep showing the last item while the dialog closes
  const lastItem = useRef(null);
  if (item) lastItem.current = item;
  const shown = item ?? lastItem.current;
  const detail = shown ? buildBinDetail(shown, config) : null;
  return (
    <Modal
      open={item !== null}
      onClose={onClose}
      title="View Details"
      footer={
        <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
          Close
        </Button>
      }
    >
      {detail ? (
        <DetailBody detail={detail} />
      ) : (
        <EmptyState icon={EyeOff} title="Preview not available for this item type." />
      )}
    </Modal>
  );
}
