/**
 * ReturnItemEditor – one line of the return sheet: product picker (invoice products or a custom one),
 * rolls (optional roll count, for the stock), qty, rate, read-only amount, reason. Used by ReturnSheet.
 *
 * Props: index (0-based) · item (ReturnDraftItem, see lib/returns.js) · products (invoice product lines) ·
 *        returnedQty (Map description -> qty already returned) · onChange(nextItem) · onRemove().
 */
import { X } from 'lucide-react';
import { formatCurrency } from '@/core/format';
import { IconButton, NumberField, SelectField, TextField } from '@/ui';
import { chooseReturnProduct, returnItemAmount } from '../lib/returns';

const rs = (n) => `₹${formatCurrency(n)}`;

const choiceToValue = (choice) => (choice === null ? '' : String(choice));
const valueToChoice = (value) => (value === '' ? null : value === 'custom' ? 'custom' : Number(value));

const cleanQty = (qty) => {
  const n = Number(qty);
  return Number.isFinite(n) ? Number(n.toFixed(3)).toString() : '0';
};

export function ReturnItemEditor({ index, item, products, returnedQty, onChange, onRemove }) {
  const selected = typeof item.choice === 'number' ? products[item.choice] : undefined;
  const alreadyReturned = selected ? (returnedQty.get(selected.description) ?? 0) : 0;
  return (
    <fieldset className="mb-3 space-y-2.5 rounded-2xl border border-line bg-slate-50/70 p-3 sm:p-3.5">
      <legend className="sr-only">Return item {index + 1}</legend>
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-display text-sm font-bold text-brand-800">
          <span className="flex size-6 items-center justify-center rounded-md bg-gold-100 text-xs font-extrabold text-gold-700 ring-1 ring-gold-200">
            {index + 1}
          </span>
          Return Item {index + 1}
        </h4>
        <IconButton
          icon={X}
          variant="outlineDanger"
          label={`Remove return item ${index + 1}`}
          onClick={onRemove}
        />
      </div>

      <SelectField
        label="Product Description"
        value={choiceToValue(item.choice)}
        onChange={(v) => onChange(chooseReturnProduct(item, valueToChoice(v), products))}
      >
        <option value="">-- Select Product --</option>
        {products.map((p, i) => {
          const qtyStr = cleanQty(p.qty);
          return (
            <option key={`${i}-${p.description}`} value={String(i)}>
              {`${p.description} (Avail: ${qtyStr})`}
            </option>
          );
        })}
        <option value="custom">-- Enter Custom Product --</option>
      </SelectField>

      {selected ? (
        <div className="flex flex-wrap items-center justify-between gap-1 rounded-xl border border-gold-200 bg-gold-50/70 px-2.5 py-1.5 text-xs text-brand-900">
          <span className="max-w-full truncate font-semibold">{selected.description}</span>
          <span className="text-slate-600">
            Available: <strong className="font-bold text-brand-900">{cleanQty(selected.qty)}</strong> · Rate:{' '}
            <strong className="font-bold text-brand-900">{rs(selected.rate)}</strong>
          </span>
        </div>
      ) : null}

      {item.choice === 'custom' ? (
        <TextField
          placeholder="Enter custom product"
          aria-label="Custom product description"
          value={item.custom}
          onChange={(custom) => onChange({ ...item, custom })}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
        <NumberField
          label="Rolls"
          value={item.rolls ?? ''}
          wholeNumber
          onChange={(rolls) => onChange({ ...item, rolls })}
          className="min-w-0"
        />
        <NumberField
          label="Qty"
          value={item.qty}
          onChange={(qty) => onChange({ ...item, qty })}
          className="min-w-0"
        />
        <NumberField
          label="Rate (₹)"
          value={item.rate}
          onChange={(rate) => onChange({ ...item, rate })}
          className="min-w-0"
        />
        <NumberField
          label="Amount (₹)"
          value={returnItemAmount(item).toFixed(2)}
          onChange={() => undefined}
          readOnly
          className="min-w-0"
        />
      </div>
      {alreadyReturned > 0 ? (
        <p className="text-xs text-slate-500">Already returned: {cleanQty(alreadyReturned)}</p>
      ) : null}
      <TextField
        label="Reason"
        placeholder="Reason for return"
        value={item.reason}
        onChange={(reason) => onChange({ ...item, reason })}
      />
    </fieldset>
  );
}
