import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Reply, X } from "lucide-react";
import type { AuthUser } from "./useAuth";
import { apiFetch } from "./api";

const MAX_APPEAL_LEN = 1000;
const MAX_COMMENT_LEN = 1000;

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

type Comment = {
  id: number;
  parent_id: number | null;
  body: string;
  created_at: string;
  author_username: string;
  author_role: string;
};

type Props = {
  refreshKey: number;
  user: AuthUser | null;
  onAppealClick: (historyId: number) => void;
};

const PREVIEW_COUNT = 3;
const MAX_THREAD_COMMENTS = 50;

function CommentThread({
  historyId,
  user,
}: {
  historyId: number;
  user: AuthUser | null;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postErr, setPostErr] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/history/${historyId}/comments`);
      if (r.ok) {
        const data = (await r.json()) as { comments: Comment[] };
        setComments(data.comments);
      }
    } finally {
      setLoading(false);
    }
  }, [historyId]);

  // Load comments on mount and auto-expand if any exist.
  useEffect(() => {
    load().then(() => {}).catch(() => {});
  }, [load]);

  useEffect(() => {
    if (comments.length > 0) setExpanded(true);
  }, [comments.length]);

  const toggle = () => setExpanded((v) => !v);

  const startReply = (c: Comment) => {
    setReplyTo(c);
    setDraft("");
    setPostErr(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const cancelReply = () => {
    setReplyTo(null);
    setDraft("");
    setPostErr(null);
  };

  const submit = async () => {
    const text = draft.trim().slice(0, MAX_COMMENT_LEN);
    if (!text || !user) return;
    setPosting(true);
    setPostErr(null);
    try {
      const body: Record<string, unknown> = { body: text };
      if (replyTo) body.parent_id = replyTo.id;
      const r = await apiFetch(`/api/history/${historyId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed to post");
      }
      setDraft("");
      setReplyTo(null);
      await load();
    } catch (e) {
      setPostErr(e instanceof Error ? e.message : "Error");
    } finally {
      setPosting(false);
    }
  };

  const topLevel = comments.filter((c) => c.parent_id == null);
  const replies = comments.filter((c) => c.parent_id != null);

  const roleColor = (role: string) =>
    role === "david"
      ? "text-cartoon-blue"
      : role === "victor"
        ? "text-strike-red"
        : "text-mint";

  // Split into top-level and replies, slice to PREVIEW_COUNT when not expanded-all.
  const visibleTopLevel = showAll ? topLevel : topLevel.slice(0, PREVIEW_COUNT);
  const hiddenCount = topLevel.length - PREVIEW_COUNT;

  return (
    <div className="mt-3 border-t border-zinc-100 pt-2">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-cartoon-blue cursor-pointer"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {comments.length > 0
          ? `${comments.length} comment${comments.length !== 1 ? "s" : ""}`
          : "Add a comment"}
        {expanded ? " ▲" : " ▼"}
      </button>

      {expanded && (
        <div className="mt-2 space-y-3">
          {loading && <p className="text-xs text-zinc-400">Loading…</p>}

          {visibleTopLevel.map((c) => {
            const cReplies = replies.filter((r) => r.parent_id === c.id);
            return (
              <div key={c.id} className="space-y-1">
                <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-1 mb-1 text-xs text-zinc-500">
                    <span className={`font-semibold ${roleColor(c.author_role)}`}>
                      {c.author_username}
                    </span>
                    <span>·</span>
                    <span>{new Date(c.created_at + "Z").toLocaleString()}</span>
                    {user && (
                      <button
                        type="button"
                        onClick={() => startReply(c)}
                        className="ml-auto flex items-center gap-0.5 text-zinc-400 hover:text-cartoon-blue cursor-pointer"
                      >
                        <Reply className="w-3 h-3" />
                        Reply
                      </button>
                    )}
                  </div>
                  <p className="text-zinc-700 whitespace-pre-wrap">{c.body}</p>
                </div>

                {cReplies.map((r) => (
                  <div
                    key={r.id}
                    className="ml-6 rounded-xl bg-white border border-zinc-100 px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-baseline gap-1 mb-1 text-xs text-zinc-500">
                      <span className={`font-semibold ${roleColor(r.author_role)}`}>
                        {r.author_username}
                      </span>
                      <span>·</span>
                      <span>{new Date(r.created_at + "Z").toLocaleString()}</span>
                      {user && (
                        <button
                          type="button"
                          onClick={() => startReply(r)}
                          className="ml-auto flex items-center gap-0.5 text-zinc-400 hover:text-cartoon-blue cursor-pointer"
                        >
                          <Reply className="w-3 h-3" />
                          Reply
                        </button>
                      )}
                    </div>
                    <p className="text-zinc-700 whitespace-pre-wrap">{r.body}</p>
                  </div>
                ))}
              </div>
            );
          })}

          {!showAll && hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-xs text-cartoon-blue hover:underline cursor-pointer"
            >
              Show {hiddenCount} more comment{hiddenCount !== 1 ? "s" : ""}
            </button>
          )}
          {showAll && topLevel.length > PREVIEW_COUNT && (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className="text-xs text-zinc-400 hover:underline cursor-pointer"
            >
              Show less
            </button>
          )}

          {user && comments.length >= MAX_THREAD_COMMENTS && (
            <p className="text-xs text-zinc-400 italic">
              This thread has reached the maximum of {MAX_THREAD_COMMENTS} comments.
            </p>
          )}

          {user && comments.length < MAX_THREAD_COMMENTS && (
            <div className="pt-1">
              {replyTo && (
                <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                  <Reply className="w-3 h-3" />
                  Replying to {replyTo.author_username}
                  <button
                    type="button"
                    onClick={cancelReply}
                    className="ml-auto cursor-pointer text-zinc-400 hover:text-zinc-600"
                    aria-label="Cancel reply"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT_LEN))}
                className="w-full border border-zinc-200 rounded-xl px-2 py-1.5 text-sm min-h-[60px] resize-none focus:outline-none focus:border-cartoon-blue/50"
                placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-zinc-400">
                  {draft.length}/{MAX_COMMENT_LEN}
                </span>
                <button
                  type="button"
                  disabled={posting || !draft.trim()}
                  onClick={() => void submit()}
                  className="px-3 py-1 rounded-full bg-cartoon-blue text-white text-xs font-semibold cursor-pointer disabled:opacity-40"
                >
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
              {postErr && <p className="text-strike-red text-xs mt-1">{postErr}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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

  const appealStatusLabel = (status: string | null) => {
    if (!status) return null;
    if (status === "open") return "Open";
    if (status === "resolved_overturn")
      return "Overturned — strike change was reverted";
    if (status === "resolved_uphold")
      return "Upheld — strike change was kept";
    return status;
  };

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
              <div className="mt-2 text-xs rounded-lg bg-warning-yellow/20 border border-warning-yellow/40 px-2 py-1.5">
                <span className="font-semibold text-zinc-600">Appeal: </span>
                <span className="text-zinc-600">{appealStatusLabel(e.appeal_status)}</span>
                {e.appeal_message ? (
                  <p className="mt-0.5 text-zinc-500 line-clamp-2">"{e.appeal_message}"</p>
                ) : null}
              </div>
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
            <CommentThread historyId={e.id} user={user} />
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

  const charLeft = MAX_APPEAL_LEN - msg.length;
  const canSubmit = msg.trim().length > 0 && msg.length <= MAX_APPEAL_LEN;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl border-4 border-cartoon-blue/30 p-6 max-w-md w-full shadow-xl">
        <h2 className="text-cartoon-blue text-lg font-bold mb-1">Appeal this change</h2>
        <p className="text-zinc-600 text-sm mb-3">
          Briefly explain why this strike should be reviewed. Mediators will vote to{" "}
          <strong>overturn</strong> (revert the change) or <strong>uphold</strong> (keep it).
          Appeals resolve when one side reaches a majority, or default to <strong>uphold</strong>{" "}
          after 24 h.
        </p>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value.slice(0, MAX_APPEAL_LEN))}
          className="w-full border-2 border-cartoon-blue/30 rounded-xl px-3 py-2 mb-1 text-sm min-h-[100px]"
          placeholder="Your appeal…"
        />
        <div className="flex justify-end text-xs text-zinc-400 mb-3">
          {charLeft} characters remaining
        </div>
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
            disabled={busy || !canSubmit}
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
