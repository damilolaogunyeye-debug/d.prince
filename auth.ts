"use server";

import { and, eq, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, requireUser, revokeSessions, verifyPassword } from "@/lib/auth";
import { go, str } from "./helpers";

export async function changePasswordAction(formData: FormData) {
  const me = await requireUser();
  const current = str(formData, "current");
  const next = str(formData, "next");
  if (next.length < 6) go("/dashboard/profile", "New password must be at least 6 characters.", "err");
  if (!verifyPassword(current, me.passwordHash)) go("/dashboard/profile", "Current password is incorrect.", "err");
  await db.update(users).set({ passwordHash: hashPassword(next) }).where(eq(users.id, me.id));
  await revokeSessions(me.id, true); // sign out other devices, keep this one
  go("/dashboard/profile", "Password updated successfully.");
}

/** Staff / Super Admin change their own name, login email and username. */
export async function updateAccountAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const username = str(formData, "username").toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!name || !username) go("/dashboard/profile", "Name and username are required.", "err");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) go("/dashboard/profile", "Enter a valid email address.", "err");
  const [clash] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(ne(users.id, me.id), or(eq(users.email, email), eq(users.username, username))))
    .limit(1);
  if (clash) go("/dashboard/profile", "That email or username is already used by another account.", "err");
  await db.update(users).set({ name, email, username }).where(eq(users.id, me.id));
  go("/dashboard/profile", `Account updated. You now sign in with ${email} or ${username}.`);
}
