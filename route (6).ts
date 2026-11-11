import { NextResponse } from "next/server";
import { createSession, destroySession } from "@/lib/auth";
import { checkCredentials, createFirstSuperAdmin } from "@/lib/auth-flow";
import { logEvent } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

/**
 * Sign-in, first-run setup and sign-out as plain JSON requests.
 *
 * These deliberately do not use Server Actions: those need the `Next-Action`
 * request header, which the hosted preview strips. A JSON POST to a fixed URL
 * needs no special headers.
 *
 * On success the session cookie is set. If the page has found that this browser
 * does not keep our cookie (`cookieless: true`), no cookie is set and the token is
 * returned in the body instead; the page then sends it with each request.
 */
const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status, headers: noStore });
const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(req: Request, ctx: RouteContext<"/api/auth/[op]">) {
  const { op } = await ctx.params;

  if (op === "logout") {
    await destroySession();
    return NextResponse.json({ ok: true }, { headers: noStore });
  }
  if (op !== "login" && op !== "setup") return fail("Unknown request.", 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("The request could not be read. Please try again.");
  }

  try {
    const result =
      op === "login"
        ? await checkCredentials(str(body.identifier), str(body.password))
        : await createFirstSuperAdmin({ name: str(body.name), email: str(body.email), password: str(body.password), confirm: str(body.confirm) });
    if (!result.ok) {
      logEvent(op === "login" ? "sign-in-failed" : "setup-failed", {
        reason: result.error,
        identifierLooksLikeEmail: op === "login" ? str(body.identifier).includes("@") : undefined,
        cookieless: body.cookieless === true,
      });
      return fail(result.error, op === "login" ? 401 : 400);
    }
    logEvent(op === "login" ? "sign-in-ok" : "setup-ok", { cookieless: body.cookieless === true });

    const cookieless = body.cookieless === true;
    const token = await createSession(result.userId, !cookieless);
    return NextResponse.json({ ok: true, ...(cookieless ? { token } : {}) }, { headers: noStore });
  } catch (e) {
    const err = e as Error & { cause?: { message?: string } };
    logEvent("server-error", { name: err.name, message: err.message, cause: err.cause?.message, path: `/api/auth/${op}` });
    return fail("The portal could not reach its database. Please try again in a moment.", 503);
  }
}
