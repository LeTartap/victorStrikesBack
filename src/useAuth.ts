import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "./api";

export type Role = "david" | "victor" | "mediator";

export type AuthUser = {
  id: number;
  username: string;
  role: Role;
};

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const r = await apiFetch("/api/auth/me");
    if (r.ok) {
      const data = (await r.json()) as { user: AuthUser };
      setUser(data.user);
    } else {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        setLoading(true);
        await refreshMe();
      } finally {
        if (!c) setLoading(false);
      }
    })();
    return () => {
      c = true;
    };
  }, [refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    const r = await apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? "Login failed");
    }
    const data = (await r.json()) as { user: AuthUser };
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  return { user, loading, login, logout, refreshMe } as const;
}
