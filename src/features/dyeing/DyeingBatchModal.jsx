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
  DYEING_STATUS,
  calcBatchTotals,
  computeGreyPurchaseRate,
  emptyDyeingBatch,
  suggestNextBatchId,
  validateDyeingBatch,
} from './dyeingLogic';
import { saveDyeingBatchRecord } from './dyeingService';
import { DyerPicker } from './DyerPicker';

const rupees = (n) => `₹${formatCurrency(n)}`;

export function DyeingBatchModal({
  open,
  onClose,
  initialBatch = null,
  existingBatches = [],
  shortcuts = [],
  bankAccounts = [],
  stockMap = new Map(),
  purchaseBills = [],
  dyers = [],
  onSaved,
}) {
  const { toast } = useFeedback();
  const [form, setForm] = useState(() => emptyDyeingBatch(todayISO()));
  const [saving, setSaving] = useState(false);
  const [showHistoryBreakdown, setShowHistoryBreakdown] = useState(false);

  const handleSelectDyer = (dyer) => {
    setForm((prev) => ({
      ...prev,
      processorName: dyer.dyeingName || '',
      processorOwner: dyer.ownerName || '',
      processorPhone: dyer.phone || '',
      processorAddress: dyer.address || '',
    }));
    toast('Dyeing Details Loaded', `${dyer.dyeingName} (${dyer.ownerName})`, 'success');
  };

  useEffect(() => {
    if (!open) return;
    if (initialBatch) {
      setForm({
        ...initialBatch,
        input: {
          unit: 'Rolls',
          dyeingRate: '',
          weightLossPct: '',
          ...initialBatch.input,
        },
        expenses: Array.isArray(initialBatch.expenses) ? initialBatch.expenses.map((e) => ({ ...e })) : [],
        output:
          Array.isArray(initialBatch.output) && initialBatch.output.length > 0
            ? initialBatch.output.map((o) => ({ ...o }))
            : [{ description: '', unit: 'Rolls', qty: '', allocatedCost: 0, unitCost: 0 }],
      });
    } else {
      const nextId = suggestNextBatchId(existingBatches);
      const fresh = emptyDyeingBatch(todayISO());
      fresh.batchId = nextId;
      setForm(fresh);
    }
    setShowHistoryBreakdown(false);
  }, [open, initialBatch, existingBatches]);

  // Derive weighted average purchase rate details whenever selected grey fabric changes
  const greyRateDetails = useMemo(() => {
    const desc = form.input?.description?.trim();
    if (!desc) {
      return {
        avgRate: 0,
        totalQty: 0,
        totalCost: 0,
        suppliersCount: 0,
        suppliers: [],
        history: [],
      };
    }
    return computeGreyPurchaseRate(desc, purchaseBills, [], stockMap);
  }, [form.input?.description, purchaseBills, stockMap]);

  const totals = calcBatchTotals(form);

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
    const rateInfo = computeGreyPurchaseRate(desc, purchaseBills, [], stockMap);
    setForm((prev) => {
      return {
        ...prev,
        input: {
          ...prev.input,
          description: desc,
          avgGreyRate: rateInfo.avgRate > 0 ? String(rateInfo.avgRate) : prev.input.avgGreyRate,
        },
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

  // Helper to auto-fill output quantity with expected quantity after weight loss
  const handleAutoFillExpectedQty = (index = 0) => {
    if (totals.expectedOutputQty <= 0) return;
    setForm((prev) => {
      const copy = [...prev.output];
      if (!copy[index]) {
        copy[index] = { description: '', unit: 'Rolls', qty: '', allocatedCost: 0, unitCost: 0 };
      }
      copy[index] = {
        ...copy[index],
        qty: String(totals.expectedOutputQty),
      };
      return { ...prev, output: copy };
    });
    toast(
      'Expected Qty Filled',
      `Set output to ${totals.expectedOutputQty} units (${totals.weightLossPct}% weight loss deducted).`,
      'info',
    );
  };

  const handleSave = async () => {
    const submission = {
      ...form,
      status: form.status || DYEING_STATUS.IN_PROCESS,
    };

    const err = validateDyeingBatch(submission);
    if (err) {
      toast(err.title, err.message, 'warning');
      return;
    }

    setSaving(true);
    try {
      await saveDyeingBatchRecord(submission);
      toast('Batch Saved', `Batch #${submission.batchId} saved successfully.`, 'success');
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
          <span>{initialBatch ? `Edit Batch #${form.batchId}` : 'New Dyeing & Processing Batch'}</span>
          <Badge
            tone={form.status === DYEING_STATUS.COMPLETED ? 'success' : 'warning'}
            className="ml-2 font-mono text-xs"
          >
            {form.status === DYEING_STATUS.COMPLETED ? 'Completed' : 'In Process'}
          </Badge>
        </div>
      }
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:border-0 sm:bg-transparent sm:p-0">
            {totals.adjustedUnitCost > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-500">Finished Unit Cost:</span>
                <strong className="font-mono text-base font-extrabold text-emerald-800">
                  {rupees(totals.avgFinishedUnitCost || totals.adjustedUnitCost)}
                </strong>
                <span className="text-slate-500">/ unit</span>
                {totals.weightLossPct > 0 && (
                  <Badge tone="warning" className="px-1.5 py-0 text-[10px] font-semibold">
                    Includes {totals.weightLossPct}% weight loss
                  </Badge>
                )}
              </div>
            ) : (
              <span className="text-xs text-slate-500">
                Enter grey quantity and dyeing charges to compute finished cost
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
            placeholder="e.g. B-001"
            className="font-mono font-semibold"
          />
          <DateField
            label="Batch Date *"
            value={form.batchDate}
            onChange={(v) => updateField('batchDate', v)}
          />
        </div>

        {/* Dyer & Processing Unit (with Directory Autocomplete & Autofill) */}
        <DyerPicker
          dyers={dyers}
          dyeingName={form.processorName}
          ownerName={form.processorOwner}
          phone={form.processorPhone}
          address={form.processorAddress}
          onSelect={handleSelectDyer}
          onDyeingNameChange={(v) => updateField('processorName', v)}
          onOwnerNameChange={(v) => updateField('processorOwner', v)}
          onPhoneChange={(v) => updateField('processorPhone', v)}
          onAddressChange={(v) => updateField('processorAddress', v)}
        />

        {/* ============================================================== */}
        {/* SECTION 1: RAW MATERIAL ISSUED (GREY FABRIC)                   */}
        {/* ============================================================== */}
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package className="size-4 text-amber-700" />
              <h3 className="text-sm font-bold tracking-wider text-amber-900 uppercase">
                1. Raw Material Issued (Grey Fabric)
              </h3>
            </div>
            {matchedInputStock && (
              <span className="rounded-full border border-amber-200 bg-amber-100/70 px-2 py-0.5 text-xs font-medium text-amber-900">
                Available in stock:{' '}
                <strong className={matchedInputStock.available > 0 ? 'text-emerald-700' : 'text-red-600'}>
                  {matchedInputStock.available} Qty
                </strong>
              </span>
            )}
          </div>

          {/* Row: Product Selection & Issued Qty */}
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-12">
            <div className="sm:col-span-8">
              <ProductDescriptionInput
                label="Grey Fabric Description *"
                value={form.input.description}
                onChange={handleInputDescriptionChange}
                shortcuts={shortcuts}
                stockMap={stockMap}
                placeholder="Select or type raw grey fabric name..."
              />
            </div>
            <div className="sm:col-span-4">
              <NumberField
                label="Quantity Issued *"
                value={form.input.qty}
                onChange={(v) => updateInput('qty', v)}
                placeholder="e.g. 55"
              />
            </div>
          </div>

          {/* Average Purchase Rate Card */}
          <div className="space-y-2 rounded-lg border border-amber-200/90 bg-white p-3 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                  Weighted Average Purchase Rate
                </div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-black text-amber-950">
                    {rupees(totals.greyRate || greyRateDetails.avgRate || 0)}
                  </span>
                  <span className="text-xs font-medium text-slate-500">/ qty</span>
                  {greyRateDetails.suppliersCount > 0 && (
                    <span className="text-xs text-slate-500">
                      (Across {greyRateDetails.suppliersCount} supplier
                      {greyRateDetails.suppliersCount > 1 ? 's' : ''}, {greyRateDetails.totalQty} total qty)
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {greyRateDetails.history.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowHistoryBreakdown((prev) => !prev)}
                    className="h-7 text-xs text-amber-800 hover:bg-amber-50"
                  >
                    {showHistoryBreakdown ? 'Hide Breakdown' : 'View Supplier History'}
                    {showHistoryBreakdown ? (
                      <ChevronUp className="ml-1 size-3.5" />
                    ) : (
                      <ChevronDown className="ml-1 size-3.5" />
                    )}
                  </Button>
                )}
                {/* Fallback rate override if custom adjustment is needed */}
                <div className="w-28">
                  <NumberField
                    label="Rate Override"
                    value={form.input.avgGreyRate}
                    onChange={(v) => updateInput('avgGreyRate', v)}
                    placeholder="Rate (₹)"
                  />
                </div>
              </div>
            </div>

            {/* Expandable Supplier Purchase History Breakdown */}
            {showHistoryBreakdown && greyRateDetails.history.length > 0 && (
              <div className="mt-3 overflow-x-auto border-t border-slate-100 pt-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                  <Info className="size-3.5 text-amber-600" />
                  <span>Purchase Invoices Used for Weighted Average:</span>
                </div>
                <table className="w-full rounded border border-slate-200 text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="p-1.5 font-semibold">Supplier</th>
                      <th className="p-1.5 text-right font-semibold">Quantity</th>
                      <th className="p-1.5 text-right font-semibold">Rate / Unit</th>
                      <th className="p-1.5 text-right font-semibold">Total Cost</th>
                      <th className="p-1.5 text-right font-semibold">Invoice Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {greyRateDetails.history.map((h, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                        <td className="p-1.5 font-medium text-slate-800">{h.supplierName}</td>
                        <td className="p-1.5 text-right font-mono">{h.qty}</td>
                        <td className="p-1.5 text-right font-mono">{rupees(h.rate)}</td>
                        <td className="p-1.5 text-right font-mono font-bold text-slate-700">
                          {rupees(h.amount)}
                        </td>
                        <td className="p-1.5 text-right text-slate-500">{h.date || '-'}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-amber-200 bg-amber-50/50 font-bold text-amber-950">
                      <td className="p-1.5">Total Purchases</td>
                      <td className="p-1.5 text-right font-mono">{greyRateDetails.totalQty}</td>
                      <td className="p-1.5 text-right font-mono text-emerald-800">
                        {rupees(greyRateDetails.avgRate)} avg
                      </td>
                      <td className="p-1.5 text-right font-mono">{rupees(greyRateDetails.totalCost)}</td>
                      <td className="p-1.5 text-right text-slate-400">-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Dyeing Cost Input (& Weight Loss only if completed) */}
          <div className="grid grid-cols-1 items-start gap-3 rounded-lg border border-amber-200/70 bg-white/90 p-3 sm:grid-cols-2">
            <div>
              <NumberField
                label="Dyeing Cost / Unit (₹) *"
                value={form.input.dyeingRate}
                onChange={(v) => updateInput('dyeingRate', v)}
                placeholder="e.g. 20.00"
              />
              <span className="mt-1 block text-[11px] text-slate-500">
                Agreed job work dyeing rate charged by the processor
              </span>
            </div>
            {form.status === DYEING_STATUS.COMPLETED ? (
              <div>
                <NumberField
                  label="Actual Weight Loss (%) *"
                  value={form.input.weightLossPct}
                  onChange={(v) => updateInput('weightLossPct', v)}
                  placeholder="e.g. 5"
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  Measured fabric weight loss percentage on return
                </span>
              </div>
            ) : (
              <div className="mt-1 rounded-lg border border-amber-200/80 bg-amber-50 p-2.5 text-xs text-amber-900 sm:mt-0">
                <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-amber-950">
                  <Info className="size-3.5 text-amber-700" />
                  <span>Weight Loss Measured on Return</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  Weight loss percentage cannot be known in advance. It will be recorded when the dyed fabric
                  returns from the mill upon clicking <strong>Complete</strong>.
                </p>
              </div>
            )}
          </div>

          {/* Dynamic Live Cost Breakdown Strip */}
          <div className="space-y-2.5 rounded-lg bg-gradient-to-r from-amber-900/90 to-slate-900 p-3.5 text-white shadow-sm">
            <div className="flex items-center justify-between text-[11px] font-bold tracking-wider text-amber-200 uppercase">
              <span>
                {form.status === DYEING_STATUS.COMPLETED
                  ? 'Processing Cost & Weight Loss Breakdown'
                  : 'Dispatched Material & Processing Cost'}
              </span>
              {totals.inputQty > 0 && (
                <span className="font-mono text-amber-100">{totals.inputQty} Units Issued</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-4">
              <div className="rounded bg-white/10 p-2">
                <div className="text-[10px] text-slate-300">Raw Grey Cost</div>
                <div className="mt-0.5 font-mono font-bold text-amber-300">
                  {rupees(totals.totalGreyCost)}
                </div>
                <div className="text-[10px] text-slate-400">@{rupees(totals.greyRate)}/u</div>
              </div>
              <div className="rounded bg-white/10 p-2">
                <div className="text-[10px] text-slate-300">Dyeing Charges</div>
                <div className="mt-0.5 font-mono font-bold text-indigo-300">
                  +{rupees(totals.totalDyeingCost)}
                </div>
                <div className="text-[10px] text-slate-400">@{rupees(totals.dyeingRate)}/u</div>
              </div>
              <div className="rounded bg-white/10 p-2">
                <div className="text-[10px] text-slate-300">Total Batch Cost</div>
                <div className="mt-0.5 font-mono font-bold text-white">{rupees(totals.totalBatchCost)}</div>
                <div className="text-[10px] text-slate-400">grey + dyeing</div>
              </div>
              <div className="rounded border border-emerald-400/30 bg-emerald-500/20 p-2">
                <div className="text-[10px] font-semibold text-emerald-200">
                  {form.status === DYEING_STATUS.COMPLETED
                    ? 'Final Finished Cost / Unit'
                    : 'Cost / Unit (Before Loss)'}
                </div>
                <div className="mt-0.5 font-mono text-sm font-black text-emerald-300">
                  {rupees(
                    form.status === DYEING_STATUS.COMPLETED
                      ? totals.avgFinishedUnitCost
                      : totals.costPerUnitBeforeLoss,
                  )}
                </div>
                <div className="text-[10px] text-emerald-200">
                  {form.status === DYEING_STATUS.COMPLETED
                    ? `${totals.weightLossPct || 0}% loss included`
                    : 'Weight loss applied on return'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 2: FINISHED GOODS PRODUCED (COLORED ROLLS)            */}
        {/* ============================================================== */}
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-700" />
              <h3 className="text-sm font-bold tracking-wider text-emerald-900 uppercase">
                2. Finished Goods Produced (Colored Fabric)
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {totals.expectedOutputQty > 0 && form.output.length === 1 && !form.output[0].qty && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={Sparkles}
                  onClick={() => handleAutoFillExpectedQty(0)}
                  className="h-7 border-emerald-300 bg-emerald-50 text-xs text-emerald-800 hover:bg-emerald-100"
                >
                  Use Expected Qty ({totals.expectedOutputQty})
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                icon={Plus}
                onClick={addOutputRow}
                className="h-7 px-2 text-xs"
              >
                Add Finished Fabric
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {totals.enrichedOutput.map((out, idx) => (
              <div
                key={idx}
                className="grid grid-cols-1 items-center gap-2 rounded-lg border border-emerald-100 bg-white p-3 shadow-2xs sm:grid-cols-12"
              >
                <div className="sm:col-span-6">
                  <ProductDescriptionInput
                    value={out.description}
                    onChange={(v) => updateOutput(idx, 'description', v)}
                    shortcuts={shortcuts}
                    stockMap={stockMap}
                    placeholder="Finished fabric description (e.g. Cotton Dyed Navy Blue)"
                  />
                </div>
                <div className="sm:col-span-3">
                  <NumberField
                    value={out.qty}
                    onChange={(v) => updateOutput(idx, 'qty', v)}
                    placeholder={
                      idx === 0 && totals.expectedOutputQty > 0
                        ? `Expected: ${totals.expectedOutputQty}`
                        : 'Finished Qty'
                    }
                  />
                </div>
                <div className="pr-2 text-right sm:col-span-2">
                  <div className="text-xs font-bold text-emerald-800 tabular-nums">
                    {rupees(out.unitCost || totals.adjustedUnitCost)} / qty
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Allocated: {rupees(out.allocatedCost || 0)}
                  </div>
                </div>
                <div className="flex justify-end sm:col-span-1">
                  {totals.enrichedOutput.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOutputRow(idx)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      title="Remove output item"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Finished Goods Output Summary Strip */}
          <div className="flex flex-wrap items-center justify-between rounded-lg border border-emerald-200/80 bg-white/90 p-2.5 text-xs text-slate-600">
            <div>
              Total Finished Qty:{' '}
              <strong className="font-bold text-slate-900">
                {totals.totalOutputQty > 0 ? totals.totalOutputQty : totals.expectedOutputQty} Units
              </strong>
            </div>
            {totals.shrinkageQty > 0 && (
              <div className="font-medium text-amber-800">
                Weight Loss: {totals.shrinkageQty} Units ({totals.shrinkagePct}%)
              </div>
            )}
            <div className="font-bold text-emerald-900">
              Total Finished Stock Value: {rupees(totals.totalBatchCost)}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
