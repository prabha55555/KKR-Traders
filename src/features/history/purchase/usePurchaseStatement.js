import { useCallback, useRef, useState } from 'react';
import { useFeedback } from '@/ui';
import { statementState } from '../lib/statement';
import { isUserError } from '../lib/types';
import {
  exportCombinedSupplierStatement,
  exportEasySupplierStatement,
  loadSupplierStatement,
  shareSupplierStatementOnWhatsApp,
} from './purchaseStatements';
/** State + actions of the "Supplier Statement" section (searchSupplierInvoices and the combined-statement exports). */
export function usePurchaseStatement() {
  const { toast } = useFeedback();
  const [query, setQuery] = useState('');
  const [state, setState] = useState({ status: 'idle' });
  const [busy, setBusy] = useState(null);
  const lastQuery = useRef('');
  /** the ledger party on screen (picked or the only match): a refresh rebuilds exactly that party's statement */
  const lastParty = useRef(null);
  const generate = useCallback(async () => {
    const supplierName = query.trim();
    if (!supplierName) {
      toast('Warning', 'Please enter a supplier name', 'warning');
      return;
    }
    lastQuery.current = supplierName;
    lastParty.current = null;
    setState({ status: 'loading' });
    try {
      const result = await loadSupplierStatement(supplierName);
      lastParty.current = result?.partyKey ?? null;
      setState(statementState(result, supplierName));
    } catch (error) {
      console.error('Error searching supplier invoices:', error);
      setState({ status: 'error' });
      toast('Error', 'Error searching supplier invoices.', 'error');
    }
  }, [query, toast]);
  /** One of several matching parties was picked. */
  const choose = useCallback(
    async (partyKey) => {
      lastParty.current = partyKey;
      setState({ status: 'loading' });
      try {
        setState(statementState(await loadSupplierStatement(lastQuery.current, partyKey), lastQuery.current));
      } catch (error) {
        console.error('Error loading supplier statement:', error);
        setState({ status: 'error' });
        toast('Error', 'Error searching supplier invoices.', 'error');
      }
    },
    [toast],
  );
  const clear = useCallback(() => {
    setQuery('');
    lastQuery.current = '';
    lastParty.current = null;
    setState({ status: 'idle' });
  }, []);
  /** After a payment / return changed the numbers: silently rebuild the statement that is on screen. */
  const refresh = useCallback(async () => {
    const supplierName = lastQuery.current;
    if (!supplierName) return;
    try {
      const result = await loadSupplierStatement(supplierName, lastParty.current ?? undefined);
      setState(statementState(result, supplierName));
    } catch (error) {
      console.error('Error refreshing supplier statement:', error);
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
      await exportCombinedSupplierStatement(ready);
    });
  }, [ready, run]);
  const downloadEasyPdf = useCallback(async () => {
    if (!ready) return;
    await run('easy', 'Error generating easy combined statement.', async () => {
      await exportEasySupplierStatement(ready);
    });
  }, [ready, run]);
  const shareWhatsApp = useCallback(async () => {
    if (!ready) return;
    await run('whatsapp', 'Error sharing statement. Please try again.', async () => {
      const { copied } = await shareSupplierStatementOnWhatsApp(ready);
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
    choose,
    clear,
    refresh,
    downloadPdf,
    downloadEasyPdf,
    shareWhatsApp,
  };
}
