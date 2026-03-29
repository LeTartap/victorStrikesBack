import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "./api";

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

  const persistRemote = useCallback(async (next: number, explanation: string) => {
    const r = await apiFetch(API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: next, explanation }),
    });
    if (r.status === 401 || r.status === 403) {
      throw new Error("Not allowed — log in as David");
    }
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? `Update failed (${r.status})`);
    }
    const data = (await r.json()) as { count: number };
    setCount(data.count);
  }, []);

  const add = useCallback(
    async (amount: number, explanation: string) => {
      const next = Math.max(0, Math.round((count + amount) * 2) / 2);
      await persistRemote(next, explanation);
    },
    [count, persistRemote],
  );

  const subtract = useCallback(
    async (amount: number, explanation: string) => {
      const next = Math.max(0, Math.round((count - amount) * 2) / 2);
      await persistRemote(next, explanation);
    },
    [count, persistRemote],
  );

  const reset = useCallback(
    async (explanation: string) => {
      await persistRemote(0, explanation);
    },
    [persistRemote],
  );

  return {
    count,
    loading,
    loadError,
    add,
    subtract,
    reset,
    refetch: fetchCount,
  } as const;
}
