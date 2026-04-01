import { useCallback, useEffect, useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  LogIn,
  LogOut,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  KeyRound,
} from "lucide-react";
import { useStrikeCount } from "./useStrikeCount";
import { useAuth } from "./useAuth";
import { apiFetch } from "./api";
import { HistorySection, AppealModal } from "./HistorySection";
import { MediatorAppeals } from "./MediatorAppeals";
import { DavidAppealsList } from "./DavidAppealsList";

type ApiUserRow = { id: number; username: string; role: string; created_at: string };

// ── Change-password modal (all roles) ─────────────────────────────────────
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setErr(null);
    if (nw.length < 6) {
      setErr("New password must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      const r = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: cur, new_password: nw }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed");
      }
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chpw-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl border-2 border-cartoon-blue/25 shadow-xl max-w-sm w-full p-5 flex flex-col gap-3">
        <h3 id="chpw-title" className="font-bold text-cartoon-blue text-lg">
          Change my password
        </h3>
        {ok ? (
          <>
            <p className="text-mint font-semibold text-sm">Password changed successfully!</p>
            <button
              type="button"
              onClick={onClose}
              className="self-end px-4 py-2 rounded-full bg-cartoon-blue text-white text-sm font-semibold cursor-pointer"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <input
              type="password"
              value={cur}
              onChange={(e) => setCur(e.target.value)}
              className="border-2 border-cartoon-blue/20 rounded-lg px-2 py-1.5 text-sm"
              placeholder="Current password"
              autoComplete="current-password"
            />
            <input
              type="password"
              value={nw}
              onChange={(e) => setNw(e.target.value)}
              className="border-2 border-cartoon-blue/20 rounded-lg px-2 py-1.5 text-sm"
              placeholder="New password (min 6)"
              autoComplete="new-password"
            />
            {err && <p className="text-strike-red text-sm">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="px-3 py-1.5 rounded-full text-sm border-2 border-zinc-300 text-zinc-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !cur || !nw}
                onClick={() => void submit()}
                className="px-3 py-1.5 rounded-full text-sm font-semibold bg-cartoon-blue text-white cursor-pointer disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Strike display ─────────────────────────────────────────────────────────

function VictorStrikeIcon({ half = false }: { half?: boolean }) {
  return (
    <div
      className="w-28 h-28 sm:w-36 sm:h-36 flex-shrink-0"
      style={half ? { clipPath: "inset(0 0 0 50%)" } : undefined}
    >
      <img
        src="/victor-head.png"
        alt="Strike"
        className="w-full h-full object-contain drop-shadow-lg"
        draggable={false}
      />
    </div>
  );
}

function GoodVictorDisplay() {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="text-cartoon-blue text-2xl sm:text-3xl font-bold">
        Victor, you're a good boy!
      </span>
      <img
        src="/good_victor.png"
        alt="Good Victor"
        className="w-48 h-48 sm:w-64 sm:h-64 object-contain drop-shadow-xl"
        draggable={false}
      />
    </div>
  );
}

function StrikeDisplay({ count }: { count: number }) {
  if (count === 0) return <GoodVictorDisplay />;

  const fullStrikes = Math.floor(count);
  const hasHalf = count % 1 !== 0;
  const totalIcons = fullStrikes + (hasHalf ? 1 : 0);

  const coreIcons: React.ReactNode[] = [];
  const overflowIcons: React.ReactNode[] = [];

  for (let i = 0; i < totalIcons; i++) {
    const isHalf = hasHalf && i === fullStrikes;
    const icon = <VictorStrikeIcon key={i} half={isHalf} />;

    if (i < 3) {
      coreIcons.push(icon);
    } else {
      overflowIcons.push(icon);
    }
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <div className="flex items-center gap-2 sm:gap-4">{coreIcons}</div>

      {overflowIcons.length > 0 && (
        <div
          className="absolute top-0 flex items-center gap-2 sm:gap-4 whitespace-nowrap"
          style={{ left: "100%" }}
        >
          {overflowIcons}
        </div>
      )}
    </div>
  );
}

function TimeoutBanner() {
  return (
    <div className="mt-8" style={{ animation: "wobble 0.6s ease-in-out infinite" }}>
      <div
        className="inline-block px-8 py-4 bg-warning-yellow border-4 border-dashed border-strike-red
                    rounded-2xl shadow-lg"
      >
        <span className="text-strike-red text-2xl sm:text-4xl font-bold tracking-wide">
          ⚠ VICTOR'S IN TIMEOUT! ⚠
        </span>
      </div>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const { count, loading, loadError, refetch } = useStrikeCount();

  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showChangePw, setShowChangePw] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [appealHistId, setAppealHistId] = useState<number | null>(null);

  // David strike controls — staged local value + explanation
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [explanation, setExplanation] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  // When count loads, sync pendingCount
  useEffect(() => {
    if (!loading && count != null && pendingCount === null) {
      setPendingCount(count);
    }
  }, [loading, count, pendingCount]);

  // Reset staged value to current live count if panel is closed without confirming
  useEffect(() => {
    if (!panelOpen) {
      setPendingCount(count ?? null);
      setMutationError(null);
    }
  }, [panelOpen, count]);

  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<"victor" | "mediator">("victor");
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [users, setUsers] = useState<ApiUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [editUser, setEditUser] = useState<ApiUserRow | null>(null);
  const [editPass, setEditPass] = useState("");
  const [editRole, setEditRole] = useState<"victor" | "mediator">("victor");
  const [userManageBusy, setUserManageBusy] = useState(false);

  const isDavid = user?.role === "david";
  const isVictor = user?.role === "victor";
  const isMediator = user?.role === "mediator";

  const bumpHistory = () => setHistoryKey((k) => k + 1);

  // ── David strike mutations ──────────────────────────────────────────────
  const adjustPending = (delta: number) => {
    setPendingCount((prev) => {
      const base = prev ?? count ?? 0;
      return Math.max(0, Math.round((base + delta) * 2) / 2);
    });
    setMutationError(null);
  };

  const resetPending = () => {
    setPendingCount(0);
    setMutationError(null);
  };

  const confirmStrikeChange = async () => {
    if (pendingCount === null) return;
    const exp = explanation.trim();
    if (!exp) {
      setMutationError("A reason is required before confirming.");
      return;
    }
    setMutationError(null);
    setBusy(true);
    try {
      const r = await apiFetch("/api/strikes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: pendingCount, explanation: exp }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed");
      }
      setExplanation("");
      bumpHistory();
      await refetch();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // ── User management ────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    if (!isDavid) return;
    setUsersLoading(true);
    try {
      const r = await apiFetch("/api/users");
      if (r.ok) {
        const j = (await r.json()) as { users: ApiUserRow[] };
        setUsers(j.users ?? []);
      }
    } finally {
      setUsersLoading(false);
    }
  }, [isDavid]);

  useEffect(() => {
    if (isDavid && panelOpen) void loadUsers();
  }, [isDavid, panelOpen, loadUsers]);

  const createUser = async () => {
    setUserMsg(null);
    try {
      const r = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newName.trim(),
          password: newPass,
          role: newRole,
        }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Failed");
      }
      setUserMsg(`Created ${newName.trim()}`);
      setNewName("");
      setNewPass("");
      await loadUsers();
    } catch (e) {
      setUserMsg(e instanceof Error ? e.message : "Error");
    }
  };

  const saveUserEdit = async () => {
    if (!editUser) return;
    const body: { password?: string; role?: string } = {};
    if (editPass.trim()) body.password = editPass;
    if (editRole !== editUser.role) body.role = editRole;
    if (Object.keys(body).length === 0) {
      setEditUser(null);
      setEditPass("");
      return;
    }
    setUserMsg(null);
    setUserManageBusy(true);
    try {
      const r = await apiFetch(`/api/users/${editUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Update failed");
      }
      setUserMsg(`Updated ${editUser.username}`);
      setEditUser(null);
      setEditPass("");
      await loadUsers();
    } catch (e) {
      setUserMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setUserManageBusy(false);
    }
  };

  const removeUser = async (u: ApiUserRow) => {
    if (u.role === "david") return;
    if (
      !confirm(
        `Remove user "${u.username}"? Their appeals and mediator votes will be deleted.`,
      )
    )
      return;
    setUserMsg(null);
    setUserManageBusy(true);
    try {
      const r = await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Delete failed");
      }
      setUserMsg(`Removed ${u.username}`);
      await loadUsers();
    } catch (e) {
      setUserMsg(e instanceof Error ? e.message : "Error");
    } finally {
      setUserManageBusy(false);
    }
  };

  const submitAppeal = async (message: string) => {
    if (appealHistId == null) return;
    const r = await apiFetch(`/api/history/${appealHistId}/appeals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? "Appeal failed");
    }
    bumpHistory();
  };

  // Displayed staged count (while editing) or live count
  const displayedCount = pendingCount ?? count ?? 0;
  const hasChange = pendingCount !== null && pendingCount !== count;
  const expOk = explanation.trim().length > 0;

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 pb-32 select-none">
      {/* Top bar */}
      <div className="w-full max-w-2xl flex justify-end items-center gap-2 pt-3 mb-2">
        {authLoading ? (
          <span className="text-zinc-400 text-sm">…</span>
        ) : user ? (
          <>
            <span className="text-zinc-600 text-sm">
              {user.username} ({user.role})
            </span>
            <button
              type="button"
              onClick={() => setShowChangePw(true)}
              title="Change my password"
              className="flex items-center gap-1 px-2 py-1.5 rounded-full border-2 border-zinc-300 text-sm text-zinc-600 cursor-pointer"
            >
              <KeyRound className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border-2 border-zinc-300 text-sm text-zinc-600 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setShowLogin(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-cartoon-blue text-white text-sm font-semibold cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Log in
          </button>
        )}
      </div>

      <h1 className="text-cartoon-blue text-base sm:text-lg font-semibold tracking-[0.25em] uppercase mb-3">
        Victor's Strike Counter
      </h1>

      {loading && (
        <p className="text-cartoon-blue/70 text-lg font-medium mb-4">Loading strikes…</p>
      )}

      {loadError && !loading && (
        <div className="max-w-md text-center mb-6 p-4 rounded-2xl bg-strike-red/10 border-2 border-strike-red/30">
          <p className="text-strike-red font-semibold mb-1">Could not reach the server</p>
          <p className="text-zinc-600 text-sm">{loadError}</p>
          <p className="text-zinc-500 text-xs mt-2">
            Run the API with bootstrap env (see README). For dev: API on port 3000.
          </p>
        </div>
      )}

      {!loading && !loadError && (
        <>
          {count > 0 && (
            <p className="text-cartoon-blue text-2xl sm:text-4xl md:text-5xl font-bold text-center max-w-[22ch] leading-tight mb-6 px-2">
              Times Victor has tested my patience:
            </p>
          )}

          <div className="mb-8">
            <span className="text-6xl sm:text-8xl font-bold tabular-nums tracking-tight text-cartoon-blue">
              {count.toFixed(1)}
            </span>
            <span className="text-cartoon-blue/50 text-xl sm:text-2xl font-medium ml-3">
              {count === 1 ? "strike" : "strikes"}
            </span>
          </div>

          <div className="overflow-visible flex justify-center w-full">
            <StrikeDisplay count={count} />
          </div>

          {count >= 3 && <TimeoutBanner />}

          <HistorySection
            refreshKey={historyKey}
            user={user}
            onAppealClick={(id) => setAppealHistId(id)}
          />

          {isVictor && (
            <AppealModal
              open={appealHistId != null}
              historyId={appealHistId}
              onClose={() => setAppealHistId(null)}
              onSubmit={submitAppeal}
            />
          )}

          {isMediator && <MediatorAppeals refreshKey={historyKey} />}
          {isDavid && <DavidAppealsList refreshKey={historyKey} />}
        </>
      )}

      {/* Login modal */}
      {showLogin && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-3xl border-4 border-cartoon-blue/30 p-6 max-w-sm w-full shadow-xl">
            <h2 className="text-cartoon-blue text-lg font-bold mb-2">Log in</h2>
            <input
              type="text"
              value={loginUser}
              onChange={(e) => setLoginUser(e.target.value)}
              className="w-full border-2 border-cartoon-blue/30 rounded-xl px-3 py-2 mb-2 text-sm"
              placeholder="Username"
              autoComplete="username"
            />
            <input
              type="password"
              value={loginPass}
              onChange={(e) => setLoginPass(e.target.value)}
              className="w-full border-2 border-cartoon-blue/30 rounded-xl px-3 py-2 mb-2 text-sm"
              placeholder="Password"
              autoComplete="current-password"
            />
            {loginErr && <p className="text-strike-red text-sm mb-2">{loginErr}</p>}
            <div className="flex gap-2 justify-end mt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLogin(false);
                  setLoginErr(null);
                }}
                className="px-4 py-2 rounded-full border-2 border-zinc-300 text-zinc-600 font-semibold text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  setLoginErr(null);
                  try {
                    await login(loginUser.trim(), loginPass);
                    setShowLogin(false);
                    setLoginPass("");
                  } catch (e) {
                    setLoginErr(e instanceof Error ? e.message : "Login failed");
                  }
                }}
                disabled={!loginUser.trim() || !loginPass}
                className="px-4 py-2 rounded-full bg-cartoon-blue text-white font-semibold text-sm cursor-pointer disabled:opacity-40"
              >
                Log in
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change password modal */}
      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}

      {/* Controls drawer */}
      {!loadError && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          <div className="max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => setPanelOpen(!panelOpen)}
              className="mx-auto flex items-center gap-2 px-5 py-2 bg-cartoon-blue text-white
                         rounded-t-2xl text-sm font-semibold
                         hover:bg-cartoon-blue/90 transition-colors cursor-pointer"
            >
              {panelOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
              Controls
            </button>

            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                panelOpen ? "max-h-[32rem] opacity-100 overflow-y-auto" : "max-h-0 opacity-0"
              }`}
            >
              <div
                className="flex flex-col gap-3 p-5 bg-white border-t-3 border-cartoon-blue/20
                            rounded-t-none max-h-[70vh] overflow-y-auto"
              >
                {isDavid && (
                  <>
                    {/* ── Staged strike count ── */}
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-xs text-zinc-500 text-center">
                        Adjust the count, enter a reason, then press{" "}
                        <strong>Confirm</strong> to save.
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <button
                          type="button"
                          disabled={busy || displayedCount <= 0}
                          onClick={() => adjustPending(-0.5)}
                          className="w-10 h-10 rounded-full bg-coral text-white font-bold text-xl shadow-[0_3px_0_var(--color-coral-dark)] active:translate-y-[2px] active:shadow-none disabled:opacity-30 cursor-pointer disabled:pointer-events-none flex items-center justify-center"
                        >
                          −
                        </button>
                        <span className="text-3xl font-bold tabular-nums text-cartoon-blue min-w-[4rem] text-center">
                          {displayedCount.toFixed(1)}
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => adjustPending(0.5)}
                          className="w-10 h-10 rounded-full bg-mint text-white font-bold text-xl shadow-[0_3px_0_var(--color-mint-dark)] active:translate-y-[2px] active:shadow-none disabled:opacity-30 cursor-pointer disabled:pointer-events-none flex items-center justify-center"
                        >
                          +
                        </button>
                      </div>
                      {hasChange && (
                        <p className="text-xs text-zinc-500">
                          Changing from {count?.toFixed(1)} → {displayedCount.toFixed(1)}
                        </p>
                      )}
                    </div>

                    <label className="block text-sm text-zinc-600 font-medium">
                      Reason for change (required)
                    </label>
                    <textarea
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value.slice(0, 500))}
                      className="w-full border-2 border-cartoon-blue/30 rounded-xl px-3 py-2 text-sm min-h-[72px]"
                      placeholder="Why are you changing the count?"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        disabled={busy || !hasChange || !expOk}
                        onClick={() => void confirmStrikeChange()}
                        className="px-5 py-2.5 rounded-full font-semibold text-sm text-white bg-cartoon-blue shadow-[0_4px_0_#2563eb] active:translate-y-[3px] active:shadow-none disabled:opacity-40 cursor-pointer disabled:pointer-events-none"
                      >
                        Confirm change
                      </button>
                      <button
                        type="button"
                        disabled={busy || displayedCount === 0}
                        onClick={() => {
                          resetPending();
                        }}
                        className="px-4 py-2 rounded-full text-sm border-2 border-cartoon-blue text-cartoon-blue hover:bg-cartoon-blue/10 flex items-center gap-1 disabled:opacity-30 cursor-pointer disabled:pointer-events-none"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset to 0
                      </button>
                      {hasChange && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setPendingCount(count ?? 0)}
                          className="px-3 py-1.5 rounded-full text-xs border border-zinc-300 text-zinc-600 cursor-pointer"
                        >
                          Undo
                        </button>
                      )}
                    </div>
                    {mutationError && (
                      <p className="text-center text-strike-red text-sm font-medium">
                        {mutationError}
                      </p>
                    )}

                    {/* ── Accounts list ── */}
                    <div className="border-t border-dashed border-zinc-200 pt-4 mt-2">
                      <h3 className="text-cartoon-blue font-bold text-sm mb-2 flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Accounts
                      </h3>
                      {usersLoading ? (
                        <p className="text-xs text-zinc-500">Loading users…</p>
                      ) : (
                        <ul className="flex flex-col gap-1.5 text-sm">
                          {users.map((u) => (
                            <li
                              key={u.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200/80 px-2 py-1.5"
                            >
                              <span className="font-medium text-zinc-800">
                                {u.username}{" "}
                                <span className="text-zinc-500 font-normal">({u.role})</span>
                              </span>
                              {u.role === "david" ? (
                                <span className="text-xs text-zinc-400">David account</span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={userManageBusy}
                                    onClick={() => {
                                      setEditUser(u);
                                      setEditPass("");
                                      setEditRole(u.role === "mediator" ? "mediator" : "victor");
                                    }}
                                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-cartoon-blue/30 text-cartoon-blue text-xs font-semibold cursor-pointer disabled:opacity-40"
                                  >
                                    <Pencil className="w-3 h-3" />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    disabled={userManageBusy || u.id === user?.id}
                                    onClick={() => void removeUser(u)}
                                    className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-strike-red/40 text-strike-red text-xs font-semibold cursor-pointer disabled:opacity-40"
                                    title={
                                      u.id === user?.id
                                        ? "Cannot remove your own account"
                                        : undefined
                                    }
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Remove
                                  </button>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* ── Add user ── */}
                    <div className="border-t border-dashed border-zinc-200 pt-4 mt-2">
                      <h3 className="text-cartoon-blue font-bold text-sm mb-2 flex items-center gap-2">
                        <UserPlus className="w-4 h-4" />
                        Add user (Victor or Mediator)
                      </h3>
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="border-2 border-cartoon-blue/20 rounded-lg px-2 py-1.5 text-sm"
                          placeholder="Username"
                        />
                        <input
                          type="password"
                          value={newPass}
                          onChange={(e) => setNewPass(e.target.value)}
                          className="border-2 border-cartoon-blue/20 rounded-lg px-2 py-1.5 text-sm"
                          placeholder="Password (min 6)"
                        />
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as "victor" | "mediator")}
                          className="border-2 border-cartoon-blue/20 rounded-lg px-2 py-1.5 text-sm"
                        >
                          <option value="victor">Victor</option>
                          <option value="mediator">Mediator</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => void createUser()}
                          className="px-4 py-2 rounded-full bg-cartoon-blue text-white text-sm font-semibold cursor-pointer"
                        >
                          Create user
                        </button>
                        {userMsg && (
                          <p className="text-xs text-zinc-600 font-medium">{userMsg}</p>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {!isDavid && (
                  <p className="text-center text-zinc-500 text-xs">
                    Log in as <strong>David</strong> to change strikes. Victor and mediators use
                    Log in for appeals and votes.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal (David) */}
      {editUser && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-user-title"
        >
          <div className="bg-white rounded-2xl border-2 border-cartoon-blue/25 shadow-xl max-w-sm w-full p-4 flex flex-col gap-3">
            <h3 id="edit-user-title" className="font-bold text-cartoon-blue">
              Edit {editUser.username}
            </h3>
            <p className="text-xs text-zinc-500">
              Leave password blank to keep the current password. Change role between Victor and
              Mediator if needed.
            </p>
            <input
              type="password"
              value={editPass}
              onChange={(e) => setEditPass(e.target.value)}
              className="border-2 border-cartoon-blue/20 rounded-lg px-2 py-1.5 text-sm"
              placeholder="New password (min 6, optional)"
              autoComplete="new-password"
            />
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value as "victor" | "mediator")}
              className="border-2 border-cartoon-blue/20 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="victor">Victor</option>
              <option value="mediator">Mediator</option>
            </select>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={userManageBusy}
                onClick={() => {
                  setEditUser(null);
                  setEditPass("");
                }}
                className="px-3 py-1.5 rounded-full text-sm border-2 border-zinc-300 text-zinc-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={userManageBusy}
                onClick={() => void saveUserEdit()}
                className="px-3 py-1.5 rounded-full text-sm font-semibold bg-cartoon-blue text-white cursor-pointer disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
