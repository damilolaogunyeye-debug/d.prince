import type { Instrumentation } from "next";

/** Runs once when the server process starts, before it handles requests. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logEvent } = await import("@/lib/diagnostics");
  logEvent("server-start");
  // Reconnect to the database the Super Admin connected (e.g. Supabase), if any.
  const { restoreSavedConnection } = await import("@/lib/database-switch");
  await restoreSavedConnection();
}

/** Called by Next.js for every error thrown while handling a request. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logEvent } = await import("@/lib/diagnostics");
  const e = err as { message?: string; digest?: string; name?: string; cause?: { message?: string } };
  const header = (name: string) => {
    const v = request.headers[name];
    return Array.isArray(v) ? v.join(", ") : v;
  };
  logEvent("server-error", {
    name: e.name,
    message: e.message,
    cause: e.cause?.message,
    digest: e.digest,
    method: request.method,
    path: request.path,
    route: context.routePath,
    routeType: context.routeType,
    host: header("host"),
    forwardedHost: header("x-forwarded-host"),
    origin: header("origin"),
    userAgent: header("user-agent"),
  });
};
