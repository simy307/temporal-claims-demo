import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollingResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  lastUpdatedAt: number | null;
  refresh: () => Promise<void>;
}

/**
 * Polls the API on an interval. Polling (rather than websockets) keeps the demo simple and makes
 * it obvious that every render is backed by a fresh read from Temporal.
 */
export function usePolling<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  enabled = true,
): PollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      if (!mounted.current) {
        return;
      }
      setData(result);
      setError(null);
      setLastUpdatedAt(Date.now());
    } catch (caught) {
      if (!mounted.current) {
        return;
      }
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refresh();
    if (intervalMs <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      // Skip polling while the tab is in the background; refresh as soon as it comes back.
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, intervalMs, enabled]);

  return { data, error, loading, lastUpdatedAt, refresh };
}
