"use client";

import { useEffect, useRef, useState } from "react";

/**
 * What to do when a request from the page fails.
 *
 * The usual cause is not a bug: the page is on screen but the server behind it is
 * not answering (restarting after an update, or a preview that has gone to sleep),
 * or the page was loaded from an older version. A fresh load fixes both, so we wait
 * until the server answers and then reload. Only if a reload did not help do we
 * stop and show the technical details.
 */

export type ErrorInfo = { name?: string; message?: string; digest?: string };

const RELOAD_KEY = "dp_auto_reload_at";
const RELOAD_GUARD_MS = 20_000;
let memoryReloadAt = 0;

function lastAutoReload(): number {
  try {
    return Math.max(memoryReloadAt, Number(window.sessionStorage.getItem(RELOAD_KEY) || 0));
  } catch {
    return memoryReloadAt;
  }
}

function autoReload() {
  memoryReloadAt = Date.now();
  try {
    window.sessionStorage.setItem(RELOAD_KEY, String(memoryReloadAt));
  } catch {
    // ignore
  }
  window.location.reload();
}

/** True when the portal's own server answers (even if it reports a database problem). */
export async function serverReachable(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: ctrl.signal });
    const body = (await res.json()) as { ok?: unknown };
    return typeof body?.ok === "boolean";
  } catch {
    return false; // network failure, timeout, or a proxy's HTML error page instead of our JSON
  } finally {
    clearTimeout(timer);
  }
}

function report(where: string, error: ErrorInfo | undefined, reachableAtFailure: boolean) {
  try {
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        where,
        name: error?.name,
        message: error?.message,
        digest: error?.digest,
        path: window.location.pathname,
        serverReachable: reachableAtFailure,
      }),
    }).catch(() => {});
  } catch {
    // ignore
  }
}

type Phase = "checking" | "down" | "reloading" | "failed";

export function RecoveryPanel({
  where,
  error,
  compact = false,
  onRetry,
}: {
  where: string;
  error?: ErrorInfo;
  compact?: boolean;
  onRetry?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [checks, setChecks] = useState(0);
  const errorRef = useRef(error);
  errorRef.current = error;

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    let reachableAtFailure = false;
    let n = 0;

    const tick = async () => {
      const up = await serverReachable();
      if (stopped) return;
      if (first) {
        reachableAtFailure = up;
        first = false;
      }
      if (!up) {
        n += 1;
        setChecks(n);
        setPhase("down");
        timer = setTimeout(tick, n < 20 ? 3000 : 10000);
        return;
      }
      report(where, errorRef.current, reachableAtFailure);
      if (Date.now() - lastAutoReload() > RELOAD_GUARD_MS) {
        setPhase("reloading");
        timer = setTimeout(autoReload, 900);
      } else {
        // We reloaded moments ago and it failed again: stop looping and show the details.
        setPhase("failed");
      }
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [where]);

  const box = compact ? "rounded-lg border p-3 text-sm" : "rounded-xl border p-5 text-sm";

  if (phase === "checking") {
    return <div role="status" className={`${box} border-slate-200 bg-slate-50 text-slate-700`}>Checking the connection to the portal…</div>;
  }

  if (phase === "reloading") {
    return <div role="status" className={`${box} border-emerald-200 bg-emerald-50 text-emerald-800`}>The portal is answering again. Reloading this page…</div>;
  }

  if (phase === "down") {
    return (
      <div role="alert" className={`${box} border-amber-300 bg-amber-50 text-amber-900`}>
        <p className="font-semibold">The portal server is not answering right now.</p>
        <p className="mt-1">
          It is usually restarting after an update, or the preview has gone to sleep. Nothing is wrong with your account or password.
          This page reloads by itself as soon as the server is back.
        </p>
        <p className="mt-2 text-xs">Checked {checks} time{checks === 1 ? "" : "s"}. Still waiting…</p>
        {checks >= 10 && (
          <p className="mt-2 text-xs">
            Still no answer. If you are viewing this inside the app builder&apos;s preview, the preview has most likely been shut down: refresh or reopen the preview there.
          </p>
        )}
        <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900">
          Reload now
        </button>
      </div>
    );
  }

  return (
    <div role="alert" className={`${box} border-red-200 bg-red-50 text-red-800`}>
      <p className="font-semibold">Something went wrong on this page.</p>
      <p className="mt-1">The server is answering and a fresh reload did not clear it, so this is a real error. Please pass on the details below.</p>
      <dl className="mt-3 space-y-1 rounded-lg bg-white p-3 font-mono text-xs text-slate-700">
        <div><dt className="inline font-semibold">Page: </dt><dd className="inline break-all">{typeof window !== "undefined" ? window.location.pathname : ""}</dd></div>
        <div><dt className="inline font-semibold">Error: </dt><dd className="inline break-words">{error?.name ? `${error.name}: ` : ""}{error?.message || "(no message)"}</dd></div>
        {error?.digest && <div><dt className="inline font-semibold">Reference: </dt><dd className="inline">{error.digest}</dd></div>}
        <div><dt className="inline font-semibold">Time: </dt><dd className="inline">{new Date().toISOString()}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRetry && <button type="button" onClick={onRetry} className="rounded-lg bg-[#0b4fb3] px-3 py-1.5 text-xs font-semibold text-white">Try again</button>}
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold">Reload page</button>
        {!compact && <a href="/" className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold">Go to sign in</a>}
      </div>
    </div>
  );
}

/** Full-page version used by the app's error boundaries. */
export function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h1 className="text-xl font-bold text-slate-900">D.prince Learning Portal</h1>
        <p className="mb-4 mt-1 text-sm text-slate-500">The last action could not be completed.</p>
        <RecoveryPanel where="error-boundary" error={{ name: error.name, message: error.message, digest: error.digest }} onRetry={reset} />
      </div>
    </main>
  );
}
