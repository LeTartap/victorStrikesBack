import { useState } from "react";
import { ChevronUp, ChevronDown, RotateCcw, Lock, Unlock } from "lucide-react";
import { useStrikeCount } from "./useStrikeCount";

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

function ControlPanel({
  onAdd,
  onSubtract,
  onReset,
  count,
  isAdmin,
  busy,
  loading,
  mutationError,
  onClearMutationError,
  onUnlock,
  onLock,
}: {
  onAdd: (n: number) => Promise<void>;
  onSubtract: (n: number) => Promise<void>;
  onReset: () => Promise<void>;
  count: number;
  isAdmin: boolean;
  busy: boolean;
  loading: boolean;
  mutationError: string | null;
  onClearMutationError: () => void;
  onUnlock: (token: string) => void;
  onLock: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [tokenInput, setTokenInput] = useState("");

  const cartoonBtn =
    "px-5 py-2.5 rounded-full font-semibold text-sm text-white transition-all select-none";
  const bevelActive = "active:translate-y-[3px] active:shadow-none";
  const disabledMut = !isAdmin || busy || loading;

  const run = async (fn: () => Promise<void>) => {
    onClearMutationError();
    await fn();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50">
      {showUnlock && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unlock-title"
        >
          <div className="bg-white rounded-3xl border-4 border-cartoon-blue/30 p-6 max-w-sm w-full shadow-xl">
            <h2 id="unlock-title" className="text-cartoon-blue text-lg font-bold mb-2">
              Admin token
            </h2>
            <p className="text-zinc-600 text-sm mb-3">
              Enter the same secret you set as <code className="text-xs bg-zinc-100 px-1 rounded">ADMIN_TOKEN</code> on the server.
            </p>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              className="w-full border-2 border-cartoon-blue/30 rounded-xl px-3 py-2 mb-4 font-mono text-sm"
              placeholder="Token"
              autoComplete="off"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowUnlock(false);
                  setTokenInput("");
                }}
                className="px-4 py-2 rounded-full border-2 border-zinc-300 text-zinc-600 font-semibold text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onUnlock(tokenInput);
                  setTokenInput("");
                  setShowUnlock(false);
                  setOpen(true);
                }}
                disabled={!tokenInput.trim()}
                className="px-4 py-2 rounded-full bg-cartoon-blue text-white font-semibold text-sm cursor-pointer disabled:opacity-40"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto">
        <button
          onClick={() => setOpen(!open)}
          className="mx-auto flex items-center gap-2 px-5 py-2 bg-cartoon-blue text-white
                     rounded-t-2xl text-sm font-semibold
                     hover:bg-cartoon-blue/90 transition-colors cursor-pointer"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          Controls
        </button>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            open ? "max-h-[28rem] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div
            className="flex flex-col gap-3 p-5 bg-white border-t-3 border-cartoon-blue/20
                        rounded-t-none"
          >
            <div className="flex flex-wrap items-center justify-center gap-2">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={onLock}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full border-2 border-strike-red/40
                             text-strike-red text-sm font-semibold cursor-pointer hover:bg-strike-red/5"
                >
                  <Lock className="w-4 h-4" />
                  Lock editing
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowUnlock(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-cartoon-blue/15
                             text-cartoon-blue text-sm font-semibold cursor-pointer border-2 border-cartoon-blue/30"
                >
                  <Unlock className="w-4 h-4" />
                  Unlock to change strikes
                </button>
              )}
            </div>

            {!isAdmin && (
              <p className="text-center text-zinc-500 text-xs">
                Everyone can see the count. Only you can change it after unlocking.
              </p>
            )}

            {mutationError && (
              <p className="text-center text-strike-red text-sm font-medium">{mutationError}</p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => run(() => onAdd(0.5))}
                disabled={disabledMut}
                className={`${cartoonBtn} ${bevelActive} bg-mint shadow-[0_4px_0_var(--color-mint-dark)]
                            ${disabledMut ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
              >
                + 0.5 Strike
              </button>
              <button
                type="button"
                onClick={() => run(() => onAdd(1))}
                disabled={disabledMut}
                className={`${cartoonBtn} ${bevelActive} bg-mint shadow-[0_4px_0_var(--color-mint-dark)]
                            ${disabledMut ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
              >
                + 1 Strike
              </button>
              <button
                type="button"
                onClick={() => run(() => onSubtract(0.5))}
                disabled={disabledMut || count <= 0}
                className={`${cartoonBtn} ${bevelActive} bg-coral shadow-[0_4px_0_var(--color-coral-dark)]
                            disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none
                            ${disabledMut ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
              >
                − 0.5 Strike
              </button>
              <button
                type="button"
                onClick={() => run(() => onReset())}
                disabled={disabledMut || count === 0}
                className={`px-5 py-2.5 rounded-full font-semibold text-sm transition-all select-none
                            border-2 border-cartoon-blue text-cartoon-blue
                            hover:bg-cartoon-blue/10 flex items-center gap-1.5
                            disabled:opacity-30 disabled:cursor-not-allowed disabled:pointer-events-none
                            ${disabledMut ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
          </div>
        </div>
      </div>
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
  const {
    count,
    loading,
    loadError,
    isAdmin,
    add,
    subtract,
    reset,
    unlock,
    lock,
  } = useStrikeCount();

  const [mutationError, setMutationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runMutation = async (fn: () => Promise<void>) => {
    setMutationError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setMutationError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 pb-24 select-none">
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
            Run the API (see README), or use <code className="bg-white/80 px-1 rounded">npm run dev</code> with the API on port 3000.
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
        </>
      )}

      {!loadError && (
        <ControlPanel
          onAdd={(n) => runMutation(() => add(n))}
          onSubtract={(n) => runMutation(() => subtract(n))}
          onReset={() => runMutation(() => reset())}
          count={count}
          isAdmin={isAdmin}
          busy={busy}
          loading={loading}
          mutationError={mutationError}
          onClearMutationError={() => setMutationError(null)}
          onUnlock={unlock}
          onLock={lock}
        />
      )}
    </div>
  );
}
