import { NextResponse } from "next/server";
import { logEvent } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

// The browser's error screen reports what it saw here. Open to signed-out visitors on
// purpose (the sign-in page is where errors matter most), so it is tightly limited:
// small body, a few short text fields, and a global cap per minute.
let windowStart = 0;
let count = 0;

export async function POST(req: Request) {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    count = 0;
  }
  if (++count > 30) return NextResponse.json({ ok: false }, { status: 429 });

  const raw = await req.text().catch(() => "");
  if (raw.length > 4000) return NextResponse.json({ ok: false }, { status: 413 });
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const text = (k: string, n = 300) => (typeof body[k] === "string" ? (body[k] as string).slice(0, n) : undefined);

  if (body.where === "connection-check") {
    const flag = (k: string) => (typeof body[k] === "boolean" ? body[k] : undefined);
    logEvent("connection-check", {
      requestHeaderArrived: flag("requestHeaderArrived"),
      originArrived: flag("originArrived"),
      responseHeaderArrived: flag("responseHeaderArrived"),
      cookieKept: flag("cookieKept"),
      embedded: flag("embedded"),
      path: text("path", 200),
      userAgent: req.headers.get("user-agent") ?? undefined,
    });
    return NextResponse.json({ ok: true });
  }

  logEvent("client-error", {
    where: text("where", 40),
    name: text("name", 80),
    message: text("message"),
    digest: text("digest", 80),
    path: text("path", 200),
    serverReachable: typeof body.serverReachable === "boolean" ? body.serverReachable : undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  return NextResponse.json({ ok: true });
}
