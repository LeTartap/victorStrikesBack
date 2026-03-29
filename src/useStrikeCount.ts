import { useState, useCallback, useEffect } from "react";

const API = "/api/strikes";
const TOKEN_KEY = "victor-admin-token";

export function getAdminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

export function useStrikeCount() {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(() => !!getAdminToken());

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

  const persistRemote = useCallback(async (next: number) => {
    const token = getAdminToken();
    if (!token) throw new Error("Unlock controls with your admin token first");
    const r = await fetch(API, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ count: next }),
    });
    if (r.status === 401) {
      clearAdminToken();
      setIsAdmin(false);
      throw new Error("Invalid or expired token");
    }
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? `Update failed (${r.status})`);
    }
    const data = (await r.json()) as { count: number };
    setCount(data.count);
  }, []);

  const add = useCallback(
    async (amount: number) => {
      const next = Math.max(0, Math.round((count + amount) * 2) / 2);
      await persistRemote(next);
    },
    [count, persistRemote],
  );

  const subtract = useCallback(
    async (amount: number) => {
      const next = Math.max(0, Math.round((count - amount) * 2) / 2);
      await persistRemote(next);
    },
    [count, persistRemote],
  );

  const reset = useCallback(async () => {
    await persistRemote(0);
  }, [persistRemote]);

  const unlock = useCallback((token: string) => {
    setAdminToken(token.trim());
    setIsAdmin(true);
  }, []);

  const lock = useCallback(() => {
    clearAdminToken();
    setIsAdmin(false);
  }, []);

  return {
    count,
    loading,
    loadError,
    isAdmin,
    add,
    subtract,
    reset,
    unlock,
    lock,
    refetch: fetchCount,
  } as const;
}
