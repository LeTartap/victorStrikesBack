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
  created_at: string;
  vote_count?: number;
};

export function MediatorAppeals({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<AppealRow[]>([]);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [voteErr, setVoteErr] = useState<string | null>(null);

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

  const vote = async (id: number, v: "overturn" | "uphold") => {
    setVoteErr(null);
    setBusy(id);
    try {
      const r = await apiFetch(`/api/appeals/${id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vote: v }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Vote failed");
      }
      await load();
    } catch (e) {
      setVoteErr(e instanceof Error ? e.message : "Vote failed");
    } finally {
      setBusy(null);
    }
  };

  const threshold = Math.ceil(total / 2);

  if (total === 0) {
    return (
      <p className="text-zinc-500 text-sm text-center max-w-md">
        There are no mediators configured yet — appeals cannot be resolved until David adds mediator
        accounts.
      </p>
    );
  }

  return (
    <section className="w-full max-w-2xl mt-6 mb-8 px-2">
      <h2 className="text-cartoon-blue text-xl font-bold mb-1 text-center">Open appeals</h2>
      <p className="text-xs text-zinc-500 text-center mb-4">
        An appeal resolves as soon as one side reaches{" "}
        <strong>{threshold}</strong> of {total} vote{total !== 1 ? "s" : ""}. After 24 hours,
        unresolved appeals default to <strong>Uphold</strong>.
      </p>
      {err && <p className="text-strike-red text-sm text-center">{err}</p>}
      {voteErr && <p className="text-strike-red text-sm text-center">{voteErr}</p>}
      <ul className="space-y-4">
        {rows.map((a) => {
          const deadline = new Date(new Date(a.created_at).getTime() + 24 * 60 * 60 * 1000);
          const nowMs = Date.now();
          const hoursLeft = Math.max(0, Math.round((deadline.getTime() - nowMs) / 3_600_000));
          return (
            <li
              key={a.id}
              className="bg-white/90 border-2 border-warning-yellow rounded-2xl p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 mb-2">
                <span>Victor: {a.victor_username}</span>
                <span>
                  {a.vote_count ?? 0}/{total} votes · expires in ~{hoursLeft}h
                </span>
              </div>
              <p className="text-sm text-zinc-700">
                Strike change: {a.previous_count.toFixed(1)} → {a.new_count.toFixed(1)} —{" "}
                {a.history_explanation}
              </p>
              <p className="text-cartoon-blue font-medium mt-2">Appeal: {a.message}</p>

              <div className="mt-3 p-2 bg-zinc-50 rounded-xl border border-zinc-100 text-xs text-zinc-500">
                <span className="font-semibold text-mint">Overturn</span> = revert David's strike
                change back to {a.previous_count.toFixed(1)}.{" "}
                <span className="font-semibold text-coral">Uphold</span> = keep the change at{" "}
                {a.new_count.toFixed(1)}.
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => void vote(a.id, "overturn")}
                  className="px-4 py-2 rounded-full bg-mint text-white text-sm font-semibold shadow-[0_3px_0_var(--color-mint-dark)] active:translate-y-0.5 cursor-pointer disabled:opacity-50"
                >
                  Overturn — revert to {a.previous_count.toFixed(1)}
                </button>
                <button
                  type="button"
                  disabled={busy === a.id}
                  onClick={() => void vote(a.id, "uphold")}
                  className="px-4 py-2 rounded-full bg-coral text-white text-sm font-semibold shadow-[0_3px_0_var(--color-coral-dark)] active:translate-y-0.5 cursor-pointer disabled:opacity-50"
                >
                  Uphold — keep at {a.new_count.toFixed(1)}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && !err && (
        <p className="text-zinc-500 text-center text-sm">No open appeals.</p>
      )}
    </section>
  );
}
