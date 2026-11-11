"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setSessionToken } from "@/components/SessionBridge";
import { RecoveryPanel, type ErrorInfo } from "@/components/Recovery";

type Mode = "pending" | "cookie" | "header";

/** Finds out whether this browser keeps the portal's cookies in the current context. */
function useCookieProbe(): Mode {
  const [mode, setMode] = useState<Mode>("pending");
  useEffect(() => {
    let done = false;
    const finish = (m: Mode) => {
      if (done) return;
      done = true;
      setMode(m);
    };
    // If the check cannot complete, assume cookies do not work: that path works everywhere.
    const timer = setTimeout(() => finish("header"), 4000);
    (async () => {
      try {
        const p = await fetch("/api/session", { method: "POST", cache: "no-store", headers: { "x-dp-probe": "1" } });
        const pj = (await p.json()) as { requestHeaderArrived?: boolean; originArrived?: boolean };
        const d = (await (await fetch("/api/session", { cache: "no-store" })).json()) as { probeCookie?: boolean };
        finish(d.probeCookie ? "cookie" : "header");
        // Record what this browser's connection lets through (no personal data), for troubleshooting.
        void fetch("/api/client-error", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            where: "connection-check",
            requestHeaderArrived: pj.requestHeaderArrived === true,
            originArrived: pj.originArrived === true,
            responseHeaderArrived: p.headers.get("x-dp-probe-res") === "1",
            cookieKept: d.probeCookie === true,
            embedded: window.self !== window.top,
            path: window.location.pathname + window.location.search,
          }),
        }).catch(() => {});
      } catch {
        finish("header");
      }
    })();
    return () => {
      done = true;
      clearTimeout(timer);
    };
  }, []);
  return mode;
}

/** What the form knows after an attempt: the server's answer, or the fact that the request itself failed. */
type FormState = { error?: string; failed?: ErrorInfo & { at: number } } | undefined;

/**
 * Shared behaviour of the sign-in and first-run forms. They post JSON to
 * /api/auth/<op> (no Server Action, so no special request headers are needed).
 */
function useAuthForm(op: "login" | "setup") {
  const router = useRouter();
  const mode = useCookieProbe();
  const [state, setState] = useState<FormState>(undefined);
  const [busy, setBusy] = useState(false);

  // Cookies work here: make sure no old header token lingers.
  useEffect(() => {
    if (mode === "cookie") setSessionToken(null);
  }, [mode]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true);
    setState(undefined);
    let res: Response;
    let data: { ok?: boolean; error?: string; token?: string } = {};
    try {
      res = await fetch(`/api/auth/${op}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ...fields, cookieless: mode === "header" }),
      });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      const x = err as Error;
      setState({ failed: { name: x?.name, message: x?.message, at: Date.now() } });
      setBusy(false);
      return;
    }
    if (!data.ok) {
      // Our own JSON error (wrong password etc.), or a proxy/server error page.
      if (data.error) setState({ error: data.error });
      else setState({ failed: { name: "HTTP " + res.status, message: res.statusText || "Unexpected response from the server", at: Date.now() } });
      setBusy(false);
      return;
    }
    if (data.token) {
      // Cookie-less browser: keep the token for this tab; navigation then carries it.
      setSessionToken(data.token);
      router.replace("/dashboard");
      return;
    }
    // Normal case: the session cookie is set. A full page load needs nothing special.
    window.location.assign("/dashboard");
  }

  return { mode, state, submit, busy };
}

const field = "w-full rounded-xl border-2 border-slate-900 px-4 py-3.5 text-lg outline-none focus:border-[#0b4fb3]";
const fieldLabel = "mb-2 block text-lg text-slate-800";

function PasswordInput({ id, name, placeholder, autoComplete }: { id: string; name: string; placeholder: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={show ? "text" : "password"} autoComplete={autoComplete} placeholder={placeholder} required className={`${field} pr-12`} />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-900">
        {show ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </div>
  );
}

function FormStatus({ state }: { state: FormState }) {
  if (state?.failed) return <RecoveryPanel key={state.failed.at} where="sign-in" compact error={state.failed} />;
  if (!state?.error) return null;
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>;
}

function SubmitButton({ mode, busy, idle, working }: { mode: Mode; busy: boolean; idle: string; working: string }) {
  return (
    <button type="submit" disabled={busy || mode === "pending"} className="w-full rounded-xl bg-[#0b4fb3] py-4 text-xl font-medium text-white transition hover:bg-[#083d8c] disabled:opacity-60">
      {busy ? working : idle}
    </button>
  );
}

export function LoginForm() {
  const { mode, state, submit, busy } = useAuthForm("login");
  return (
    <form onSubmit={submit} className="mt-8 space-y-5" data-session-mode={mode}>
      <FormStatus state={state} />
      <div>
        <label htmlFor="identifier" className={fieldLabel}>Email / Username</label>
        <input id="identifier" name="identifier" type="text" autoComplete="username" placeholder="admin@example.com" required className={field} />
      </div>
      <div>
        <label htmlFor="password" className={fieldLabel}>Password</label>
        <PasswordInput id="password" name="password" placeholder="********" autoComplete="current-password" />
      </div>
      <div className="text-right">
        <span className="text-lg text-[#0b4fb3]" title="Ask your staff/admin to reset your password">Forgot Password?</span>
      </div>
      <SubmitButton mode={mode} busy={busy} idle="Sign In" working="Signing In..." />
    </form>
  );
}

/** Shown only while the database has no users: creates the Super Admin account. */
export function SetupForm() {
  const { mode, state, submit, busy } = useAuthForm("setup");
  return (
    <form onSubmit={submit} className="mt-6 space-y-4" data-session-mode={mode}>
      <FormStatus state={state} />
      <div>
        <label htmlFor="name" className={fieldLabel}>Your full name</label>
        <input id="name" name="name" type="text" autoComplete="name" required className={field} />
      </div>
      <div>
        <label htmlFor="email" className={fieldLabel}>Your email</label>
        <input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required className={field} />
      </div>
      <div>
        <label htmlFor="password" className={fieldLabel}>Choose a password</label>
        <PasswordInput id="password" name="password" placeholder="At least 8 characters" autoComplete="new-password" />
      </div>
      <div>
        <label htmlFor="confirm" className={fieldLabel}>Repeat the password</label>
        <PasswordInput id="confirm" name="confirm" placeholder="Repeat password" autoComplete="new-password" />
      </div>
      <SubmitButton mode={mode} busy={busy} idle="Create Super Admin" working="Creating..." />
    </form>
  );
}
