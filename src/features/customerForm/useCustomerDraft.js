import { useCallback, useEffect, useState } from 'react';
import { hasErrors } from './customerValidation';
/**
 * Form state shared by the bottom sheet (phones) and the inline card (desktop): the draft, per-field errors and the
 * submit-in-progress flag. The draft restarts from `initial` whenever the form becomes `active` or `initial` is replaced.
 * `onSubmit` resolves with field errors to show, or null when the customer was saved.
 */
export function useCustomerDraft(initial, active, onSubmit) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (active) {
      setDraft(initial);
      setErrors({});
    }
  }, [active, initial]);
  const change = useCallback(
    (field) => (value) => {
      setDraft((d) => ({ ...d, [field]: value }));
      setErrors((e) => ({ ...e, [field]: undefined }));
    },
    [],
  );
  const submit = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onSubmit(draft);
      if (result && hasErrors(result)) setErrors(result);
    } finally {
      setBusy(false);
    }
  }, [busy, draft, onSubmit]);
  return { draft, errors, busy, change, submit };
}
