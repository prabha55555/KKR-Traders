import { Download, FileText, Printer, Share2 } from 'lucide-react';
import { COMPANY } from '@/core/branding';
import { formatCurrency, formatDateIN } from '@/core/format';
import { Button, Modal } from '@/ui';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function CombingChallanModal({ open, onClose, batch }) {
  if (!batch) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Job Work / Combing Challan #${batch.batchId}`}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
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
        id="combing-challan-printable"
        className="p-6 bg-white border border-slate-200 rounded-xl space-y-6 text-slate-800 text-sm"
      >
        {/* Company Header */}
        <div className="border-b border-slate-300 pb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{COMPANY.name}</h1>
            <p className="text-xs text-slate-500">{COMPANY.address}</p>
            <p className="text-xs text-slate-500">Phone: {COMPANY.phone}</p>
          </div>
          <div className="text-right">
            <span className="inline-block bg-slate-900 text-white font-mono font-bold text-xs px-3 py-1 rounded">
              COMBING JOB WORK CHALLAN
            </span>
            <div className="text-xs font-semibold text-slate-700 mt-2">
              Challan / Batch: <span className="font-mono">{batch.batchId}</span>
            </div>
            <div className="text-xs text-slate-500">Date: {formatDateIN(batch.batchDate)}</div>
          </div>
        </div>

        {/* Processor / Mill Details */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 grid grid-cols-2 gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">
              Issued To (Combing Mill / Processor)
            </div>
            <div className="font-bold text-slate-900 text-base">{batch.processorName}</div>
            {batch.processorOwner && (
              <div className="text-xs font-medium text-slate-700">Contact: {batch.processorOwner}</div>
            )}
            {batch.processorPhone && (
              <div className="text-xs text-slate-600">Phone: {batch.processorPhone}</div>
            )}
            {batch.processorAddress && (
              <div className="text-xs text-slate-600">{batch.processorAddress}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold uppercase text-slate-500 tracking-wider">Status</div>
            <div className="font-bold text-slate-800">{batch.status}</div>
          </div>
        </div>

        {/* Goods Sent for Processing */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
            1. Dyed Fabric Issued for Combing & Processing
          </h2>
          <table className="w-full border-collapse border border-slate-300 text-left text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300">
                <th className="p-2 border-r border-slate-300 font-bold">Item Description</th>
                <th className="p-2 border-r border-slate-300 font-bold text-center">Unit</th>
                <th className="p-2 border-r border-slate-300 font-bold text-right">Quantity</th>
                <th className="p-2 border-r border-slate-300 font-bold text-right">Rate</th>
                <th className="p-2 font-bold text-right">Total Fabric Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 border-r border-slate-300 font-medium">
                  {batch.input?.description}
                </td>
                <td className="p-2 border-r border-slate-300 text-center">
                  {batch.input?.unit && batch.input.unit !== 'Rolls' ? batch.input.unit : 'Qty'}
                </td>
                <td className="p-2 border-r border-slate-300 text-right font-bold">
                  {batch.input?.qty}
                </td>
                <td className="p-2 border-r border-slate-300 text-right">
                  {rupees(batch.input?.avgRate || batch.input?.rate || 0)}
                </td>
                <td className="p-2 text-right font-bold">
                  {rupees(batch.input?.totalCost || 0)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Agreed Combing Rate & Weight Loss Terms */}
          {(batch.processingRate || batch.input?.processingRate || batch.weightLossPct) && (
            <div className="flex flex-wrap items-center justify-between text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 mt-2">
              <div>
                <span className="font-semibold text-slate-600">Agreed Combing Rate: </span>
                <span className="font-mono font-bold text-slate-900">
                  {rupees(batch.processingRate || batch.input?.processingRate || 0)} / qty
                </span>
              </div>
              {batch.weightLossPct ? (
                <div>
                  <span className="font-semibold text-slate-600">Actual Weight Loss: </span>
                  <span className="font-mono font-bold text-slate-900">
                    {batch.weightLossPct}%
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
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
              2. Finished Goods Specification (Expected / Received)
            </h2>
            <table className="w-full border-collapse border border-slate-300 text-left text-xs">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300">
                  <th className="p-2 border-r border-slate-300 font-bold">Finished Product</th>
                  <th className="p-2 border-r border-slate-300 font-bold text-center">Unit</th>
                  <th className="p-2 border-r border-slate-300 font-bold text-right">Quantity</th>
                  <th className="p-2 font-bold text-right">Cost / Qty</th>
                </tr>
              </thead>
              <tbody>
                {batch.output.map((out, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="p-2 border-r border-slate-300 font-medium">{out.description}</td>
                    <td className="p-2 border-r border-slate-300 text-center">
                      {out.unit && out.unit !== 'Rolls' ? out.unit : 'Qty'}
                    </td>
                    <td className="p-2 border-r border-slate-300 text-right font-bold">{out.qty}</td>
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
        <div className="pt-10 flex justify-between items-end text-xs text-slate-500">
          <div className="border-t border-slate-400 pt-1 w-44 text-center">
            Processor Signature & Stamp
          </div>
          <div className="border-t border-slate-400 pt-1 w-44 text-center">
            For {COMPANY.name}
          </div>
        </div>
      </div>
    </Modal>
  );
}
