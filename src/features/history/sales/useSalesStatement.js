import { useCallback, useRef, useState } from 'react';
import { useFeedback } from '@/ui';
import { isUserError } from '../lib/types';
import {
  exportCombinedStatement,
  exportEasyStatement,
  loadCustomerStatement,
  shareCombinedStatementOnWhatsApp,
} from './salesStatements';
/** State + actions of the "Customer Statement" section (searchCustomerInvoices and the combined-statement exports). */
export function useSalesStatement() {
  const { toast } = useFeedback();
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const [busy, setBusy] = useState(null);
  const lastQuery = useRef('');
  const generate = useCallback(async () => {
    const customerName = query.trim();
    if (!customerName) {
      toast('Warning', 'Please enter a customer name', 'warning');
      return;
    }
    lastQuery.current = customerName;
    setState({ status: 'loading' });
    try {
      const statement = await loadCustomerStatement(customerName);
      setState(statement ? { status: 'ready', statement } : { status: 'empty', query: customerName });
    } catch (error) {
      console.error('Error searching customer invoices:', error);
      setState({ status: 'error' });
      toast('Error', 'Error searching customer invoices.', 'error');
    }
  }, [query, toast]);
  const clear = useCallback(() => {
    setQuery('');
    lastQuery.current = '';
    setState({ status: 'idle' });
  }, []);
  /** After a payment / return changed the numbers: silently rebuild the statement that is on screen. */
  const refresh = useCallback(async () => {
    const customerName = lastQuery.current;
    if (!customerName) return;
    try {
      const statement = await loadCustomerStatement(customerName);
      setState(statement ? { status: 'ready', statement } : { status: 'empty', query: customerName });
    } catch (error) {
      console.error('Error refreshing customer statement:', error);
    }
  }, []);
  const run = useCallback(
    async (kind, fallbackError, job) => {
      setBusy(kind);
      try {
        await job();
      } catch (error) {
        console.error(fallbackError, error);
        toast('Error', isUserError(error) ? error.message : fallbackError, 'error');
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  const ready = state.status === 'ready' ? state.statement : null;
  const downloadPdf = useCallback(async () => {
    if (!ready) return;
    await run('pdf', 'Error generating combined statement.', async () => {
      await exportCombinedStatement(ready);
    });
  }, [ready, run]);
  const downloadEasyPdf = useCallback(async () => {
    if (!ready) return;
    await run('easy', 'Error generating easy combined statement.', async () => {
      await exportEasyStatement(ready);
    });
  }, [ready, run]);
  const shareWhatsApp = useCallback(async () => {
    if (!ready) return;
    await run('whatsapp', 'Error sharing statement. Please try again.', async () => {
      const { copied } = await shareCombinedStatementOnWhatsApp(ready);
      if (copied) {
        toast(
          'Success',
          'Message copied to clipboard! If it is not filled in automatically, paste it into the chat.',
          'success',
        );
      }
    });
  }, [ready, run, toast]);
  return {
    query,
    setQuery,
    state,
    busy,
    generate,
    clear,
    refresh,
    downloadPdf,
    downloadEasyPdf,
    shareWhatsApp,
  };
}
