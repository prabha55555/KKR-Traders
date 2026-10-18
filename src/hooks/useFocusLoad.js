import { useCallback, useEffect, useRef, useState } from 'react';

import { db } from '@/core/db';

/**
 * Runs `load` when the page mounts and again whenever the app comes back to the foreground (tab/PWA focus), so data
 * edited on another screen or device is not stale. Exposes loading / refreshing / error state.
 *
 * `load` is called through a ref, so it may close over fresh state without retriggering the effect.
 */
export function useFocusLoad(load) {
  const loadRef = useRef(load);
  loadRef.current = load;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  const lastRun = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (pull = false) => {
    if (pull) setRefreshing(true);
    lastRun.current = Date.now();
    try {
      await loadRef.current();
      if (mounted.current) setError(null);
    } catch (e) {
      console.error(e);
      if (mounted.current) setError(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void run();
    // Returning to the app after >1 minute away: reload (the in-memory db cache is dropped first).
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > 60_000) {
        db.invalidateAll();
        void run();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [run]);

  /** refresh button: drop in-memory caches so the next read hits Firestore */
  const refresh = useCallback(async () => {
    db.invalidateAll();
    await run(true);
  }, [run]);

  return { loading, refreshing, error, refresh, reload: run };
}
