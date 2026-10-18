import { useEffect, useState } from 'react';

import { db } from '@/core/db';

/** Product catalogue (shortcut key -> full description) used by bill pages for autocomplete + validation. */
export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState(null);

  useEffect(() => {
    let active = true;
    db.getAllShortcuts()
      .then((s) => active && setShortcuts(s))
      .catch((e) => console.error('Error loading shortcuts', e));
    return () => {
      active = false;
    };
  }, []);

  return shortcuts;
}
