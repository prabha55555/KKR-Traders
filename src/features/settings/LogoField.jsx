import { ImageOff, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import bundledLogoUrl from '@/assets/brand/logo.png';
import { BUNDLED_LOGO } from '@/core/business';
import { Button, Field, useFeedback } from '@/ui';
import { resizeLogo } from './logoImage';

/** The logo as an <img> source: the uploaded picture, the logo file shipped with the app, or '' (no logo). */
export const logoPreviewSrc = (logo) => (logo === BUNDLED_LOGO ? bundledLogoUrl : logo || '');

/**
 * Business logo: preview, upload (shrunk on the device, see logoImage.js) and remove. `value` is a data URL, '' or
 * BUNDLED_LOGO (the logo shipped with the app — shown as "Default logo", can be replaced or removed).
 */
export function LogoField({ id, value, onChange, error }) {
  const { toast } = useFeedback();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const src = logoPreviewSrc(value);
  const isDefault = value === BUNDLED_LOGO;

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // the same file can be picked again
    if (!file) return;
    setBusy(true);
    try {
      onChange(await resizeLogo(file));
    } catch (err) {
      toast('Logo not added', err?.message || 'Please choose another picture.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Field
      label="Logo"
      error={error}
      hint="Printed at the top of every bill. A PNG with a transparent background looks best; it is resized to 400 px on this device."
    >
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <figure className="m-0 flex shrink-0 flex-col items-center gap-1">
          <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 p-1.5">
            {src ? (
              <img src={src} alt="Logo preview" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="flex flex-col items-center gap-1 text-center text-[11px] font-medium text-slate-400">
                <ImageOff className="size-6" aria-hidden />
                No logo
              </span>
            )}
          </div>
          {isDefault ? (
            <figcaption className="text-[11px] font-semibold text-slate-500">Default logo</figcaption>
          ) : null}
        </figure>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button
            id={id}
            variant="outlineGold"
            size="sm"
            icon={Upload}
            loading={busy}
            onClick={() => inputRef.current?.click()}
          >
            {src ? 'Change logo' : 'Upload logo'}
          </Button>
          {value ? (
            <Button variant="outlineDanger" size="sm" icon={Trash2} onClick={() => onChange('')}>
              Remove logo
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/*"
        className="hidden"
        aria-label="Logo picture"
        onChange={onPick}
      />
    </Field>
  );
}
