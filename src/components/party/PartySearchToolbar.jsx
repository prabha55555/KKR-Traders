import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useDebounced } from '@/hooks/useDebounced';
import { Button, Card, SearchBar } from '@/ui';

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Search toolbar of both party details pages: search box, then Search (gold) and Clear (amber) — the same controls,
 * order and colours as the History filter bar.
 * Owns the typed text so keystrokes only re-render this toolbar, not the list below. `onTermChange(term)` receives the
 * committed term: debounced while typing, immediately on Search / Clear / Enter. `initialTerm` pre-fills the box
 * (e.g. Supplier Details opened with `?phone=`).
 */
export function PartySearchToolbar({ kind, initialTerm = '', onTermChange }) {
  const [query, setQuery] = useState(initialTerm);
  const debounced = useDebounced(query, SEARCH_DEBOUNCE_MS);
  useEffect(() => onTermChange(debounced), [debounced, onTermChange]);

  const clear = () => {
    setQuery('');
    onTermChange('');
  };

  return (
    <Card
      as="form"
      role="search"
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onTermChange(query);
      }}
    >
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={kind.searchPlaceholder}
        aria-label={`Search ${kind.nouns}`}
        autoComplete="off"
        className="min-w-0 basis-full sm:flex-1 sm:basis-64"
      />
      <Button type="submit" variant="primary" icon={Search} className="flex-1 sm:flex-none">
        Search
      </Button>
      <Button variant="outlineWarning" icon={X} onClick={clear} className="flex-1 sm:flex-none">
        Clear
      </Button>
    </Card>
  );
}
