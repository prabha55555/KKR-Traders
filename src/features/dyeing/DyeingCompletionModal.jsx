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
import { Badge, Button, Modal, NumberField, TextField, useFeedback } from '@/ui';

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

    const initialOutputs =
      Array.isArray(batch.output) && batch.output.length > 0
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
        'Please enter at least one finished colored fabric with quantity received.',
        'warning',
      );
      return;
    }

    const totalSumOutputQty = round3(validOutputs.reduce((sum, o) => sum + toNum(o.qty), 0));

    const calculatedLossPct =
      inputQty > 0
        ? round2(Math.max(0, ((inputQty - totalSumOutputQty) / inputQty) * 100))
        : toNum(weightLossPct);

    const calculatedUnitCost =
      totalSumOutputQty > 0 ? round2(totalBatchCost / totalSumOutputQty) : finalAdjustedUnitCost;

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
        <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-600">
            {actualFinishedQty > 0 ? (
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-slate-500">Final Manufactured Cost:</span>
                <strong className="font-mono text-base font-extrabold text-emerald-800">
                  {rupees(finalAdjustedUnitCost)}
                </strong>
                <span className="text-slate-500">/ qty</span>
              </div>
            ) : (
              <span className="font-medium text-amber-700">
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
              className="px-5 py-2 text-xs font-semibold sm:text-sm"
            >
              Complete Batch & Receive Stock
            </Button>
          </div>
        </div>
      }
    >
      <div className="max-h-[75vh] space-y-5 overflow-y-auto px-1 pr-1.5 text-sm text-slate-800">
        {/* Step 1: Dispatched Batch Summary Card */}
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 text-xs">
            <div>
              <span className="font-semibold text-slate-500">Processor / Dye House: </span>
              <strong className="font-bold text-slate-900">{batch.processorName}</strong>
            </div>
            <div className="font-mono text-slate-500">Dispatched: {batch.batchDate}</div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="text-[10px] font-semibold text-slate-400 uppercase">Raw Grey Sent</div>
              <div className="mt-0.5 font-mono font-bold text-slate-900">{inputQty} Qty</div>
              <div className="font-mono text-[10px] text-slate-500">@{rupees(avgGreyRate)}/qty</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="text-[10px] font-semibold text-slate-400 uppercase">Raw Grey Cost</div>
              <div className="mt-0.5 font-mono font-bold text-amber-900">{rupees(totalGreyCost)}</div>
              <div className="text-[10px] text-slate-400">Material value</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="text-[10px] font-semibold text-slate-400 uppercase">Dyeing Charges</div>
              <div className="mt-0.5 font-mono font-bold text-indigo-700">+{rupees(totalDyeingCost)}</div>
              <div className="font-mono text-[10px] text-slate-500">@{rupees(dyeingRate)}/qty</div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="text-[10px] font-semibold text-slate-400 uppercase">Total Batch Cost</div>
              <div className="mt-0.5 font-mono font-bold text-slate-900">={rupees(totalBatchCost)}</div>
              <div className="font-mono text-[10px] text-slate-500">
                ({rupees(costBeforeLoss)}/qty before loss)
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Record Actual Weight Loss & Finished Received Quantity */}
        <div className="space-y-3.5 rounded-xl border border-amber-300 bg-amber-50/50 p-4 shadow-2xs">
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-amber-700" />
            <h3 className="text-sm font-bold tracking-wider text-amber-950 uppercase">
              Step 1: Record Actual Weight Loss on Return
            </h3>
          </div>

          <p className="text-xs text-amber-900/80">
            Now that the fabric has returned from dyeing, measure the returned cloth. Entering either the
            <strong> Actual Weight Loss %</strong> or the <strong>Finished Quantity</strong> will
            automatically calculate the other.
          </p>

          <div className="grid grid-cols-1 gap-3.5 rounded-lg border border-amber-200 bg-white p-3.5 shadow-2xs sm:grid-cols-2">
            <div>
              <NumberField
                label="Actual Weight Loss (%) *"
                value={weightLossPct}
                onChange={handleWeightLossChange}
                placeholder="e.g. 5"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
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
              <span className="mt-1 block text-[11px] text-slate-500">
                Total weighed quantity delivered by processor
              </span>
            </div>
          </div>

          {/* Dynamic Automatic Recalculation Strip */}
          <div className="space-y-2 rounded-lg bg-gradient-to-r from-slate-900 to-brand-950 p-3.5 text-white shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-amber-300 uppercase">
              <span>Automatic Finished Cost Recalculation</span>
              <span className="font-mono text-emerald-400">
                {rupees(totalBatchCost)} ÷ {actualFinishedQty || inputQty} units
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded bg-white/10 p-2">
                <div className="text-[10px] text-slate-300">Weight Loss Deduction</div>
                <div className="mt-0.5 font-mono font-bold text-amber-300">
                  {lossUnits > 0 ? `-${lossUnits} units` : '0 units'}
                </div>
                <div className="text-[10px] text-slate-400">({weightLossPct || 0}% loss)</div>
              </div>

              <div className="rounded bg-white/10 p-2">
                <div className="text-[10px] text-slate-300">Finished Goods Yield</div>
                <div className="mt-0.5 font-mono font-bold text-white">
                  {actualFinishedQty > 0 ? `${actualFinishedQty} Qty` : '-'}
                </div>
                <div className="text-[10px] text-slate-400">surviving output</div>
              </div>

              <div className="rounded border border-emerald-400/30 bg-emerald-500/20 p-2">
                <div className="text-[10px] font-semibold text-emerald-200">Final Adjusted Cost / Qty</div>
                <div className="mt-0.5 font-mono text-sm font-black text-emerald-300">
                  {rupees(finalAdjustedUnitCost)}
                </div>
                <div className="text-[10px] text-emerald-200">added to stock</div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3: Finished Goods Allocation (Into Stock) */}
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-700" />
              <h3 className="text-sm font-bold tracking-wider text-emerald-950 uppercase">
                Step 2: Finished Goods to Receive into Stock
              </h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={Plus}
              onClick={addOutputRow}
              className="h-7 px-2 text-xs"
            >
              Add Multiple Colors
            </Button>
          </div>

          <div className="space-y-2">
            {outputs.map((out, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 items-center gap-2 rounded-lg border border-emerald-100 bg-white p-3 shadow-2xs sm:grid-cols-12"
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
                <div className="pr-2 text-right sm:col-span-2">
                  <div className="text-xs font-bold text-emerald-800 tabular-nums">
                    {rupees(finalAdjustedUnitCost)} / qty
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Allocated: {rupees(round2(toNum(out.qty) * finalAdjustedUnitCost))}
                  </div>
                </div>
                <div className="flex justify-end sm:col-span-1">
                  {outputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOutputRow(idx)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
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
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-100/70 p-2.5 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
            <div>
              <strong>Inventory Receipt: </strong>
              Upon completion, {actualFinishedQty > 0 ? actualFinishedQty : 0} units of finished colored
              fabric will be received into live inventory at{' '}
              <strong>{rupees(finalAdjustedUnitCost)}/unit</strong>. Raw grey fabric ({inputQty} units) will
              remain deducted as consumed.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
