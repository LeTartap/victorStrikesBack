import { useState, useCallback, useEffect } from "react";

const API = "/api/strikes";

export function useStrikeCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchCount = useCallback(async () => {
    const r = await fetch(API);
    if (!r.ok) throw new Error(`Could not load strikes (${r.status})`);
    const data = (await r.json()) as { count: number };
    setCount(data.count);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await fetchCount();
        if (!cancelled) setLoadError(null);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load strikes");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCount]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchCount().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchCount]);

  return {
    count,
    loading,
    loadError,
    refetch: fetchCount,
  } as const;
}
