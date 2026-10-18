/**
 * Revenue & Profit Tracking — replaces original-app/revenue.html + js/revenue.js.
 * KPI row (bills / revenue / cost / net profit of the filtered list), date + customer filters, per-invoice profit
 * lines (table on tablets/desktops, cards on phones) and the "Total Net Profit" row.
 */
import { IndianRupee, Receipt, ReceiptText, TrendingUp, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { formatCurrency, formatDateShort, formatInvoiceNo, invoiceNoLabel } from '@/core/format';
import { DataTable, EmptyState, ErrorState, Page, StatCard, StatGrid, cn } from '@/ui';

import FilterBar from '../components/FilterBar';
import ShowMore from '../components/ShowMore';
import SkeletonRows from '../components/SkeletonRows';
import StickyBar from '../components/StickyBar';
import { usePagedRows } from '../components/paging';
import { filterRevenueRows, revenueTotals } from './revenueLogic';
import { loadRevenueRows } from './revenueService';

const rupees = (n) => `₹${formatCurrency(n)}`;
/** Profit in green, loss in red (the app-wide success / danger colours). */
const profitColor = (n) => (n >= 0 ? 'text-emerald-700' : 'text-red-600');

/** The invoice number, linking to the bill's edit screen; `withLabel` (cards, no column header): "Invoice No 001". */
function BillLink({ row, withLabel = false }) {
  return (
    <Link
      to={`/sales/bill?edit=${encodeURIComponent(row.rawBillNo)}`}
      aria-label={`Open ${invoiceNoLabel(row.billNo)} for editing`}
      className="inline-flex min-h-9 items-center rounded-lg bg-gold-50 px-2.5 font-display font-bold text-brand-800 ring-1 ring-gold-200 transition ring-inset hover:bg-gold-100 hover:text-gold-800 focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:outline-none"
    >
      {withLabel ? invoiceNoLabel(row.billNo) : formatInvoiceNo(row.billNo)}
    </Link>
  );
}

/** "Shirt (₹150.00 - ₹110.00) ₹40.00 × 4 = ₹160.00" per product (a sales return: "Returned:", negative qty), then the discount. */
function DetailLines({ row }) {
  return (
    <div className="space-y-1 text-left text-[13px] leading-snug text-slate-600">
      {row.lines.map((l, i) => (
        <div key={i}>
          {l.isReturn ? <span className="font-medium text-red-600">Returned: </span> : null}
          <span className="font-semibold text-slate-800">{l.description}</span> ({rupees(l.sellingRate)} -{' '}
          {rupees(l.costRate)}) {rupees(l.profitPerUnit)} × {l.qty} ={' '}
          <strong className="text-brand-800 tabular-nums">{rupees(l.totalProfit)}</strong>
        </div>
      ))}
      {row.discount > 0 ? (
        <div className="font-medium text-red-600">Discount: -{rupees(row.discount)}</div>
      ) : null}
    </div>
  );
}

function RevenueCard({ row }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <BillLink row={row} withLabel />
        <span className="text-sm text-slate-500">{formatDateShort(row.date)}</span>
      </div>
      <div className="mt-2 font-display font-bold break-words text-brand-800">{row.name}</div>
      <div className="mt-2 rounded-xl bg-slate-50/70 p-2.5">
        <DetailLines row={row} />
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="text-xs font-bold tracking-[0.08em] text-slate-500 uppercase">Profit</span>
        <span className={cn('font-display text-lg font-extrabold tabular-nums', profitColor(row.profit))}>
          {rupees(row.profit)}
        </span>
      </div>
    </>
  );
}

/** "Total Net Profit" line: the table's totals row on tablets / desktops, the phone sticky bar otherwise. */
function TotalLine({ total, footer = false }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-1',
        footer && 'sm:justify-end',
      )}
    >
      <span className="flex items-center gap-2 font-display font-bold text-brand-800">
        <TrendingUp className="size-4 text-gold-600" aria-hidden />
        Total Net Profit:
      </span>
      <span className={cn('font-display text-xl font-extrabold tabular-nums', profitColor(total))}>
        {rupees(total)}
      </span>
    </div>
  );
}

const COLUMNS = [
  { key: 'bill', header: 'Invoice No', render: (r) => <BillLink row={r} /> },
  { key: 'date', header: 'Date', nowrap: true, value: (r) => formatDateShort(r.date) },
  { key: 'name', header: 'Customer Name', className: 'min-w-36', value: (r) => r.name },
  { key: 'details', header: 'Details', className: 'min-w-72', render: (r) => <DetailLines row={r} /> },
  {
    key: 'profit',
    header: 'Profit Amount',
    align: 'right',
    className: 'font-display font-bold',
    render: (r) => <span className={profitColor(r.profit)}>{rupees(r.profit)}</span>,
  },
];

export default function RevenuePage() {
  const { isExpanded } = useBreakpoint();
  const [rows, setRows] = useState([]);
  const [dateTerm, setDateTerm] = useState('');
  const [nameTerm, setNameTerm] = useState('');

  const { loading, error, reload } = useFocusLoad(async () => {
    try {
      setRows(await loadRevenueRows());
    } catch (e) {
      console.error('Error loading revenue:', e);
      throw new Error('Error loading data.');
    }
  });

  // totals are always taken from the whole filtered list, never from the visible page
  const visible = useMemo(() => filterRevenueRows(rows, dateTerm, nameTerm), [rows, dateTerm, nameTerm]);
  const totals = useMemo(() => revenueTotals(visible), [visible]);
  const paged = usePagedRows(visible, `${dateTerm}|${nameTerm}`);
  const showTotal = !loading && !error && visible.length > 0;

  let body;
  if (loading) body = <SkeletonRows count={4} height="h-32" />;
  else if (error) body = <ErrorState message={error} onRetry={() => void reload()} />;
  else
    body = (
      <>
        <DataTable
          columns={COLUMNS}
          rows={paged.rows}
          rowKey={(r, i) => `${r.rawBillNo}-${i}`}
          renderCard={(r) => <RevenueCard row={r} />}
          empty={
            <EmptyState
              icon={Receipt}
              title="No bills found."
              message="Saved bills appear here with the profit earned on each."
            />
          }
          footer={showTotal && isExpanded ? <TotalLine total={totals.profit} footer /> : undefined}
        />
        <ShowMore pager={paged.pager} noun="records" />
        {showTotal ? (
          <StickyBar>
            <TotalLine total={totals.profit} />
          </StickyBar>
        ) : null}
      </>
    );

  return (
    <Page title="Revenue & Profit Tracking" icon={TrendingUp}>
      <StatGrid cols={4} className="mb-5">
        <StatCard icon={ReceiptText} label="Bills" value={loading ? '…' : totals.bills} tone="info" />
        <StatCard
          icon={IndianRupee}
          label="Revenue"
          value={loading ? '…' : rupees(totals.revenue)}
          tone="brand"
        />
        <StatCard icon={Wallet} label="Cost" value={loading ? '…' : rupees(totals.cost)} tone="neutral" />
        <StatCard
          icon={TrendingUp}
          label={
            !loading && totals.revenue > 0
              ? `Net Profit (${((totals.profit / totals.revenue) * 100).toFixed(1)}%)`
              : 'Net Profit'
          }
          value={loading ? '…' : rupees(totals.profit)}
          tone={!loading && totals.profit < 0 ? 'danger' : 'success'}
        />
      </StatGrid>
      <FilterBar
        date={dateTerm}
        onDateChange={setDateTerm}
        text={nameTerm}
        onTextChange={setNameTerm}
        textPlaceholder="Search by Customer Name..."
        quickDates
        onClear={() => {
          setDateTerm('');
          setNameTerm('');
        }}
      />
      {body}
    </Page>
  );
}
