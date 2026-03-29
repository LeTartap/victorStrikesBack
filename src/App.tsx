import { useState } from "react";
import {
  ChevronUp,
  ChevronDown,
  RotateCcw,
  LogIn,
  LogOut,
  UserPlus,
} from "lucide-react";
import { useStrikeCount } from "./useStrikeCount";
import { useAuth } from "./useAuth";
import { apiFetch } from "./api";
import { HistorySection, AppealModal } from "./HistorySection";
import { MediatorAppeals } from "./MediatorAppeals";
import { DavidAppealsList } from "./DavidAppealsList";

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
      <div className="flex items-center gap-2 sm:gap-4">
        {coreIcons}
      </div>

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

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth();
  const {
    count,
    loading,
    loadError,
    add,
    subtract,
    reset,
    refetch,
  } = useStrikeCount();

  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginUser, setLoginUser] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  const [appealHistId, setAppealHistId] = useState<number | null>(null);

  const [newName, setNewName] = useState("");
  const [newPass, setNewPass] = useState("");
  const [newRole, setNewRole] = useState<"victor" | "mediator">("victor");
  const [userMsg, setUserMsg] = useState<string | null>(null);

  const isDavid = user?.role === "david";
  const isVictor = user?.role === "victor";
  const isMediator = user?.role === "mediator";

  const bumpHistory = () => setHistoryKey((k) => k + 1);

  const runMutation = async (fn: () => Promise<void>) => {
    setMutationError(null);
    setBusy(true);
    try {
      await fn();
      bumpHistory();
      await refetch();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const expOk = explanation.trim().length > 0;

  const handleLogin = async () => {
    setLoginErr(null);
    try {
      await login(loginUser.trim(), loginPass);
      setShowLogin(false);
      setLoginPass("");
    } catch (e) {
      setLoginErr(e instanceof Error ? e.message : "Login failed");
    }
  };

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
    } catch (e) {
      setUserMsg(e instanceof Error ? e.message : "Error");
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

  return (
    <div className="min-h-dvh flex flex-col items-center px-4 pb-32 select-none">
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
                onClick={() => void handleLogin()}
                disabled={!loginUser.trim() || !loginPass}
                className="px-4 py-2 rounded-full bg-cartoon-blue text-white font-semibold text-sm cursor-pointer disabled:opacity-40"
              >
                Log in
              </button>
            </div>
          </div>
        </div>
      )}

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
                    <label className="block text-sm text-zinc-600 font-medium">
                      Reason for strike change (required)
                    </label>
                    <textarea
                      value={explanation}
                      onChange={(e) => setExplanation(e.target.value)}
                      className="w-full border-2 border-cartoon-blue/30 rounded-xl px-3 py-2 text-sm min-h-[72px]"
                      placeholder="Why are you changing the count?"
                    />
                    {mutationError && (
                      <p className="text-center text-strike-red text-sm font-medium">{mutationError}</p>
                    )}
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        disabled={busy || !expOk}
                        onClick={() =>
                          runMutation(() => add(0.5, explanation.trim()))
                        }
                        className="px-5 py-2.5 rounded-full font-semibold text-sm text-white bg-mint shadow-[0_4px_0_var(--color-mint-dark)] active:translate-y-[3px] active:shadow-none disabled:opacity-40 cursor-pointer disabled:pointer-events-none"
                      >
                        + 0.5 Strike
                      </button>
                      <button
                        type="button"
                        disabled={busy || !expOk}
                        onClick={() => runMutation(() => add(1, explanation.trim()))}
                        className="px-5 py-2.5 rounded-full font-semibold text-sm text-white bg-mint shadow-[0_4px_0_var(--color-mint-dark)] active:translate-y-[3px] active:shadow-none disabled:opacity-40 cursor-pointer disabled:pointer-events-none"
                      >
                        + 1 Strike
                      </button>
                      <button
                        type="button"
                        disabled={busy || !expOk || count <= 0}
                        onClick={() =>
                          runMutation(() => subtract(0.5, explanation.trim()))
                        }
                        className="px-5 py-2.5 rounded-full font-semibold text-sm text-white bg-coral shadow-[0_4px_0_var(--color-coral-dark)] active:translate-y-[3px] active:shadow-none disabled:opacity-30 cursor-pointer disabled:pointer-events-none"
                      >
                        − 0.5 Strike
                      </button>
                      <button
                        type="button"
                        disabled={busy || !expOk || count === 0}
                        onClick={() => runMutation(() => reset(explanation.trim()))}
                        className="px-5 py-2.5 rounded-full font-semibold text-sm transition-all cursor-pointer
                                    border-2 border-cartoon-blue text-cartoon-blue
                                    hover:bg-cartoon-blue/10 flex items-center gap-1.5
                                    disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset
                      </button>
                    </div>

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
                          onChange={(e) =>
                            setNewRole(e.target.value as "victor" | "mediator")
                          }
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
    </div>
  );
}
