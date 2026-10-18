import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Layers,
  Package,
  Plus,
  Scale,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ProductDescriptionInput } from '@/components/bill';
import { formatCurrency, toNum } from '@/core/format';
import {
  Badge,
  Button,
  Modal,
  NumberField,
  TextField,
  useFeedback,
} from '@/ui';

import { COMBING_STATUS, calcCombingBatchTotals } from './combingLogic';
import { saveCombingBatchRecord } from './combingService';

const rupees = (n) => `₹${formatCurrency(n)}`;
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

export function CombingCompletionModal({
  open,
  onClose,
  batch,
  shortcuts = [],
  stockMap = new Map(),
  onCompleted,
}) {
  const { toast } = useFeedback();

  const [saving, setSaving] = useState(false);
  const [weightLossPct, setWeightLossPct] = useState('');
  const [finishedQty, setFinishedQty] = useState('');
  const [outputs, setOutputs] = useState([]);

  // Initialize modal state when opened with a batch
  useEffect(() => {
    if (!open || !batch) return;

    const inputQty = toNum(batch.input?.qty);
    const existingLoss = toNum(batch.weightLossPct || batch.input?.weightLossPct);
    const existingOutputQty = toNum(batch.totalOutputQty);

    let initialLoss = existingLoss > 0 ? String(existingLoss) : '';
    let initialQty = '';

    if (existingOutputQty > 0) {
      initialQty = String(existingOutputQty);
      if (!initialLoss && inputQty > 0) {
        initialLoss = String(round2(((inputQty - existingOutputQty) / inputQty) * 100));
      }
    } else if (existingLoss > 0 && inputQty > 0) {
      initialQty = String(round3(inputQty * (1 - existingLoss / 100)));
    }

    setWeightLossPct(initialLoss);
    setFinishedQty(initialQty);

    const initialOutputs =
      Array.isArray(batch.output) && batch.output.length > 0
        ? batch.output.map((o) => ({ ...o, qty: o.qty || initialQty }))
        : [
            {
              description: batch.input?.description ? `${batch.input.description} (Combed)` : '',
              unit: batch.input?.unit || 'Rolls',
              qty: initialQty,
              allocatedCost: 0,
              unitCost: 0,
            },
          ];

    setOutputs(initialOutputs);
  }, [open, batch]);

  const inputQty = toNum(batch?.input?.qty);
  const fabricRate = toNum(batch?.input?.avgRate || batch?.input?.rate);
  const totalFabricCost = round2(inputQty * fabricRate);
  const processingRate = toNum(batch?.processingRate || batch?.input?.processingRate);
  const totalProcessingCost = round2(inputQty * processingRate);
  const totalBatchCost = round2(totalFabricCost + totalProcessingCost);
  const costBeforeLoss = round2(fabricRate + processingRate);

  // Bidirectional sync between Weight Loss % and Finished Quantity
  const handleWeightLossChange = (pctVal) => {
    setWeightLossPct(pctVal);
    const pct = toNum(pctVal);
    if (inputQty > 0 && pctVal !== '') {
      const computedQty = round3(Math.max(0, inputQty * (1 - pct / 100)));
      setFinishedQty(String(computedQty));
      // Sync into first output line if only 1 output exists
      setOutputs((prev) => {
        if (prev.length <= 1) {
          return [
            {
              ...prev[0],
              qty: String(computedQty),
            },
          ];
        }
        return prev;
      });
    }
  };

  const handleFinishedQtyChange = (qtyVal) => {
    setFinishedQty(qtyVal);
    const qty = toNum(qtyVal);
    if (inputQty > 0 && qtyVal !== '') {
      const computedLossPct = round2(Math.max(0, ((inputQty - qty) / inputQty) * 100));
      setWeightLossPct(String(computedLossPct));
      // Sync into first output line if only 1 output exists
      setOutputs((prev) => {
        if (prev.length <= 1) {
          return [
            {
              ...prev[0],
              qty: qtyVal,
            },
          ];
        }
        return prev;
      });
    }
  };

  // Live Recalculations
  const actualFinishedQty = toNum(finishedQty);
  const lossUnits = round3(Math.max(0, inputQty - actualFinishedQty));
  const finalAdjustedUnitCost =
    actualFinishedQty > 0 ? round2(totalBatchCost / actualFinishedQty) : costBeforeLoss;

  const updateOutputField = (index, key, val) => {
    setOutputs((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [key]: val };
      return copy;
    });
  };

  const addOutputRow = () => {
    setOutputs((prev) => [
      ...prev,
      {
        description: '',
        unit: batch?.input?.unit || 'Rolls',
        qty: '',
        allocatedCost: 0,
        unitCost: finalAdjustedUnitCost,
      },
    ]);
  };

  const removeOutputRow = (index) => {
    setOutputs((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCompleteSubmit = async () => {
    const validOutputs = outputs.filter((o) => o.description?.trim() && toNum(o.qty) > 0);

    if (validOutputs.length === 0) {
      toast(
        'Finished Goods Required',
        'Please enter at least one finished combed product with quantity received.',
        'warning',
      );
      return;
    }

    setSaving(true);
    try {
      const enrichedBatch = {
        ...batch,
        status: COMBING_STATUS.COMPLETED,
        completedAt: new Date().toISOString(),
        processingRate,
        weightLossPct: toNum(weightLossPct),
        input: {
          ...batch.input,
          weightLossPct: toNum(weightLossPct),
        },
        output: validOutputs.map((o) => ({
          ...o,
          unitCost: finalAdjustedUnitCost,
          allocatedCost: round2(toNum(o.qty) * finalAdjustedUnitCost),
        })),
      };

      await saveCombingBatchRecord(enrichedBatch);
      toast(
        'Batch Completed & Stock Updated',
        `Batch #${batch.batchId} marked complete. ${actualFinishedQty} units added to finished stock at ${rupees(finalAdjustedUnitCost)}/unit.`,
        'success',
      );
      onCompleted?.();
      onClose();
    } catch (err) {
      toast('Completion Failed', err.message || 'Could not complete combing batch.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!batch) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <span>Complete Combing Batch #{batch.batchId}</span>
          <Badge tone="brand" className="text-xs">
            {batch.processorName}
          </Badge>
        </div>
      }
      footer={
        <div className="flex flex-col gap-3 w-full sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs text-slate-500 font-medium">Recalculated Finished Unit Cost:</div>
            <div className="font-mono text-lg font-extrabold text-emerald-800">
              {rupees(finalAdjustedUnitCost)}{' '}
              <span className="text-xs font-normal text-slate-500">/ unit</span>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              loading={saving}
              onClick={handleCompleteSubmit}
              className="bg-emerald-700 hover:bg-emerald-800 font-semibold"
            >
              Complete Batch & Receive Stock
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 max-h-[75vh] overflow-y-auto px-1 pr-2">
        {/* Dispatched Goods Summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Batch Dispatch Summary
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-slate-700 font-sans">
            <div>
              <span className="text-slate-500 block">Input Fabric:</span>
              <strong className="text-slate-900 block truncate">{batch.input?.description}</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Quantity Sent:</span>
              <strong className="font-mono text-slate-900 text-sm">
                {inputQty} Qty
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Fabric Avg Cost:</span>
              <strong className="font-mono text-slate-900">{rupees(fabricRate)} / qty</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Combing Charges:</span>
              <strong className="font-mono text-indigo-700">{rupees(processingRate)} / qty</strong>
            </div>
          </div>
        </div>

        {/* Weight Loss & Actual Yield Section */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-amber-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Measure Actual Return & Weight Loss
            </h3>
          </div>

          <p className="text-xs text-amber-900 leading-relaxed">
            Enter either the <strong>actual finished quantity</strong> received or the{' '}
            <strong>weight loss percentage</strong>. The other value and the final unit cost will be
            recalculated automatically.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <NumberField
              label="Actual Finished Qty Received *"
              value={finishedQty}
              onChange={handleFinishedQtyChange}
              placeholder="e.g. 95"
              min={0}
              className="bg-white font-mono font-bold text-base"
            />

            <NumberField
              label="Actual Weight Loss %"
              value={weightLossPct}
              onChange={handleWeightLossChange}
              placeholder="e.g. 5.0"
              min={0}
              max={100}
              className="bg-white font-mono font-bold text-base"
            />
          </div>

          {/* Loss Summary Box */}
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-white p-3 text-center text-xs border border-amber-200 font-mono">
            <div>
              <span className="text-slate-500 block text-[11px] font-sans">Initial Sent</span>
              <span className="font-bold text-slate-800">{inputQty} Units</span>
            </div>
            <div>
              <span className="text-amber-800 block text-[11px] font-sans">Loss / Shrinkage</span>
              <span className="font-bold text-amber-700">
                {lossUnits} Units ({weightLossPct || 0}%)
              </span>
            </div>
            <div>
              <span className="text-emerald-800 block text-[11px] font-sans">Net Finished Yield</span>
              <span className="font-bold text-emerald-800">{actualFinishedQty} Units</span>
            </div>
          </div>
        </div>

        {/* Cost Recalculation Breakdown */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-emerald-700" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                True Cost Recalculation
              </h3>
            </div>
            <span className="text-xs font-semibold text-emerald-800 font-mono">
              Total Batch: {rupees(totalBatchCost)}
            </span>
          </div>

          <div className="space-y-1.5 text-xs text-slate-700 font-mono">
            <div className="flex justify-between">
              <span className="font-sans text-slate-600">Dispatched Fabric Value ({inputQty} × {rupees(fabricRate)}):</span>
              <span>{rupees(totalFabricCost)}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-sans text-slate-600">Combing & Processing Cost ({inputQty} × {rupees(processingRate)}):</span>
              <span>{rupees(totalProcessingCost)}</span>
            </div>
            <div className="flex justify-between border-t border-emerald-200/80 pt-1.5 font-bold">
              <span className="font-sans text-slate-800">Total Incurred Cost:</span>
              <span>{rupees(totalBatchCost)}</span>
            </div>
            <div className="flex justify-between text-emerald-900 font-bold border-t border-emerald-300 pt-1.5 text-sm">
              <span className="font-sans">
                Final Finished Unit Cost ({rupees(totalBatchCost)} ÷ {actualFinishedQty || 1} qty):
              </span>
              <span className="font-extrabold">{rupees(finalAdjustedUnitCost)} / qty</span>
            </div>
          </div>
        </div>

        {/* Finished Goods Stock Update */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-brand-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Finished Combed Goods to Add to Stock
              </h3>
            </div>
          </div>

          <div className="space-y-3">
            {outputs.map((out, idx) => (
              <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-6">
                  <ProductDescriptionInput
                    label={idx === 0 ? 'Product Description in Stock *' : 'Additional Product'}
                    value={out.description}
                    onChange={(v) => updateOutputField(idx, 'description', v)}
                    shortcuts={shortcuts}
                    stockMap={stockMap}
                    placeholder="e.g. Cotton Combed Navy Blue"
                  />
                </div>
                <div className="sm:col-span-3">
                  <NumberField
                    label="Finished Quantity *"
                    value={out.qty}
                    onChange={(v) => updateOutputField(idx, 'qty', v)}
                    placeholder="0"
                    min={0}
                  />
                </div>
                <div className="sm:col-span-3 flex items-center gap-2">
                  <div className="flex-1">
                    <TextField
                      label="Cost / Qty (₹)"
                      value={rupees(finalAdjustedUnitCost)}
                      readOnly
                      className="font-mono text-emerald-800 font-bold"
                    />
                  </div>
                  {outputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOutputRow(idx)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition mb-0.5"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
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
                Split Across Another Product
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
