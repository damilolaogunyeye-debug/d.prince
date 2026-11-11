/**
 * Header tunnel.
 *
 * In the hosted preview, something between the browser and this server removes
 * non-standard request headers (observed: `Next-Action` and `Origin` never arrive,
 * while the URL, including its query string, arrives intact). Next.js needs
 * `Next-Action` to run any form, and its routing headers for in-app navigation.
 *
 * So the page copies those headers into one query parameter, and `src/proxy.ts`
 * puts them back before Next.js handles the request. Where nothing strips headers
 * this is harmless: the values are identical to the real headers.
 *
 * Deliberately NOT tunnelled: Origin, Cookie, Host or anything security-relevant.
 * Origin in particular is what Next.js uses to reject cross-site form posts, and a
 * value supplied by the page must never be able to replace it.
 */
export const TUNNEL_PARAM = "__dph";

export const TUNNEL_HEADERS = [
  "next-action",
  "rsc",
  "next-router-state-tree",
  "next-router-prefetch",
  "next-router-segment-prefetch",
  "next-url",
  "next-hmr-refresh",
  "x-dp-session",
] as const;

const ALLOWED = new Set<string>(TUNNEL_HEADERS);

export function isTunnelHeader(name: string): boolean {
  return ALLOWED.has(name.toLowerCase());
}

/** base64url without padding, works in browsers and in Node. */
export function encodeTunnel(headers: Record<string, string>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(headers));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeTunnel(value: string): Record<string, string> {
  if (value.length > 12_000) return {};
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (isTunnelHeader(k) && typeof v === "string" && v.length < 8000 && !/[\r\n]/.test(v)) out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
}
