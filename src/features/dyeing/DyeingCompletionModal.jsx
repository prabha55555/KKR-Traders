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

import { DYEING_STATUS, calcBatchTotals } from './dyeingLogic';
import { saveDyeingBatchRecord } from './dyeingService';

const rupees = (n) => `₹${formatCurrency(n)}`;
const round2 = (n) => Math.round(n * 100) / 100;
const round3 = (n) => Math.round(n * 1000) / 1000;

export function DyeingCompletionModal({
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

    const initialOutputs = Array.isArray(batch.output) && batch.output.length > 0
      ? batch.output.map((o) => ({ ...o, qty: o.qty || initialQty }))
      : [
          {
            description: batch.input?.description ? `${batch.input.description} (Dyed)` : '',
            unit: batch.input?.unit || 'Rolls',
            qty: initialQty,
            allocatedCost: 0,
            unitCost: 0,
          },
        ];

    setOutputs(initialOutputs);
  }, [open, batch]);

  const inputQty = toNum(batch?.input?.qty);
  const avgGreyRate = toNum(batch?.input?.avgGreyRate);
  const totalGreyCost = round2(inputQty * avgGreyRate);
  const dyeingRate = toNum(batch?.dyeingRate || batch?.input?.dyeingRate);
  const totalDyeingCost = round2(inputQty * dyeingRate);
  const totalBatchCost = round2(totalGreyCost + totalDyeingCost);
  const costBeforeLoss = round2(avgGreyRate + dyeingRate);

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
  const finalAdjustedUnitCost = actualFinishedQty > 0
    ? round2(totalBatchCost / actualFinishedQty)
    : costBeforeLoss;

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
    const validOutputs = outputs.filter(
      (o) => o.description?.trim() && toNum(o.qty) > 0,
    );

    if (validOutputs.length === 0) {
      toast(
        'Finished Goods Required',
        'Please enter at least one finished colored fabric with quantity received.',
        'warning',
      );
      return;
    }

    const totalSumOutputQty = round3(
      validOutputs.reduce((sum, o) => sum + toNum(o.qty), 0),
    );

    const calculatedLossPct = inputQty > 0
      ? round2(Math.max(0, ((inputQty - totalSumOutputQty) / inputQty) * 100))
      : toNum(weightLossPct);

    const calculatedUnitCost = totalSumOutputQty > 0
      ? round2(totalBatchCost / totalSumOutputQty)
      : finalAdjustedUnitCost;

    const enrichedOutputs = validOutputs.map((o) => {
      const qty = toNum(o.qty);
      const allocatedCost = round2(qty * calculatedUnitCost);
      return {
        ...o,
        unit: o.unit || batch?.input?.unit || 'Rolls',
        qty,
        unitCost: calculatedUnitCost,
        allocatedCost,
      };
    });

    const completedBatch = {
      ...batch,
      status: DYEING_STATUS.COMPLETED,
      completedAt: new Date().toISOString(),
      weightLossPct: calculatedLossPct,
      weightLossQty: round3(Math.max(0, inputQty - totalSumOutputQty)),
      totalOutputQty: totalSumOutputQty,
      avgFinishedUnitCost: calculatedUnitCost,
      totalBatchCost,
      input: {
        ...batch.input,
        weightLossPct: calculatedLossPct,
        weightLossQty: round3(Math.max(0, inputQty - totalSumOutputQty)),
        expectedOutputQty: totalSumOutputQty,
      },
      output: enrichedOutputs,
    };

    setSaving(true);
    try {
      await saveDyeingBatchRecord(completedBatch);
      toast(
        'Batch Completed & Stock Converted!',
        `Received ${totalSumOutputQty} units into finished inventory @ ${rupees(calculatedUnitCost)}/unit.`,
        'success',
      );
      onCompleted?.();
      onClose();
    } catch (err) {
      console.error('Failed to complete dyeing batch:', err);
      toast('Completion Failed', err.message || 'Could not complete batch.', 'error');
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
          <span>Complete Batch #{batch.batchId} — Receive Finished Goods</span>
        </div>
      }
      footer={
        <div className="flex flex-col gap-2.5 w-full sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-600">
            {actualFinishedQty > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">Final Manufactured Cost:</span>
                <strong className="font-mono text-base font-extrabold text-emerald-800">
                  {rupees(finalAdjustedUnitCost)}
                </strong>
                <span className="text-slate-500">/ qty</span>
              </div>
            ) : (
              <span className="text-amber-700 font-medium">
                Enter finished quantity or actual weight loss % to finalize unit cost
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              loading={saving}
              onClick={handleCompleteSubmit}
              className="font-semibold text-xs sm:text-sm py-2 px-5"
            >
              Complete Batch & Receive Stock
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 text-slate-800 text-sm max-h-[75vh] overflow-y-auto px-1 pr-1.5">
        {/* Step 1: Dispatched Batch Summary Card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between text-xs border-b border-slate-200 pb-2">
            <div>
              <span className="font-semibold text-slate-500">Processor / Dye House: </span>
              <strong className="text-slate-900 font-bold">{batch.processorName}</strong>
            </div>
            <div className="text-slate-500 font-mono">Dispatched: {batch.batchDate}</div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Raw Grey Sent</div>
              <div className="font-mono font-bold text-slate-900 mt-0.5">
                {inputQty} Qty
              </div>
              <div className="text-[10px] text-slate-500 font-mono">@{rupees(avgGreyRate)}/qty</div>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Raw Grey Cost</div>
              <div className="font-mono font-bold text-amber-900 mt-0.5">{rupees(totalGreyCost)}</div>
              <div className="text-[10px] text-slate-400">Material value</div>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Dyeing Charges</div>
              <div className="font-mono font-bold text-indigo-700 mt-0.5">+{rupees(totalDyeingCost)}</div>
              <div className="text-[10px] text-slate-500 font-mono">@{rupees(dyeingRate)}/qty</div>
            </div>

            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Batch Cost</div>
              <div className="font-mono font-bold text-slate-900 mt-0.5">={rupees(totalBatchCost)}</div>
              <div className="text-[10px] text-slate-500 font-mono">({rupees(costBeforeLoss)}/qty before loss)</div>
            </div>
          </div>
        </div>

        {/* Step 2: Record Actual Weight Loss & Finished Received Quantity */}
        <div className="rounded-xl border border-amber-300 bg-amber-50/50 p-4 space-y-3.5 shadow-2xs">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-amber-700" />
            <h3 className="text-sm font-bold text-amber-950 uppercase tracking-wider">
              Step 1: Record Actual Weight Loss on Return
            </h3>
          </div>

          <p className="text-xs text-amber-900/80">
            Now that the fabric has returned from dyeing, measure the returned cloth. Entering either the
            <strong> Actual Weight Loss %</strong> or the <strong>Finished Quantity</strong> will automatically
            calculate the other.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-white p-3.5 rounded-lg border border-amber-200 shadow-2xs">
            <div>
              <NumberField
                label="Actual Weight Loss (%) *"
                value={weightLossPct}
                onChange={handleWeightLossChange}
                placeholder="e.g. 5"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Percentage lost during scouring & dyeing
              </span>
            </div>

            <div>
              <NumberField
                label="Actual Finished Quantity Received *"
                value={finishedQty}
                onChange={handleFinishedQtyChange}
                placeholder="e.g. 52.25"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Total weighed quantity delivered by processor
              </span>
            </div>
          </div>

          {/* Dynamic Automatic Recalculation Strip */}
          <div className="rounded-lg bg-gradient-to-r from-slate-900 to-brand-950 p-3.5 text-white shadow-sm space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center justify-between">
              <span>Automatic Finished Cost Recalculation</span>
              <span className="font-mono text-emerald-400">
                {rupees(totalBatchCost)} ÷ {actualFinishedQty || inputQty} units
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white/10 p-2 rounded">
                <div className="text-[10px] text-slate-300">Weight Loss Deduction</div>
                <div className="font-mono font-bold text-amber-300 mt-0.5">
                  {lossUnits > 0 ? `-${lossUnits} units` : '0 units'}
                </div>
                <div className="text-[10px] text-slate-400">({weightLossPct || 0}% loss)</div>
              </div>

              <div className="bg-white/10 p-2 rounded">
                <div className="text-[10px] text-slate-300">Finished Goods Yield</div>
                <div className="font-mono font-bold text-white mt-0.5">
                  {actualFinishedQty > 0 ? `${actualFinishedQty} Qty` : '-'}
                </div>
                <div className="text-[10px] text-slate-400">surviving output</div>
              </div>

              <div className="bg-emerald-500/20 border border-emerald-400/30 p-2 rounded">
                <div className="text-[10px] text-emerald-200 font-semibold">Final Adjusted Cost / Qty</div>
                <div className="font-mono font-black text-emerald-300 text-sm mt-0.5">
                  {rupees(finalAdjustedUnitCost)}
                </div>
                <div className="text-[10px] text-emerald-200">added to stock</div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Finished Goods Allocation (Into Stock) */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-emerald-950 uppercase tracking-wider">
                Step 2: Finished Goods to Receive into Stock
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={addOutputRow}
              className="text-xs h-7 px-2"
            >
              Add Multiple Colors
            </Button>
          </div>

          <div className="space-y-2">
            {outputs.map((out, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-3 rounded-lg border border-emerald-100 shadow-2xs"
              >
                <div className="sm:col-span-6">
                  <ProductDescriptionInput
                    value={out.description}
                    onChange={(v) => updateOutputField(idx, 'description', v)}
                    shortcuts={shortcuts}
                    stockMap={stockMap}
                    placeholder="Finished colored fabric description (e.g. Cotton Dyed Navy Blue)"
                  />
                </div>
                <div className="sm:col-span-3">
                  <NumberField
                    value={out.qty}
                    onChange={(v) => updateOutputField(idx, 'qty', v)}
                    placeholder="Received Qty"
                  />
                </div>
                <div className="sm:col-span-2 text-right pr-2">
                  <div className="text-xs font-bold text-emerald-800 tabular-nums">
                    {rupees(finalAdjustedUnitCost)} / qty
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Allocated: {rupees(round2(toNum(out.qty) * finalAdjustedUnitCost))}
                  </div>
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  {outputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOutputRow(idx)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title="Remove row"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Stock Notification Banner */}
          <div className="flex items-start gap-2 bg-emerald-100/70 border border-emerald-200 text-emerald-900 p-2.5 rounded-lg text-xs">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-700 mt-0.5" />
            <div>
              <strong>Inventory Receipt: </strong>
              Upon completion, {actualFinishedQty > 0 ? actualFinishedQty : 0} units of finished colored fabric
              will be received into live inventory at <strong>{rupees(finalAdjustedUnitCost)}/unit</strong>.
              Raw grey fabric ({inputQty} units) will remain deducted as consumed.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
