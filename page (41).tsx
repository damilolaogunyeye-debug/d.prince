import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm, SetupForm } from "@/components/LoginForm";
import { BuiltBy } from "@/components/BuiltBy";
import { pendingStatus, tryPendingConnection } from "@/lib/database-switch";

export const dynamic = "force-dynamic";

type PortalState =
  | { kind: "ready"; userCount: number; demoAdmin: boolean }
  | { kind: "no-tables" }
  | { kind: "db-down"; message: string };

async function portalState(): Promise<PortalState> {
  try {
    const [row] = await db
      .select({
        c: sql<number>`count(*)::int`,
        demo: sql<number>`count(*) filter (where ${users.username} = 'admin' and ${users.email} = 'admin@dprince.edu')::int`,
      })
      .from(users);
    return { kind: "ready", userCount: row.c, demoAdmin: row.demo > 0 };
  } catch (e) {
    const err = e as { code?: string; message?: string; cause?: { code?: string; message?: string } };
    const code = err.cause?.code ?? err.code;
    if (code === "42P01") return { kind: "no-tables" }; // relation does not exist
    return { kind: "db-down", message: err.cause?.message ?? err.message ?? "Unknown database error" };
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ connected?: string; check?: string }> }) {
  const { connected, check } = await searchParams;
  // Prepared Supabase connection: connects by itself once the setup script has run.
  await tryPendingConnection(check === "1");
  const pending = await pendingStatus();
  const state = await portalState();
  if (state.kind === "ready" && state.userCount > 0) {
    const user = await getCurrentUser();
    if (user) redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-100 via-white to-blue-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-xl">
        <div className="flex flex-col items-center text-center">
          <Image src="/logo.png" alt="D.prince Learning Portal" width={150} height={150} priority className="h-36 w-36 rounded-full object-cover" />
          <h1 className="mt-6 text-3xl font-bold text-slate-900">D.prince Learning Portal</h1>
          <p className="mt-2 text-lg text-slate-600">School Management System</p>
        </div>

        {connected === "existing" && (
          <div role="status" className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <b>Connected to Supabase.</b> That database already had portal accounts, so no new one was created. Sign in with your Supabase portal account.
          </div>
        )}
        {connected === "local" && (
          <div role="status" className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            The portal is back on the local preview database. Sign in with a local account.
          </div>
        )}

        {pending.pending && (
          <div role="status" className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">Supabase is ready to connect</p>
            <p className="mt-1">
              Run the three-line setup script once in your Supabase SQL Editor. The portal then connects to Supabase by itself
              and asks you to create your Super Admin account with your own email.
            </p>
            {pending.lastError && <p className="mt-2 text-xs">Last check: {pending.lastError}</p>}
            <div className="mt-2 flex flex-wrap gap-3">
              <Link href="/setup-sql" className="font-semibold text-[#0b4fb3] underline">Get the setup script</Link>
              <a href="/?check=1" className="font-semibold text-[#0b4fb3] underline">I have run it: check now</a>
            </div>
          </div>
        )}

        {state.kind === "db-down" && (
          <div role="alert" className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-semibold">The portal cannot reach its database.</p>
            <p className="mt-1 break-words font-mono text-xs">{state.message}</p>
            <p className="mt-2">If Supabase was connected, check in Supabase that the project is not paused and that the database password has not been changed.</p>
          </div>
        )}

        {state.kind === "no-tables" && (
          <div role="alert" className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">The database is connected, but the portal&apos;s tables have not been created yet.</p>
            <p className="mt-2">Run the setup script once in the Supabase SQL Editor, then reload this page.</p>
            <Link href="/setup-sql" className="mt-3 inline-block rounded-lg bg-[#0b4fb3] px-4 py-2 font-semibold text-white">Get the setup script</Link>
          </div>
        )}

        {state.kind === "ready" && state.userCount === 0 && (
          <>
            <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-semibold">First-time setup</p>
              <p className="mt-1">This database has no accounts yet. The account you create here becomes the Super Admin. You will sign in with this email from now on.</p>
            </div>
            <SetupForm />
          </>
        )}

        {state.kind === "ready" && state.userCount > 0 && (
          <>
            <LoginForm />
            {state.demoAdmin && (
              <div className="mt-8 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
                <p className="font-semibold text-slate-600">Demo accounts are still active</p>
                <p>Super Admin: <b>admin</b> / admin123 · Staff: <b>staff</b> / staff123 · Student: <b>student</b> / student123</p>
                <p className="mt-1">Sign in as admin, then open <b>My Profile</b> to set your own email and password. This note disappears once you do.</p>
              </div>
            )}
          </>
        )}
      </div>
      <BuiltBy />
    </main>
  );
}
