import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, Modal, NumberField } from '@/ui';

import { parseOpeningStockQty, parseOpeningStockRolls } from './stocksLogic';

const FORM_ID = 'opening-stock-form';

/**
 * The original "Set Opening / Old Stock" prompt, plus an optional roll count. `row` = product being edited (null =
 * closed). `onSave(description, qty, rolls)` persists and shows the result toast; this sheet closes itself via `onClose`.
 */
export default function OpeningStockModal({ row, onClose, onSave }) {
  const [value, setValue] = useState('0');
  const [rolls, setRolls] = useState('');
  const [error, setError] = useState();
  const [rollsError, setRollsError] = useState();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (row) {
      setValue(String(row.opening));
      setRolls(row.openingRolls ? String(row.openingRolls) : '');
      setError(undefined);
      setRollsError(undefined);
    }
  }, [row]);

  const submit = async () => {
    if (!row) return;
    const parsed = parseOpeningStockQty(value);
    const parsedRolls = parseOpeningStockRolls(rolls);
    if ('error' in parsed || 'error' in parsedRolls) {
      setError(parsed.error);
      setRollsError(parsedRolls.error);
      return;
    }
    setSaving(true);
    try {
      await onSave(row.description, parsed.qty, parsedRolls.rolls);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={row !== null}
      onClose={saving ? undefined : onClose}
      title="Set Opening / Old Stock"
      size="sm"
      footer={
        <>
          <Button variant="neutral" onClick={onClose} disabled={saving} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="success"
            icon={Save}
            loading={saving}
            className="max-sm:flex-1"
          >
            Save
          </Button>
        </>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="mb-4 rounded-xl bg-gold-50/60 px-3.5 py-2.5 text-sm text-slate-700 ring-1 ring-gold-100">
          Enter opening stock quantity for &quot;
          <span className="font-semibold text-brand-800">{row?.description ?? ''}</span>&quot;
        </p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Quantity"
            value={value}
            allowNegative
            error={error}
            onChange={(v) => {
              setValue(v);
              setError(undefined);
            }}
          />
          <NumberField
            label="Rolls (optional)"
            value={rolls}
            wholeNumber
            error={rollsError}
            onChange={(v) => {
              setRolls(v);
              setRollsError(undefined);
            }}
          />
        </div>
      </form>
    </Modal>
  );
}
