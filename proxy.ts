import { NextResponse, type NextRequest } from "next/server";
import { TUNNEL_PARAM, decodeTunnel } from "@/lib/header-tunnel";

/**
 * Restores headers that the hosting path stripped (see src/lib/header-tunnel.ts).
 * Requests without the tunnel parameter pass through untouched.
 */
export function proxy(request: NextRequest) {
  const tunnelled = request.nextUrl.searchParams.get(TUNNEL_PARAM);
  if (tunnelled === null) return NextResponse.next();

  const restored = decodeTunnel(tunnelled);
  const headers = new Headers(request.headers);
  for (const [name, value] of Object.entries(restored)) {
    // Never overwrite a header that did arrive: the real one wins.
    if (!headers.has(name)) headers.set(name, value);
  }

  // Remove the parameter so pages, redirects and router state never see it.
  const clean = request.nextUrl.clone();
  clean.searchParams.delete(TUNNEL_PARAM);
  return NextResponse.rewrite(clean, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
