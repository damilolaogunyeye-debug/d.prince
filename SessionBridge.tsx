"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TUNNEL_PARAM, encodeTunnel, isTunnelHeader } from "@/lib/header-tunnel";

/**
 * Cookie-less sign-in support.
 *
 * Normally the session lives in an httpOnly cookie and nothing here is used.
 * Some browsers refuse cookies when the portal is shown inside another site's
 * frame (the embedded preview bar; Safari and every iPhone browser; strict privacy
 * settings). In that case the sign-in form receives the session token, keeps it for
 * this tab only, and every request the app makes to itself carries it as a header.
 */
const TOKEN_KEY = "dp_session_token";
const PATH_KEY = "dp_last_path";
const HEADER = "x-dp-session";

let memoryToken: string | null = null;

export function getSessionToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    // storage blocked: the token then only lives in memory until the page is reloaded
  }
  return memoryToken;
}

export function setSessionToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else {
      window.sessionStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(PATH_KEY);
    }
  } catch {
    // ignore
  }
}

type PatchedWindow = Window & { __dpFetchPatched?: boolean };

/**
 * Every request the app makes to itself goes through here:
 *  - in cookie-less mode the session token is added as a header;
 *  - the headers Next.js depends on are also copied into the URL (see
 *    src/lib/header-tunnel.ts), because the hosted preview strips them.
 */
function installFetchPatch() {
  if (typeof window === "undefined") return;
  const w = window as PatchedWindow;
  if (w.__dpFetchPatched) return;
  w.__dpFetchPatched = true;
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    } catch {
      return original(input, init);
    }
    // Never touch requests to other sites.
    if (url.origin !== window.location.origin) return original(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = getSessionToken();
    if (token) headers.set(HEADER, token);

    const carried: Record<string, string> = {};
    headers.forEach((value, name) => {
      if (isTunnelHeader(name)) carried[name] = value;
    });
    if (Object.keys(carried).length === 0) return original(input, { ...init, headers });

    url.searchParams.set(TUNNEL_PARAM, encodeTunnel(carried));
    const sent = input instanceof Request ? original(new Request(url, input), { ...init, headers }) : original(url, { ...init, headers });
    if (!carried["next-action"]) return sent;
    return sent.then((res) => {
      // A form that finished with a redirect answers 303 and names the destination only in the
      // x-action-redirect response header. If the connection removed that header, Next.js would
      // silently stay put. Refresh instead and say why, so nobody submits the same form twice.
      if (res.status === 303 && !res.headers.get("x-action-redirect")) {
        try {
          window.sessionStorage.setItem(NOTE_KEY, "1");
        } catch {
          // ignore
        }
        window.location.reload();
        return new Promise<Response>(() => {});
      }
      return res;
    });
  };
}

const NOTE_KEY = "dp_hidden_reply_note";

// Installed as soon as this module loads, before the router makes any request.
installFetchPatch();

export function SessionBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const [hiddenReply, setHiddenReply] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(NOTE_KEY)) {
        window.sessionStorage.removeItem(NOTE_KEY);
        setHiddenReply(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // Remember where the user is, so a full reload can bring them back.
  useEffect(() => {
    if (!pathname.startsWith("/dashboard") || !getSessionToken()) return;
    try {
      window.sessionStorage.setItem(PATH_KEY, pathname + window.location.search);
    } catch {
      // ignore
    }
  }, [pathname]);

  // A full page load cannot carry the header, so the server shows the login page.
  // If this tab holds a valid token, continue to the dashboard automatically.
  useEffect(() => {
    if (pathname !== "/") return;
    const token = getSessionToken();
    if (!token) return;
    let cancelled = false;
    fetch("/api/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { authenticated?: boolean }) => {
        if (cancelled) return;
        if (!d.authenticated) return setSessionToken(null);
        let to = "/dashboard";
        try {
          to = window.sessionStorage.getItem(PATH_KEY) || to;
        } catch {
          // ignore
        }
        router.replace(to);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!hiddenReply) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[100] flex items-start justify-center p-3">
      <div className="flex max-w-xl items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg">
        <p>
          <b>Form submitted.</b> This connection hid the server&apos;s reply, so no confirmation message could be shown.
          The page has been refreshed: check it to confirm the change before submitting again.
        </p>
        <button type="button" onClick={() => setHiddenReply(false)} className="font-semibold" aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}
