import { useCallback, useMemo, useState } from 'react';
import { useFeedback } from '@/ui';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { todayISO } from '@/core/format';
import { computeStats, filterCustomers } from './aggregate';
import { loadCustomerSummaries } from './customerService';
import { buildExport } from './exportData';
import { saveAndShareExport } from './exportFile';
// iOS cannot present the share sheet while the export dialog is still sliding away
/** State and actions of the Customer Details screen, shared by its phone (cards) and desktop (table) layouts. */
export function useCustomerDetails() {
  const { toast } = useFeedback();
  const [customers, setCustomers] = useState([]);
  const { loading, refreshing, error, refresh } = useFocusLoad(async () => {
    setCustomers(await loadCustomerSummaries(true));
  });
  const [term, setTerm] = useState('');
  const visible = useMemo(() => filterCustomers(customers, term), [customers, term]);
  const stats = useMemo(() => computeStats(visible), [visible]);
  const [reminderFor, setReminderFor] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const openExport = useCallback(() => {
    if (customers.length === 0) {
      toast('Notification', 'No customer data to export.', 'info');
      return;
    }
    setExportOpen(true);
  }, [customers.length, toast]);
  const runExport = async (format, columns) => {
    setExportOpen(false);
    try {
      // the web exported every customer, not just the searched ones
      const shared = await saveAndShareExport(buildExport(customers, format, columns, todayISO()));
      if (shared)
        toast(
          'Export Successful!',
          `Exported ${customers.length} customers to ${format.toUpperCase()} file`,
          'success',
        );
      else toast('Export Failed', 'File sharing is not available on this device.', 'error');
    } catch (e) {
      console.error('Error exporting customers:', e);
      toast('Error', 'Error exporting customer data. Please try again.', 'error');
    }
  };
  return {
    customers,
    visible,
    stats,
    loading,
    refreshing,
    error,
    refresh,
    setTerm,
    reminderFor,
    setReminderFor,
    exportOpen,
    setExportOpen,
    openExport,
    runExport,
  };
}
