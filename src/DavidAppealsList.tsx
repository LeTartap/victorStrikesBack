import { useEffect, useState } from "react";
import { apiFetch } from "./api";

type Row = {
  id: number;
  status: string;
  victor_username: string;
  previous_count: number;
  new_count: number;
  history_explanation: string;
  message: string;
};

export function DavidAppealsList({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let c = false;
    (async () => {
      const r = await apiFetch("/api/appeals");
      if (!r.ok) return;
      const data = (await r.json()) as { appeals: Row[] };
      if (!c) setRows(data.appeals);
    })();
    return () => {
      c = true;
    };
  }, [refreshKey]);

  if (rows.length === 0) return null;

  return (
    <section className="w-full max-w-2xl mt-6 mb-4 px-2">
      <h2 className="text-cartoon-blue text-lg font-bold mb-2 text-center">All appeals</h2>
      <ul className="space-y-2 text-sm text-zinc-700">
        {rows.map((a) => (
          <li key={a.id} className="bg-white/60 rounded-xl px-3 py-2 border border-cartoon-blue/15">
            <span className="font-semibold text-cartoon-blue">{a.status}</span> · {a.victor_username}:{" "}
            {a.message.slice(0, 120)}
            {a.message.length > 120 ? "…" : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
