import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_BUSINESS,
  loadBusiness,
  normalizeBusiness,
  saveBusiness,
  validateBusiness,
} from '@/core/business';
import { useBusiness } from '@/hooks/useBusiness';

/** Every business setting, in the order of DEFAULT_BUSINESS (also the order the form shows them). */
export const BUSINESS_FIELDS = Object.keys(DEFAULT_BUSINESS);

/** The form's copy of the details: every field as a string. */
export const toForm = (values) =>
  Object.fromEntries(BUSINESS_FIELDS.map((k) => [k, String(values?.[k] ?? '')]));

/** Would saving the form change the saved details? (compared as they would be stored: trimmed) */
export function differs(form, saved) {
  const typed = normalizeBusiness(form);
  return BUSINESS_FIELDS.some((k) => typed[k] !== String(saved?.[k] ?? ''));
}

/**
 * State of the business form on the Settings page: reads the SAVED details from the database when the page opens
 * (`ready` once that settled), then edits a copy of them. `save()` validates and stores them; it resolves
 * { ok, error?, errors? } and ignores a second tap while saving.
 *
 * `loadFailed`: the database could not be read, so the form only shows the copy on this device — which may be out of
 * date. Saving is refused then (it would overwrite the real saved details with old ones); `retry()` reads again.
 */
export function useBusinessForm() {
  const saved = useBusiness();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [form, setForm] = useState(() => toForm(saved));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  // The saved details the form was last in step with: when they change (read from the database, saved on another
  // screen) a form the user has not touched follows them; edits in progress are kept.
  const [base, setBase] = useState(saved);
  if (base !== saved) {
    setBase(saved);
    if (!differs(form, base)) setForm(toForm(saved));
  }

  const alive = useRef(true);
  const read = useCallback(async () => {
    const result = await loadBusiness().catch(() => ({ ok: false }));
    if (!alive.current) return result;
    setLoadFailed(!result?.ok);
    // a successful read: the form shows exactly what is saved (nothing typed yet when the page opens / retries)
    if (result?.ok) setForm(toForm(result.values));
    setReady(true);
    return result;
  }, []);

  useEffect(() => {
    alive.current = true;
    void read();
    return () => {
      alive.current = false;
    };
  }, [read]);

  const retry = useCallback(async () => {
    setReady(false);
    return read();
  }, [read]);

  const setField = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
  }, []);

  const reset = useCallback(() => {
    setForm(toForm(saved));
    setErrors({});
  }, [saved]);

  const save = async () => {
    if (busy.current) return { ok: false };
    if (loadFailed) {
      return {
        ok: false,
        error:
          'The saved settings could not be loaded, so saving is blocked to protect them. Tap "Try again".',
      };
    }
    const problems = validateBusiness(form);
    setErrors(problems);
    if (Object.keys(problems).length) {
      return { ok: false, errors: problems, error: Object.values(problems)[0] };
    }
    busy.current = true;
    setSaving(true);
    try {
      const clean = await saveBusiness(form);
      setForm(toForm(clean));
      return { ok: true, values: clean };
    } catch (e) {
      console.error('Business settings could not be saved', e);
      return { ok: false, error: e?.message || 'Please check your connection and try again.' };
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return {
    ready,
    loadFailed,
    retry,
    form,
    errors,
    saving,
    dirty: differs(form, saved),
    saved,
    setField,
    save,
    reset,
  };
}
