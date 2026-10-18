import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Layers,
  Package,
  Plus,
  Save,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ProductDescriptionInput } from '@/components/bill';
import { formatCurrency, todayISO } from '@/core/format';
import { Badge, Button, Card, DateField, Modal, NumberField, TextField, cn, useFeedback } from '@/ui';

import {
  COMBING_STATUS,
  calcCombingBatchTotals,
  computeInputFabricRate,
  emptyCombingBatch,
  suggestNextCombingBatchId,
  validateCombingBatch,
} from './combingLogic';
import { saveCombingBatchRecord } from './combingService';
import { ProcessorPicker } from './ProcessorPicker';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function CombingBatchModal({
  open,
  onClose,
  initialBatch = null,
  existingBatches = [],
  shortcuts = [],
  stockMap = new Map(),
  dyeingBatches = [],
  purchaseBills = [],
  processors = [],
  onSaved,
}) {
  const { toast } = useFeedback();
  const [form, setForm] = useState(() => emptyCombingBatch(todayISO()));
  const [saving, setSaving] = useState(false);
  const [showHistoryBreakdown, setShowHistoryBreakdown] = useState(false);

  const handleSelectProcessor = (proc) => {
    setForm((prev) => ({
      ...prev,
      processorName: proc.processorName || proc.name || '',
      processorOwner: proc.ownerName || '',
      processorPhone: proc.phone || '',
      processorAddress: proc.address || '',
    }));
    toast('Processor Details Loaded', `${proc.processorName || proc.name} (${proc.ownerName})`, 'success');
  };

  useEffect(() => {
    if (!open) return;
    if (initialBatch) {
      setForm({
        ...initialBatch,
        input: {
          unit: 'Rolls',
          processingRate: '',
          weightLossPct: '',
          ...initialBatch.input,
        },
        output:
          Array.isArray(initialBatch.output) && initialBatch.output.length > 0
            ? initialBatch.output.map((o) => ({ ...o }))
            : [{ description: '', unit: 'Rolls', qty: '', allocatedCost: 0, unitCost: 0 }],
      });
    } else {
      const nextId = suggestNextCombingBatchId(existingBatches);
      const fresh = emptyCombingBatch(todayISO());
      fresh.batchId = nextId;
      setForm(fresh);
    }
    setShowHistoryBreakdown(false);
  }, [open, initialBatch, existingBatches]);

  // Derive weighted average cost and available stock whenever input dyed fabric changes
  const fabricRateDetails = useMemo(() => {
    const desc = form.input?.description?.trim();
    if (!desc) {
      return {
        avgRate: 0,
        availableQty: 0,
        totalQty: 0,
        totalCost: 0,
        sourcesCount: 0,
        sources: [],
        history: [],
      };
    }
    return computeInputFabricRate(desc, dyeingBatches, purchaseBills, stockMap);
  }, [form.input?.description, dyeingBatches, purchaseBills, stockMap]);

  const totals = calcCombingBatchTotals(form);

  const updateField = (key, val) => {
    setForm((prev) => ({ ...prev, [key]: val }));
  };

  const updateInput = (key, val) => {
    setForm((prev) => ({
      ...prev,
      input: { ...prev.input, [key]: val },
    }));
  };

  const handleInputDescriptionChange = (desc) => {
    const rateInfo = computeInputFabricRate(desc, dyeingBatches, purchaseBills, stockMap);
    setForm((prev) => {
      const defaultOutputDesc = desc ? `${desc} (Combed)` : '';
      const updatedOutput = prev.output.map((out, idx) =>
        idx === 0 && (!out.description || out.description === `${prev.input?.description || ''} (Combed)`)
          ? { ...out, description: defaultOutputDesc }
          : out,
      );

      return {
        ...prev,
        input: {
          ...prev.input,
          description: desc,
          avgRate: rateInfo.avgRate > 0 ? String(rateInfo.avgRate) : prev.input.avgRate,
        },
        output: updatedOutput,
      };
    });
  };

  const updateOutput = (index, key, val) => {
    setForm((prev) => {
      const copy = [...prev.output];
      copy[index] = { ...copy[index], [key]: val };
      return { ...prev, output: copy };
    });
  };

  const addOutputRow = () => {
    setForm((prev) => ({
      ...prev,
      output: [
        ...prev.output,
        { description: '', unit: prev.input.unit || 'Rolls', qty: '', allocatedCost: 0, unitCost: 0 },
      ],
    }));
  };

  const removeOutputRow = (index) => {
    setForm((prev) => ({
      ...prev,
      output: prev.output.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    const submission = {
      ...form,
      status: form.status || COMBING_STATUS.IN_PROCESS,
    };

    const err = validateCombingBatch(submission);
    if (err) {
      toast(err.title, err.message, 'warning');
      return;
    }

    setSaving(true);
    try {
      await saveCombingBatchRecord(submission);
      toast('Batch Saved', `Combing Batch #${submission.batchId} saved successfully.`, 'success');
      onSaved?.();
      onClose();
    } catch (e) {
      toast('Save Failed', e.message || 'An error occurred while saving the batch.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const matchedInputStock = stockMap.get(form.input?.description?.trim() || '');

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-brand-600" />
          <span>
            {initialBatch ? `Edit Combing Batch #${form.batchId}` : 'New Combing & Processing Batch'}
          </span>
          <Badge
            tone={form.status === COMBING_STATUS.COMPLETED ? 'success' : 'warning'}
            className="ml-2 font-mono text-xs"
          >
            {form.status === COMBING_STATUS.COMPLETED ? 'Completed' : 'In Process'}
          </Badge>
        </div>
      }
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:border-0 sm:bg-transparent sm:p-0">
            {totals.totalBatchCost > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-500">Estimated Batch Value:</span>
                <strong className="font-mono text-base font-extrabold text-indigo-900">
                  {rupees(totals.totalBatchCost)}
                </strong>
                <span className="text-slate-400">|</span>
                <span className="font-medium text-slate-500">Cost / Unit:</span>
                <strong className="font-mono text-sm font-bold text-slate-800">
                  {rupees(totals.costPerUnitBeforeLoss)}
                </strong>
              </div>
            ) : (
              <span className="text-xs text-slate-500">
                Enter fabric quantity and combing charges to compute batch cost
              </span>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={saving}
              className="justify-center py-2 text-slate-600 hover:text-slate-900 sm:py-1.5"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={Save}
              loading={saving}
              onClick={handleSave}
              className="justify-center px-5 py-2 text-xs font-semibold sm:py-1.5 sm:text-sm"
            >
              Save Batch
            </Button>
          </div>
        </div>
      }
    >
      <div className="max-h-[75vh] space-y-6 overflow-y-auto px-1 pr-2">
        {/* Top: Batch Basic Info */}
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <TextField
            label="Batch Number *"
            value={form.batchId}
            onChange={(v) => updateField('batchId', v)}
            placeholder="e.g. CB-001"
            className="font-mono font-semibold"
          />
          <DateField
            label="Batch Date *"
            value={form.batchDate}
            onChange={(v) => updateField('batchDate', v)}
          />
        </div>

        {/* Processor & Mill (with Directory Autocomplete & Autofill) */}
        <ProcessorPicker
          processors={processors}
          processorName={form.processorName}
          ownerName={form.processorOwner}
          phone={form.processorPhone}
          address={form.processorAddress}
          onSelect={handleSelectProcessor}
          onProcessorNameChange={(v) => updateField('processorName', v)}
        />

        {/* Section 1: Raw Material Issued (Dyed Fabric from stock) */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-brand-600" />
              <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase">
                1. Material Issued for Combing & Processing
              </h3>
            </div>
            {matchedInputStock && (
              <span className="text-xs text-slate-500">
                In Stock:{' '}
                <strong
                  className={cn(
                    'font-mono font-bold',
                    matchedInputStock.available > 0 ? 'text-emerald-700' : 'text-rose-600',
                  )}
                >
                  {matchedInputStock.available} Qty
                </strong>
              </span>
            )}
          </div>

          <div className="space-y-3">
            {/* Dyed Fabric Product Selection */}
            <div>
              <ProductDescriptionInput
                label="Dyed / Colored Fabric Description *"
                value={form.input.description}
                onChange={handleInputDescriptionChange}
                shortcuts={shortcuts}
                stockMap={stockMap}
                placeholder="Type or pick dyed fabric sent for combing..."
              />
            </div>

            {/* Average Purchase / Manufactured Rate Banner */}
            {form.input.description?.trim() && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 transition">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 shrink-0 text-amber-600" />
                    <div>
                      <span className="font-semibold text-slate-700">Calculated Average Fabric Cost: </span>
                      <strong className="font-mono text-sm font-extrabold text-amber-950">
                        {rupees(fabricRateDetails.avgRate || form.input.avgRate || 0)}
                      </strong>
                      <span className="text-slate-500"> / qty</span>
                      {fabricRateDetails.sourcesCount > 0 && (
                        <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          From {fabricRateDetails.sourcesCount}{' '}
                          {fabricRateDetails.sourcesCount === 1 ? 'batch / source' : 'batches / sources'}
                        </span>
                      )}
                    </div>
                  </div>

                  {fabricRateDetails.history.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHistoryBreakdown((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline hover:text-brand-900"
                    >
                      <span>{showHistoryBreakdown ? 'Hide Source Details' : 'View Source History'}</span>
                      {showHistoryBreakdown ? (
                        <ChevronUp className="size-3.5" />
                      ) : (
                        <ChevronDown className="size-3.5" />
                      )}
                    </button>
                  )}
                </div>

                {/* History Breakdown Table */}
                {showHistoryBreakdown && fabricRateDetails.history.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200/80 bg-white">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-amber-200 bg-amber-100/60 font-bold text-amber-950">
                          <th className="p-2">Batch / Supplier</th>
                          <th className="p-2">Date</th>
                          <th className="p-2 text-right">Quantity</th>
                          <th className="p-2 text-right">Cost / Unit</th>
                          <th className="p-2 text-right">Total Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                        {fabricRateDetails.history.map((h, idx) => (
                          <tr key={idx} className="hover:bg-amber-50/40">
                            <td className="p-2 font-sans font-medium text-slate-900">{h.sourceName}</td>
                            <td className="p-2 text-[11px] text-slate-500">{h.date || '—'}</td>
                            <td className="p-2 text-right">{h.qty}</td>
                            <td className="p-2 text-right">{rupees(h.rate)}</td>
                            <td className="p-2 text-right font-semibold">{rupees(h.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-amber-300 bg-amber-50 font-bold text-amber-950">
                          <td className="p-2" colSpan={2}>
                            Weighted Average ({fabricRateDetails.totalQty} Units)
                          </td>
                          <td className="p-2 text-right font-mono">{fabricRateDetails.totalQty}</td>
                          <td className="p-2 text-right font-mono text-emerald-800">
                            {rupees(fabricRateDetails.avgRate)}
                          </td>
                          <td className="p-2 text-right font-mono">{rupees(fabricRateDetails.totalCost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Quantity, Rate and Combing Cost */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NumberField
                label="Fabric Quantity Dispatched *"
                value={form.input.qty}
                onChange={(v) => updateInput('qty', v)}
                placeholder="0"
                min={0}
              />

              <NumberField
                label="Average Fabric Rate (₹ / Unit)"
                value={form.input.avgRate}
                onChange={(v) => updateInput('avgRate', v)}
                placeholder={String(fabricRateDetails.avgRate || '0.00')}
                min={0}
              />

              <NumberField
                label="Combing & Processing Charge (₹ / Unit) *"
                value={form.input.processingRate}
                onChange={(v) => updateInput('processingRate', v)}
                placeholder="0.00"
                min={0}
              />
            </div>

            {/* Financial Summary Strip */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3 sm:text-left">
                <div>
                  <span className="block text-slate-500">Total Fabric Value</span>
                  <span className="font-mono text-sm font-bold text-slate-800">
                    {rupees(totals.totalFabricCost)}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500">Total Combing Charges</span>
                  <span className="font-mono text-sm font-bold text-indigo-700">
                    {rupees(totals.totalProcessingCost)}
                  </span>
                </div>
                <div>
                  <span className="block text-slate-500">Combined Total Cost</span>
                  <span className="font-mono text-sm font-extrabold text-emerald-800">
                    {rupees(totals.totalBatchCost)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Expected Output Specification */}
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-600" />
              <h3 className="text-xs font-bold tracking-wider text-slate-800 uppercase">
                2. Finished Combed Goods Specification
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              Weight loss measured upon completion
            </span>
          </div>

          <div className="space-y-3">
            {form.output.map((out, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <ProductDescriptionInput
                    label={idx === 0 ? 'Finished Combed Product Name *' : 'Additional Product'}
                    value={out.description}
                    onChange={(v) => updateOutput(idx, 'description', v)}
                    shortcuts={shortcuts}
                    stockMap={stockMap}
                    placeholder="e.g. Cotton Combed Navy Blue"
                  />
                </div>
                {form.output.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeOutputRow(idx)}
                    className="mb-0.5 rounded-lg p-2.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Remove product"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between pt-1">
              <Button
                variant="ghost"
                size="sm"
                icon={Plus}
                onClick={addOutputRow}
                className="text-xs font-semibold text-brand-700"
              >
                Add Another Product
              </Button>
            </div>

            {/* Note regarding weight loss */}
            <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900">
              <Info className="mt-0.5 size-4 shrink-0 text-indigo-600" />
              <span>
                <strong>Note on Weight Loss:</strong> Weight loss cannot be predicted at dispatch. When the
                fabric returns from the combing mill, click the <strong>Complete</strong> button on the batch
                card to record the actual weight loss % or finished quantity received. True manufactured cost
                will be calculated automatically and updated to stock.
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Notes / Special Instructions */}
        <div className="space-y-1">
          <TextField
            label="Notes / Special Instructions"
            value={form.notes}
            onChange={(v) => updateField('notes', v)}
            placeholder="e.g. 30s combed count, special enzyme wash, delivery by Friday..."
          />
        </div>
      </div>
    </Modal>
  );
}
