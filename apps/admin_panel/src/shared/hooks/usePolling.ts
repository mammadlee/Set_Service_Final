import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../api/http';

export type PollingConnection = 'online' | 'refreshing' | 'offline';

export function usePolling<T>(loader: () => Promise<T>, deps: unknown[], intervalMs = 15_000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const generationRef = useRef(0);
  const inFlightGenerationRef = useRef<number | null>(null);
  const load = useCallback(loader, deps);

  useEffect(() => {
    let active = true;
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    async function refresh(background: boolean) {
      if (inFlightGenerationRef.current === generation || !navigator.onLine) return;
      inFlightGenerationRef.current = generation;
      if (background) setRefreshing(true);
      else setLoading(true);

      try {
        const next = await load();
        if (!active || generationRef.current !== generation) return;
        setData(next);
        setError(null);
        setLastUpdatedAt(new Date());
      } catch (err) {
        if (active && generationRef.current === generation) setError(getErrorMessage(err));
      } finally {
        if (inFlightGenerationRef.current === generation) inFlightGenerationRef.current = null;
        if (active && generationRef.current === generation) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    setError(null);
    void refresh(false);

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true);
    }, intervalMs);
    const handleOnline = () => {
      setOnline(true);
      if (document.visibilityState === 'visible') void refresh(true);
    };
    const handleOffline = () => setOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void refresh(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [intervalMs, load]);

  const reload = useCallback(async () => {
    const generation = generationRef.current;
    if (inFlightGenerationRef.current === generation || !navigator.onLine) return;
    inFlightGenerationRef.current = generation;
    setRefreshing(true);
    try {
      const next = await load();
      if (generationRef.current === generation) {
        setData(next);
        setError(null);
        setLastUpdatedAt(new Date());
      }
    } catch (err) {
      if (generationRef.current === generation) setError(getErrorMessage(err));
    } finally {
      if (inFlightGenerationRef.current === generation) inFlightGenerationRef.current = null;
      if (generationRef.current === generation) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [load]);

  const connection: PollingConnection = !online ? 'offline' : refreshing ? 'refreshing' : 'online';
  return { data, loading, refreshing, error, lastUpdatedAt, connection, reload, setData };
}
