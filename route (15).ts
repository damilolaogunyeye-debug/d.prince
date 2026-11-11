import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { PROBE_COOKIE, cookieOptions, getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** Is this request signed in, and did the probe cookie come back? */
export async function GET() {
  const user = await getCurrentUser();
  const probeCookie = (await cookies()).get(PROBE_COOKIE)?.value === "1";
  return NextResponse.json({ authenticated: Boolean(user), probeCookie }, { headers: noStore });
}

/**
 * Sets a harmless probe cookie with exactly the attributes the session cookie uses.
 * The login page then calls GET to see whether the browser sent it back. If not
 * (embedded preview on Safari / iPhone, strict privacy settings), sign-in switches
 * to sending the session as a header instead.
 */
export async function POST() {
  (await cookies()).set(PROBE_COOKIE, "1", { ...(await cookieOptions()), maxAge: 600 });
  // Connection check: did a custom request header and the Origin header survive the trip?
  const h = await headers();
  return NextResponse.json(
    { ok: true, requestHeaderArrived: h.get("x-dp-probe") === "1", originArrived: Boolean(h.get("origin")) },
    { headers: { ...noStore, "x-dp-probe-res": "1" } },
  );
}
