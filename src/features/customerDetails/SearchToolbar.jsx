import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useDebounced } from '@/hooks/useDebounced';
import { Button, SearchBar } from '@/ui';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Search box with the web's Search and Clear buttons. Owns the typed text so keystrokes only re-render this toolbar,
 * not the (possibly long) customer list below. `onTermChange` receives the committed term: debounced while typing,
 * immediate on Search / Clear / Enter.
 */
export function SearchToolbar({ onTermChange }) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query, SEARCH_DEBOUNCE_MS);
  useEffect(() => onTermChange(debounced), [debounced, onTermChange]);

  const clear = () => {
    setQuery('');
    onTermChange('');
  };

  return (
    <form
      role="search"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-white p-2.5 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        onTermChange(query);
      }}
    >
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search name, phone, address or invoice no."
        aria-label="Search customers"
        className="min-w-0 basis-full sm:flex-1 sm:basis-64"
      />
      <Button type="submit" icon={Search} className="flex-1 sm:flex-none">
        Search
      </Button>
      <Button variant="outline" icon={X} onClick={clear} className="flex-1 sm:flex-none">
        Clear
      </Button>
    </form>
  );
}
