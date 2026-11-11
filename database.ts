"use server";

import { redirect } from "next/navigation";
import { createSession, requireUser } from "@/lib/auth";
import { createFirstSuperAdmin } from "@/lib/auth-flow";
import { disconnectExternal, testAndConnect } from "@/lib/database-switch";
import { logEvent } from "@/lib/diagnostics";
import { go, str } from "./helpers";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Super Admin only. Tests the Supabase connection string, creates the portal's
 * tables if asked, switches the portal over, and creates the Super Admin account
 * in Supabase in the same step (so nobody else can claim it in between).
 */
export async function connectDatabaseAction(formData: FormData) {
  await requireUser(["super_admin"]);
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  // Check the new account details first, so a typo cannot leave the portal switched but locked.
  if (!name) go("/dashboard/settings", "Enter your full name for the Supabase Super Admin account.", "err");
  if (!EMAIL.test(email)) go("/dashboard/settings", "Enter a valid email address for the Supabase Super Admin account.", "err");
  if (password.length < 8) go("/dashboard/settings", "The Super Admin password must be at least 8 characters.", "err");
  if (password !== confirm) go("/dashboard/settings", "The two Super Admin passwords do not match.", "err");

  const result = await testAndConnect(String(formData.get("url") ?? ""), formData.get("create") === "on");
  if (!result.ok) {
    logEvent("database-connect-failed", { stage: result.stage, message: result.error });
    go("/dashboard/settings", result.error, "err");
  }
  logEvent("database-connected", { host: result.host, tablesCreated: result.created });

  // The portal now reads and writes Supabase.
  const admin = await createFirstSuperAdmin({ name, email, password, confirm });
  if (!admin.ok) {
    // The Supabase database already has accounts (connected before): sign in with those.
    redirect("/?connected=existing");
  }
  await createSession(admin.userId);
  redirect(`/dashboard?msg=${encodeURIComponent(`Connected to Supabase${result.created ? " and created the portal tables" : ""}. You are signed in as ${email}.`)}`);
}

/** Super Admin only. Goes back to the local preview database. */
export async function disconnectDatabaseAction() {
  await requireUser(["super_admin"]);
  await disconnectExternal();
  logEvent("database-disconnected");
  redirect("/?connected=local");
}
