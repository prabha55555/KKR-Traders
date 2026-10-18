import { forwardRef, useId } from 'react';
import { cn } from './cn';

const BASE =
  'block w-full min-w-0 rounded-xl border bg-white px-3.5 py-2 text-slate-900 shadow-[inset_0_1px_2px_rgb(20_26_48/0.04)] ' +
  'placeholder:text-slate-400 transition duration-150 focus:outline-none focus:ring-4 ' +
  'hover:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ' +
  'read-only:bg-slate-50 read-only:text-slate-600 min-h-11 sm:min-h-10';

const fieldClass = (error) =>
  cn(
    BASE,
    error
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-gold-500 focus:ring-gold-100',
  );

/** Label + control + hint/error wrapper shared by all fields. */
export function Field({ label, error, hint, htmlFor, className, children, labelClassName }) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <label
          htmlFor={htmlFor}
          className={cn(
            'mb-1.5 block text-[13px] font-semibold tracking-wide text-slate-600',
            labelClassName,
          )}
        >
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Text input. NOTE: `onChange` receives the new **string value**, not the event.
 * Extra props (type, inputMode, placeholder, autoComplete, list, onKeyDown, …) go to the <input>.
 * `leftIcon` = lucide component; `right` = node shown inside the field (e.g. a clear button).
 * `emptyHint` = text shown over an EMPTY field on touch screens (phones show a blank box for an empty date input).
 */
export const TextField = forwardRef(function TextField(
  {
    label,
    error,
    hint,
    onChange,
    leftIcon: LeftIcon,
    right,
    alignRight,
    emptyHint,
    className,
    inputClassName,
    id,
    ...rest
  },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={inputId} className={className}>
      <div className="relative">
        {LeftIcon ? (
          <LeftIcon
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            fieldClass(error),
            LeftIcon && 'pl-10',
            right && 'pr-10',
            alignRight && 'text-right tabular-nums',
            inputClassName,
          )}
          onChange={(e) => onChange?.(e.target.value)}
          {...rest}
        />
        {right ? <div className="absolute top-1/2 right-2 -translate-y-1/2">{right}</div> : null}
      </div>
    </Field>
  );
});

/** Keep digits and a single decimal point ("1,5" becomes "1.5"); optional leading minus. */
export function sanitizeDecimal(text, allowNegative = false) {
  let t = String(text).replace(',', '.');
  const negative = allowNegative && t.trim().startsWith('-');
  t = t.replace(/[^0-9.]/g, '');
  const firstDot = t.indexOf('.');
  if (firstDot !== -1) t = t.slice(0, firstDot + 1) + t.slice(firstDot + 1).replace(/\./g, '');
  return (negative ? '-' : '') + t;
}

/** Decimal input that keeps its value as a *string* so partially typed numbers ("12.") are never mangled. */
export const NumberField = forwardRef(function NumberField({ onChange, allowNegative, ...rest }, ref) {
  return (
    <TextField
      ref={ref}
      inputMode={allowNegative ? 'text' : 'decimal'}
      placeholder="0.00"
      alignRight
      onFocus={(e) => e.target.select()}
      onChange={(v) => onChange?.(sanitizeDecimal(v, allowNegative))}
      {...rest}
    />
  );
});

/** <input type="date"> — value / onChange use 'YYYY-MM-DD' strings. */
export const DateField = forwardRef(function DateField(props, ref) {
  return <TextField ref={ref} type="date" {...props} />;
});

export const TextArea = forwardRef(function TextArea(
  { label, error, hint, onChange, className, id, rows = 3, ...rest },
  ref,
) {
  const auto = useId();
  const areaId = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={areaId} className={className}>
      <textarea
        ref={ref}
        id={areaId}
        rows={rows}
        className={cn(fieldClass(error), 'resize-y')}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      />
    </Field>
  );
});

/** <SelectField options={[{value,label}]} value onChange(value)> */
export const SelectField = forwardRef(function SelectField(
  { label, error, hint, onChange, options = [], className, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const selectId = id ?? auto;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={selectId} className={className}>
      <select
        ref={ref}
        id={selectId}
        className={cn(fieldClass(error), 'max-w-full truncate pr-8')}
        onChange={(e) => onChange?.(e.target.value)}
        {...rest}
      >
        {children ??
          options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </Field>
  );
});

export function Checkbox({ label, onChange, className, ...rest }) {
  return (
    <label
      className={cn('inline-flex min-h-9 items-center gap-2.5 text-sm text-slate-700 select-none', className)}
    >
      <input
        type="checkbox"
        className="size-[18px] rounded-md border-slate-300 accent-gold-500"
        onChange={(e) => onChange?.(e.target.checked)}
        {...rest}
      />
      {label}
    </label>
  );
}
