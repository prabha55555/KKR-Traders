import { Search, X } from 'lucide-react';
import { TextField } from './fields';

/** Search box with a clear button. `value` / `onChange(value)` are strings. */
export function SearchBar({ value, onChange, placeholder = 'Search…', className, ...rest }) {
  return (
    <TextField
      type="search"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      leftIcon={Search}
      className={className}
      right={
        value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onChange('')}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="size-4" />
          </button>
        ) : null
      }
      {...rest}
    />
  );
}
