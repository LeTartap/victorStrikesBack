import { useEffect, useState } from "react";
import { Scale, X } from "lucide-react";
import { apiFetch } from "./api";

type ListRow = {
  id: number;
  status: string;
  victor_username: string;
  previous_count: number;
  new_count: number;
  history_explanation: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  vote_count?: number;
};

type VoteRow = {
  mediator_username: string;
  vote: string;
  created_at: string;
};

type AppealDetail = ListRow & {
  votes: VoteRow[];
};

export function DavidAppealsList({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [mediatorTotal, setMediatorTotal] = useState(0);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<AppealDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailErr, setDetailErr] = useState<string | null>(null);

  useEffect(() => {
    let c = false;
    (async () => {
      const r = await apiFetch("/api/appeals");
      if (!r.ok) return;
      const data = (await r.json()) as { appeals: ListRow[]; mediator_total: number };
      if (!c) {
        setRows(data.appeals);
        setMediatorTotal(data.mediator_total ?? 0);
      }
    })();
    return () => {
      c = true;
    };
  }, [refreshKey]);

  const loadDetail = async (id: number) => {
    setOpenId(id);
    setDetail(null);
    setDetailErr(null);
    setDetailLoading(true);
    try {
      const r = await apiFetch(`/api/appeals/${id}`);
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed to load appeal");
      }
      const data = (await r.json()) as { appeal: AppealDetail; mediator_total: number };
      setDetail(data.appeal);
      setMediatorTotal(data.mediator_total);
    } catch (e) {
      setDetailErr(e instanceof Error ? e.message : "Error");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeModal = () => {
    setOpenId(null);
    setDetail(null);
    setDetailErr(null);
  };

  if (rows.length === 0) return null;

  return (
    <>
      <section className="w-full max-w-2xl mt-6 mb-4 px-2">
        <h2 className="text-cartoon-blue text-lg font-bold mb-2 text-center flex items-center justify-center gap-2">
          <Scale className="w-5 h-5" />
          All appeals
        </h2>
        <p className="text-xs text-zinc-500 text-center mb-3">
          Tap an appeal to see mediator votes and full details.
        </p>
        <ul className="space-y-2 text-sm text-zinc-700">
          {rows.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => void loadDetail(a.id)}
                className="w-full text-left bg-white/60 rounded-xl px-3 py-3 border border-cartoon-blue/15 hover:border-cartoon-blue/40 hover:bg-white/90 transition-colors cursor-pointer"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-cartoon-blue capitalize">{a.status.replace("_", " ")}</span>
                  <span className="text-xs text-zinc-500">
                    {a.status === "open" && mediatorTotal > 0
                      ? `Votes ${a.vote_count ?? 0}/${mediatorTotal}`
                      : a.status === "open"
                        ? "Awaiting votes"
                        : "Closed"}
                  </span>
                </div>
                <div className="text-zinc-600 mt-1">
                  <span className="font-medium">{a.victor_username}</span> ·{" "}
                  {a.previous_count.toFixed(1)} → {a.new_count.toFixed(1)}
                </div>
                <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{a.message}</p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {openId !== null && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="david-appeal-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="bg-white rounded-2xl border-2 border-cartoon-blue/25 shadow-xl max-w-lg w-full max-h-[min(90vh,640px)] overflow-y-auto flex flex-col">
            <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-zinc-100 bg-white/95 rounded-t-2xl">
              <h3 id="david-appeal-detail-title" className="font-bold text-cartoon-blue text-lg pr-2">
                Appeal #{openId}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-2 rounded-full hover:bg-zinc-100 text-zinc-600 cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 flex flex-col gap-4 text-sm">
              {detailLoading && <p className="text-zinc-500">Loading…</p>}
              {detailErr && <p className="text-strike-red font-medium">{detailErr}</p>}
              {detail && !detailLoading && (
                <>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Status</p>
                    <p className="font-semibold text-cartoon-blue capitalize">
                      {detail.status.replace(/_/g, " ")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Victor</p>
                    <p className="text-zinc-800">{detail.victor_username}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Strike change</p>
                    <p className="text-zinc-800">
                      {detail.previous_count.toFixed(1)} → {detail.new_count.toFixed(1)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Reason for change (history)</p>
                    <p className="text-zinc-700">{detail.history_explanation}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Appeal message</p>
                    <p className="text-cartoon-blue font-medium">{detail.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                    <span>Submitted {new Date(detail.created_at).toLocaleString()}</span>
                    {detail.resolved_at && (
                      <span>Resolved {new Date(detail.resolved_at).toLocaleString()}</span>
                    )}
                  </div>

                  <div className="border-t border-dashed border-zinc-200 pt-3">
                    <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
                      Mediator votes ({detail.votes.length}
                      {mediatorTotal > 0 ? ` of ${mediatorTotal}` : ""})
                    </p>
                    {detail.votes.length === 0 ? (
                      <p className="text-zinc-500 italic">No votes yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {detail.votes.map((v, i) => (
                          <li
                            key={`${v.mediator_username}-${i}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 border border-zinc-100"
                          >
                            <span className="font-medium text-zinc-800">{v.mediator_username}</span>
                            <span
                              className={
                                v.vote === "overturn"
                                  ? "text-mint font-semibold"
                                  : "text-coral font-semibold"
                              }
                            >
                              {v.vote === "overturn" ? "Overturn" : "Uphold"}
                            </span>
                            <span className="w-full text-xs text-zinc-400 sm:w-auto sm:text-right">
                              {new Date(v.created_at).toLocaleString()}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
