import { useEffect, useState } from 'react';
import { calculatePreviousBalanceAtTime } from '@/core/billing';
/**
 * "Customer Account Summary" (utils.js updateCustomerBalanceDisplay): total of the customer's earlier bills and the
 * balance carried forward. `null` when the customer has no earlier invoice (the web page hid the box then).
 * Re-read (debounced) whenever the customer, the invoice number or `refreshKey` (bumped after a save) changes.
 */
export function useCustomerSummary({ customerName, customerPhone, invoiceNo, invoiceDate, refreshKey = 0 }) {
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (!customerName && !customerPhone) {
      setSummary(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      calculatePreviousBalanceAtTime(customerName, customerPhone, invoiceNo || null, invoiceDate || null)
        .then((info) => {
          if (!cancelled) setSummary(info.invoiceCount > 0 ? info : null);
        })
        .catch((error) => console.error('Error loading customer summary', error));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerName, customerPhone, invoiceNo, invoiceDate, refreshKey]);
  return summary;
}
