import { useEffect, useState } from "react";
import type { AuthUser } from "./useAuth";

export type HistoryEntry = {
  id: number;
  previous_count: number;
  new_count: number;
  explanation: string;
  created_at: string;
  actor_username: string;
  appeal_id: number | null;
  appeal_status: string | null;
  appeal_message: string | null;
};

type Props = {
  refreshKey: number;
  user: AuthUser | null;
  onAppealClick: (historyId: number) => void;
};

export function HistorySection({ refreshKey, user, onAppealClick }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch("/api/history?limit=50");
        if (!r.ok) throw new Error("Failed to load history");
        const data = (await r.json()) as { entries: HistoryEntry[] };
        if (!c) setEntries(data.entries);
        setErr(null);
      } catch (e) {
        if (!c) setErr(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      c = true;
    };
  }, [refreshKey]);

  if (err) {
    return <p className="text-strike-red text-sm text-center">{err}</p>;
  }

  return (
    <section className="w-full max-w-2xl mt-10 mb-8 px-2">
      <h2 className="text-cartoon-blue text-xl font-bold mb-4 text-center">History</h2>
      <ul className="space-y-3 text-left">
        {entries.map((e) => (
          <li
            key={e.id}
            className="bg-white/80 border-2 border-cartoon-blue/20 rounded-2xl p-4 shadow-sm"
          >
            <div className="text-zinc-500 text-xs mb-1">
              {new Date(e.created_at).toLocaleString()} · {e.actor_username}
            </div>
            <div className="text-cartoon-blue font-semibold">
              {e.previous_count.toFixed(1)} → {e.new_count.toFixed(1)}
            </div>
            <p className="text-zinc-700 text-sm mt-2">{e.explanation}</p>
            {e.appeal_id != null && (
              <p className="text-xs text-zinc-500 mt-2">
                Appeal: {e.appeal_status}
                {e.appeal_message ? ` — “${e.appeal_message.slice(0, 80)}…”` : ""}
              </p>
            )}
            {user?.role === "victor" && e.appeal_id == null && (
              <button
                type="button"
                onClick={() => onAppealClick(e.id)}
                className="mt-3 px-4 py-1.5 rounded-full bg-warning-yellow/80 text-strike-red text-sm font-semibold border-2 border-strike-red/30 hover:bg-warning-yellow cursor-pointer"
              >
                Submit appeal
              </button>
            )}
          </li>
        ))}
      </ul>
      {entries.length === 0 && (
        <p className="text-zinc-500 text-center text-sm">No changes recorded yet.</p>
      )}
    </section>
  );
}

export function AppealModal({
  open,
  historyId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  historyId: number | null;
  onClose: () => void;
  onSubmit: (message: string) => Promise<void>;
}) {
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open || historyId == null) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl border-4 border-cartoon-blue/30 p-6 max-w-md w-full shadow-xl">
        <h2 className="text-cartoon-blue text-lg font-bold mb-2">Appeal this change</h2>
        <p className="text-zinc-600 text-sm mb-3">Briefly explain why this strike should be reviewed.</p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          className="w-full border-2 border-cartoon-blue/30 rounded-xl px-3 py-2 mb-4 text-sm min-h-[100px]"
          placeholder="Your appeal…"
        />
        {err && <p className="text-strike-red text-sm mb-2">{err}</p>}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => {
              setMsg("");
              setErr(null);
              onClose();
            }}
            className="px-4 py-2 rounded-full border-2 border-zinc-300 text-zinc-600 font-semibold text-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !msg.trim()}
            onClick={async () => {
              setErr(null);
              setBusy(true);
              try {
                await onSubmit(msg.trim());
                setMsg("");
                onClose();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed");
              } finally {
                setBusy(false);
              }
            }}
            className="px-4 py-2 rounded-full bg-cartoon-blue text-white font-semibold text-sm cursor-pointer disabled:opacity-40"
          >
            Submit appeal
          </button>
        </div>
      </div>
    </div>
  );
}
