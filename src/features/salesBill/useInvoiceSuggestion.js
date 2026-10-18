import { useCallback, useEffect, useRef, useState } from 'react';
import { loadInvoiceSuggestion } from '@/core/services/salesBill';
/**
 * "Last Invoice / Suggested Next" for the financial year of `invoiceDate`. The suggestion depends on the invoice DATE,
 * so it is re-read whenever the date changes; call `refresh(date)` after saving or resetting.
 */
export function useInvoiceSuggestion(invoiceDate) {
  const [suggestion, setSuggestion] = useState(null);
  const latest = useRef(0);
  const refresh = useCallback(async (date) => {
    const request = ++latest.current;
    const next = await loadInvoiceSuggestion(date);
    if (request === latest.current) setSuggestion(next);
  }, []);
  useEffect(() => {
    void refresh(invoiceDate);
  }, [invoiceDate, refresh]);
  return { suggestion, refresh };
}
