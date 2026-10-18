import { Columns3, Download, FileSpreadsheet, Sigma } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { formatRupees } from '@/core/format';
import { Button, Checkbox, ChoiceChips, Modal } from '@/ui';
import { computeStats } from './aggregate';
import { formatCount } from './display';
import { EXPORT_COLUMN_OPTIONS } from './exportData';

const FORMAT_OPTIONS = [
  { value: 'csv', label: 'CSV (Excel)' },
  { value: 'json', label: 'JSON' },
];
const ALL_COLUMNS = EXPORT_COLUMN_OPTIONS.map((o) => o.value);

function SummaryItem({ value, label }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl bg-gold-50/60 p-3 text-center ring-1 ring-gold-200 ring-inset">
      <div className="font-display text-sm font-extrabold [overflow-wrap:anywhere] text-brand-800 tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}

function Step({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-3.5 sm:p-4">
      <h3 className="mb-3 flex items-center gap-2.5 text-sm font-bold text-brand-800">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gold-100 text-gold-700 ring-1 ring-gold-200">
          <Icon className="size-[18px]" aria-hidden />
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** "Export Customer Data" dialog: format, columns to include, data summary. `customers` = the full list (web ignored the search). */
export function ExportSheet({ visible, customers, onClose, onExport }) {
  const [format, setFormat] = useState('csv');
  const [columns, setColumns] = useState(ALL_COLUMNS);
  const summary = useMemo(() => computeStats(customers), [customers]);

  // the web built a fresh dialog every time: always start from CSV with every column ticked
  useEffect(() => {
    if (visible) {
      setFormat('csv');
      setColumns(ALL_COLUMNS);
    }
  }, [visible]);

  const toggle = (column) =>
    setColumns((current) =>
      current.includes(column) ? current.filter((c) => c !== column) : [...current, column],
    );

  return (
    <Modal
      open={visible}
      onClose={onClose}
      title="Export Customer Data"
      footer={
        <>
          <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-none">
            Cancel
          </Button>
          <Button icon={Download} onClick={() => onExport(format, columns)} className="flex-1 sm:flex-none">
            Export Data
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Step icon={FileSpreadsheet} title="Export Format">
          <ChoiceChips options={FORMAT_OPTIONS} value={format} onChange={setFormat} />
        </Step>

        <Step icon={Columns3} title="Include Columns">
          <div className="grid gap-x-4 sm:grid-cols-2">
            {EXPORT_COLUMN_OPTIONS.map((o) => (
              <Checkbox
                key={o.value}
                label={o.label}
                checked={columns.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="min-h-11"
              />
            ))}
          </div>
        </Step>

        <Step icon={Sigma} title="Data Summary">
          <div className="flex gap-2">
            <SummaryItem value={formatCount(summary.totalCustomers)} label="Customers" />
            <SummaryItem value={formatCount(summary.totalInvoices)} label="Total Invoices" />
            <SummaryItem value={formatRupees(summary.totalCurrentBillAmount)} label="Total Amount" />
          </div>
        </Step>
      </div>
    </Modal>
  );
}
