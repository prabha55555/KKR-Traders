import { Download, FileText, Printer, Share2 } from 'lucide-react';
import { COMPANY } from '@/core/branding';
import { formatCurrency, formatDateIN } from '@/core/format';
import { Button, Modal } from '@/ui';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function DyeingChallanModal({ open, onClose, batch }) {
  if (!batch) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Job Work / Dyeing Challan #${batch.batchId}`}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Printer} onClick={handlePrint}>
            Print Challan
          </Button>
        </div>
      }
    >
      <div
        id="dyeing-challan-printable"
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-800"
      >
        {/* Company Header */}
        <div className="flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{COMPANY.name}</h1>
            <p className="text-xs text-slate-500">{COMPANY.address}</p>
            <p className="text-xs text-slate-500">Phone: {COMPANY.phone}</p>
          </div>
          <div className="text-right">
            <span className="inline-block rounded bg-slate-900 px-3 py-1 font-mono text-xs font-bold text-white">
              JOB WORK DELIVERY CHALLAN
            </span>
            <div className="mt-2 text-xs font-semibold text-slate-700">
              Challan / Batch: <span className="font-mono">{batch.batchId}</span>
            </div>
            <div className="text-xs text-slate-500">Date: {formatDateIN(batch.batchDate)}</div>
          </div>
        </div>

        {/* Processor / Dye House Details */}
        <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
              Issued To (Dye House / Processor)
            </div>
            <div className="text-base font-bold text-slate-900">{batch.processorName}</div>
            {batch.processorOwner && (
              <div className="text-xs font-medium text-slate-700">Contact: {batch.processorOwner}</div>
            )}
            {batch.processorPhone && (
              <div className="text-xs text-slate-600">Phone: {batch.processorPhone}</div>
            )}
            {batch.processorAddress && <div className="text-xs text-slate-600">{batch.processorAddress}</div>}
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">Status</div>
            <div className="font-bold text-slate-800">{batch.status}</div>
          </div>
        </div>

        {/* Goods Sent for Processing */}
        <div>
          <h2 className="mb-2 text-xs font-bold tracking-wider text-slate-600 uppercase">
            1. Raw Grey Material Issued for Dyeing
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100">
                <th className="border-r border-slate-300 p-2 font-bold">Item Description</th>
                <th className="border-r border-slate-300 p-2 text-center font-bold">Unit</th>
                <th className="border-r border-slate-300 p-2 text-right font-bold">Quantity</th>
                <th className="border-r border-slate-300 p-2 text-right font-bold">Rate</th>
                <th className="p-2 text-right font-bold">Total Grey Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border-r border-slate-300 p-2 font-medium">{batch.input?.description}</td>
                <td className="border-r border-slate-300 p-2 text-center">
                  {batch.input?.unit && batch.input.unit !== 'Rolls' ? batch.input.unit : 'Qty'}
                </td>
                <td className="border-r border-slate-300 p-2 text-right font-bold">{batch.input?.qty}</td>
                <td className="border-r border-slate-300 p-2 text-right">
                  {rupees(batch.input?.avgGreyRate || 0)}
                </td>
                <td className="p-2 text-right font-bold">{rupees(batch.input?.totalGreyCost || 0)}</td>
              </tr>
            </tbody>
          </table>

          {/* Agreed Dyeing Rate & Weight Loss Terms */}
          {(batch.dyeingRate ||
            batch.input?.dyeingRate ||
            batch.weightLossPct ||
            batch.input?.weightLossPct) && (
            <div className="mt-2 flex flex-wrap items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs">
              <div>
                <span className="font-semibold text-slate-600">Agreed Dyeing Rate: </span>
                <span className="font-mono font-bold text-slate-900">
                  {rupees(batch.dyeingRate || batch.input?.dyeingRate || 0)} / qty
                </span>
              </div>
              {batch.weightLossPct || batch.input?.weightLossPct ? (
                <div>
                  <span className="font-semibold text-slate-600">Allowable Weight Loss: </span>
                  <span className="font-mono font-bold text-slate-900">
                    {batch.weightLossPct || batch.input?.weightLossPct}%
                  </span>
                </div>
              ) : null}
              <div>
                <span className="font-semibold text-slate-600">Total Batch Cost: </span>
                <span className="font-mono font-bold text-indigo-900">
                  {rupees(batch.totalBatchCost || 0)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Expected or Completed Finished Goods */}
        {batch.output && batch.output.length > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-bold tracking-wider text-slate-600 uppercase">
              2. Finished Goods Specification (Expected / Received)
            </h2>
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100">
                  <th className="border-r border-slate-300 p-2 font-bold">Finished Product</th>
                  <th className="border-r border-slate-300 p-2 text-center font-bold">Unit</th>
                  <th className="border-r border-slate-300 p-2 text-right font-bold">Quantity</th>
                  <th className="p-2 text-right font-bold">Cost / Qty</th>
                </tr>
              </thead>
              <tbody>
                {batch.output.map((out, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="border-r border-slate-300 p-2 font-medium">{out.description}</td>
                    <td className="border-r border-slate-300 p-2 text-center">
                      {out.unit && out.unit !== 'Rolls' ? out.unit : 'Qty'}
                    </td>
                    <td className="border-r border-slate-300 p-2 text-right font-bold">{out.qty}</td>
                    <td className="p-2 text-right font-mono font-bold text-emerald-800">
                      {rupees(out.unitCost || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signatures */}
        <div className="flex items-end justify-between pt-10 text-xs text-slate-500">
          <div className="w-44 border-t border-slate-400 pt-1 text-center">Processor Signature & Stamp</div>
          <div className="w-44 border-t border-slate-400 pt-1 text-center">For {COMPANY.name}</div>
        </div>
      </div>
    </Modal>
  );
}
