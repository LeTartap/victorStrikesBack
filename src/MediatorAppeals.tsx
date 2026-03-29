import { useEffect, useState } from "react";
import { apiFetch } from "./api";

type AppealRow = {
  id: number;
  history_id: number;
  message: string;
  status: string;
  victor_username: string;
  previous_count: number;
  new_count: number;
  history_explanation: string;
  vote_count?: number;
};

export function MediatorAppeals({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<AppealRow[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    const r = await apiFetch("/api/appeals");
    if (!r.ok) {
      setErr("Could not load appeals");
      return;
    }
    const data = (await r.json()) as { appeals: AppealRow[]; mediator_total: number };
    setRows(data.appeals);
    setTotal(data.mediator_total);
    setErr(null);
  };

  useEffect(() => {
    load().catch(() => setErr("Load failed"));
  }, [refreshKey]);

  const vote = async (id: number, vote: "overturn" | "uphold") => {
    setBusy(id);
    try {
      const r = await apiFetch(`/api/appeals/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Vote failed");
      }
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (total === 0) {
    return (
      <p className="text-zinc-500 text-sm text-center max-w-md">
        There are no mediators configured yet — appeals cannot be resolved until David adds mediator accounts.
      </p>
    );
  }

  return (
    <section className="w-full max-w-2xl mt-6 mb-8 px-2">
      <h2 className="text-cartoon-blue text-xl font-bold mb-4 text-center">Open appeals</h2>
      {err && <p className="text-strike-red text-sm text-center">{err}</p>}
      <ul className="space-y-4">
        {rows.map((a) => (
          <li
            key={a.id}
            className="bg-white/90 border-2 border-warning-yellow rounded-2xl p-4 shadow-sm"
          >
            <div className="text-xs text-zinc-500">
              Victor: {a.victor_username} · votes {a.vote_count ?? 0}/{total}
            </div>
            <p className="text-sm text-zinc-700 mt-2">
              Strike change: {a.previous_count.toFixed(1)} → {a.new_count.toFixed(1)} —{" "}
              {a.history_explanation}
            </p>
            <p className="text-cartoon-blue font-medium mt-2">Appeal: {a.message}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                disabled={busy === a.id}
                onClick={() => vote(a.id, "overturn")}
                className="px-4 py-2 rounded-full bg-mint text-white text-sm font-semibold shadow-[0_3px_0_var(--color-mint-dark)] active:translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                Overturn strike change
              </button>
              <button
                type="button"
                disabled={busy === a.id}
                onClick={() => vote(a.id, "uphold")}
                className="px-4 py-2 rounded-full bg-coral text-white text-sm font-semibold shadow-[0_3px_0_var(--color-coral-dark)] active:translate-y-0.5 cursor-pointer disabled:opacity-50"
              >
                Uphold strike change
              </button>
            </div>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !err && (
        <p className="text-zinc-500 text-center text-sm">No open appeals.</p>
      )}
    </section>
  );
}
