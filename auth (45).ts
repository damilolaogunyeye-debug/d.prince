import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { authSessions, users, type User } from "@/db/schema";

export type Role = "super_admin" | "staff" | "student";
export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super Admin",
  staff: "Staff",
  student: "Student",
};

export const SESSION_COOKIE = "dp_session";
export const PROBE_COOKIE = "dp_probe";
/** Same token as the cookie, sent as a header by browsers that refuse the cookie. */
export const SESSION_HEADER = "x-dp-session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// ---------- Passwords ----------
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = scryptSync(password, salt, 64);
  const existing = Buffer.from(hash, "hex");
  return existing.length === computed.length && timingSafeEqual(existing, computed);
}

// ---------- Cookie attributes ----------
const PREVIEW_HOST = /\.e2b\.(app|dev)$/i;

/** Cookie attributes depend on how the portal is being served. */
export async function cookieOptions() {
  const h = await headers();
  const origin = h.get("origin") ?? "";
  let originHost = "";
  try {
    originHost = new URL(origin).hostname;
  } catch {
    originHost = "";
  }
  const host = originHost || (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];
  const https = origin.startsWith("https://") || h.get("x-forwarded-proto") === "https";

  // Hosted preview: usually displayed inside another site's frame, where a
  // SameSite=Lax cookie is never stored.
  if (PREVIEW_HOST.test(host)) {
    return { httpOnly: true, path: "/", sameSite: "none" as const, secure: true, partitioned: true };
  }
  // Normal deployment: Lax, and only Secure when actually served over https
  // (a Secure cookie on plain http is silently dropped by the browser).
  return { httpOnly: true, path: "/", sameSite: "lax" as const, secure: https };
}

// ---------- Sessions (stored in the database) ----------
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Creates a session and returns the raw token.
 *
 * withCookie = true  : normal case, the token is stored in an httpOnly cookie.
 * withCookie = false : the browser has shown it will not keep our cookie, so the caller
 *                      hands the token to the page instead. No cookie is set on purpose:
 *                      setting one makes Next.js re-render the login page inside the same
 *                      response, that page then redirects to /dashboard, and the browser
 *                      (having dropped the cookie) is bounced straight back to the login page.
 */
export async function createSession(userId: number, withCookie = true): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.insert(authSessions).values({
    id: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + MAX_AGE * 1000),
  });
  // Opportunistic clean-up of expired rows.
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date())).catch(() => {});
  if (withCookie) {
    const store = await cookies();
    store.set(SESSION_COOKIE, token, { ...(await cookieOptions()), maxAge: MAX_AGE });
  }
  return token;
}

/** Tokens presented with this request: header first (it is the fresher one when both exist), then cookie. */
async function presentedTokens(): Promise<string[]> {
  const fromHeader = (await headers()).get(SESSION_HEADER);
  const fromCookie = (await cookies()).get(SESSION_COOKIE)?.value;
  return Array.from(new Set([fromHeader, fromCookie].filter((t): t is string => Boolean(t) && t!.length < 200)));
}

export async function destroySession() {
  const tokens = await presentedTokens();
  if (tokens.length) await db.delete(authSessions).where(inArray(authSessions.id, tokens.map(hashToken)));
  // Expire with the same attributes it was set with, otherwise a partitioned cookie is not removed.
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { ...(await cookieOptions()), maxAge: 0 });
}

/** Signs a user out everywhere, optionally keeping the session making this request. */
export async function revokeSessions(userId: number, keepCurrent = false) {
  const keep = keepCurrent ? (await presentedTokens()).map(hashToken) : [];
  let where = eq(authSessions.userId, userId);
  for (const id of keep) where = and(where, ne(authSessions.id, id))!;
  await db.delete(authSessions).where(where);
}

export async function getCurrentUser(): Promise<User | null> {
  for (const token of await presentedTokens()) {
    const [row] = await db
      .select({ user: users, expiresAt: authSessions.expiresAt })
      .from(authSessions)
      .innerJoin(users, eq(users.id, authSessions.userId))
      .where(eq(authSessions.id, hashToken(token)))
      .limit(1);
    if (row && row.expiresAt > new Date() && row.user.isActive) return row.user;
  }
  return null;
}

export async function requireUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (roles && !roles.includes(user.role as Role)) redirect("/dashboard?msg=You+are+not+allowed+to+view+that+page");
  return user;
}

export const isStaffOrAdmin = (u: User) => u.role === "staff" || u.role === "super_admin";
export const isSuperAdmin = (u: User) => u.role === "super_admin";
