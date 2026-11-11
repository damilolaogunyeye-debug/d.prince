import "server-only";
import { eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth";

export type FlowResult = { ok: true; userId: number } | { ok: false; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function checkCredentials(identifierRaw: string, password: string): Promise<FlowResult> {
  const identifier = identifierRaw.trim().toLowerCase();
  if (!identifier || !password) return { ok: false, error: "Enter your email/username and password." };
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, identifier), eq(users.username, identifier)))
    .limit(1);
  if (!user || !verifyPassword(password, user.passwordHash)) return { ok: false, error: "Invalid login details. Please try again." };
  if (!user.isActive) return { ok: false, error: "This account has been deactivated. Contact the admin." };
  return { ok: true, userId: user.id };
}

/** First run only: when the database has no users, the first person creates the Super Admin. */
export async function createFirstSuperAdmin(input: { name: string; email: string; password: string; confirm: string }): Promise<FlowResult> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (!name) return { ok: false, error: "Enter your full name." };
  if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (input.password !== input.confirm) return { ok: false, error: "The two passwords do not match." };

  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
  if (c > 0) return { ok: false, error: "Setup has already been completed. Please sign in instead." };

  const username = email.split("@")[0].replace(/[^a-z0-9._-]/g, "") || "admin";
  const [created] = await db
    .insert(users)
    .values({ name, email, username, passwordHash: hashPassword(input.password), role: "super_admin" })
    .returning({ id: users.id });
  return { ok: true, userId: created.id };
}
