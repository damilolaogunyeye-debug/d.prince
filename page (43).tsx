import Link from "next/link";
import { readFileSync } from "fs";
import { join } from "path";
import { SqlCopyBox } from "@/components/SqlCopyBox";

export const dynamic = "force-dynamic";

export const metadata = { title: "Supabase setup script - D.prince Learning Portal" };

/**
 * Public on purpose: the script only creates empty tables. It contains no
 * passwords, keys, email addresses or data.
 */
export default function SetupSqlPage() {
  let sql = "";
  try {
    sql = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf-8");
  } catch {
    sql = "";
  }
  let connect = "";
  try {
    connect = readFileSync(join(process.cwd(), "supabase", "connect.sql"), "utf-8");
  } catch {
    connect = "";
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900">Supabase setup script</h1>
      <p className="mt-1 text-sm text-slate-600">Creates the tables the D.prince Learning Portal needs.</p>

      {connect && (
        <div className="mt-5 rounded-xl border-2 border-[#0b4fb3] bg-white p-5">
          <h2 className="text-lg font-bold text-slate-900">Step 1 of 1: run this in Supabase</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>Press <b>Copy the whole script</b>.</li>
            <li>Supabase Dashboard → your project → <b>SQL Editor</b> → <b>New query</b> → paste → <b>Run</b>. It should say <i>Success. No rows returned</i>.</li>
            <li>Open the portal again (or press <a href="/?check=1" className="text-[#0b4fb3] underline">check now</a>). It connects by itself, creates its tables and asks you to create your Super Admin account with your own email.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">It creates a login that can only use its own empty schema. Your existing tables are not touched. The password in it is scrambled and cannot be used to log in.</p>
          <div className="mt-3"><SqlCopyBox sql={connect} rows={9} /></div>
        </div>
      )}

      <details className="mt-5"><summary className="cursor-pointer text-sm text-slate-600">Full table script (not needed if you use Step 1)</summary>
      <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <b>You probably do not need this page.</b> The easiest way is inside the portal: sign in as Super Admin → <b>Database / Supabase</b> →
        paste your Session pooler connection string → <b>Test and connect</b>. The portal creates these tables itself.
      </div>

      <p className="mt-5 text-sm text-slate-700">To create the tables by hand instead: copy the script below, open Supabase → <b>SQL Editor</b> → <b>New query</b>, paste, and press <b>Run</b>. The result should end with <code>portal tables ready</code>.</p>

      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <b>Safe to run.</b> Everything is created inside a separate schema called <code>dprince_portal</code>. Your existing tables in <code>public</code>
        (users, courses, results, sessions …) are not read, changed, moved or deleted. Running it twice changes nothing.
      </div>

      <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        {sql ? <SqlCopyBox sql={sql} /> : <p className="text-sm text-red-700">The file supabase/schema.sql is missing from the project.</p>}
      </div>
      </details>

      <p className="mt-5 text-sm">
        <Link href="/" className="text-[#0b4fb3] hover:underline">Back to sign in</Link>
      </p>
    </main>
  );
}
