import Link from "next/link";
import { readFileSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { activeDatabase, db, environmentOverridesSettings } from "@/db";
import { requireUser } from "@/lib/auth";
import { recentEvents } from "@/lib/diagnostics";
import { connectDatabaseAction, disconnectDatabaseAction } from "@/lib/actions/database";
import { Flash, PageHeader } from "@/components/ui";
import { SqlCopyBox } from "@/components/SqlCopyBox";
import { AssignmentFileButtons } from "@/components/AssignmentFileButtons";

const REQUIRED_TABLES = ["users", "auth_sessions", "student_profiles", "courses", "course_registrations", "tests", "questions", "test_attempts", "notices", "messages", "attendance", "promotion_logs", "academic_sessions", "assignments", "assignment_files", "course_materials", "course_material_files", "material_payments", "payment_proofs", "school_settings"];

function describe(e: { kind: string } & Record<string, unknown>): string {
  if (e.kind === "server-start") return "server process started";
  if (e.kind === "connection-check")
    return `custom request header: ${e.requestHeaderArrived ? "arrives" : "STRIPPED"} · Origin: ${e.originArrived ? "arrives" : "STRIPPED"} · custom response header: ${e.responseHeaderArrived ? "arrives" : "STRIPPED"} · cookie: ${e.cookieKept ? "kept" : "NOT kept"}${e.embedded ? " · embedded" : ""}`;
  if (e.kind === "database-connected") return `connected to ${String(e.host)}${e.tablesCreated ? ", created the portal tables" : ""}`;
  if (e.kind === "database-disconnected") return "switched back to the local database";
  return [e.stage && `stage ${String(e.stage)}`, e.message, e.cause, e.path && `at ${String(e.path)}`, e.digest && `ref ${String(e.digest)}`, e.serverReachable === false && "server was not reachable"]
    .filter(Boolean)
    .map(String)
    .join(" · ");
}

const quiet = new Set(["server-start", "connection-check", "database-connected", "database-disconnected"]);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireUser(["super_admin"]);
  const { msg, err } = await searchParams;
  const active = activeDatabase();
  const envLocked = environmentOverridesSettings();

  let present: string[] = [];
  let dbOk = false;
  try {
    const r = await db.execute(sql`select table_name from information_schema.tables where table_schema = current_schema()`);
    present = (r.rows as { table_name: string }[]).map((x) => x.table_name);
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const missing = REQUIRED_TABLES.filter((t) => !present.includes(t));
  const events = recentEvents(30);

  let script = "";
  try {
    script = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf-8");
  } catch {
    script = "";
  }

  return (
    <div>
      <PageHeader title="Database / Supabase" subtitle="Where the portal stores its data. Nothing is kept in the browser; everything is written to the database shown below." />
      <Flash msg={msg} err={err} />

      {active.external ? (
        <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <b>Connected to {active.isSupabase ? "Supabase" : "an external database"}.</b> Everything entered in the portal is saved there.
        </div>
      ) : (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <b>Not connected to Supabase yet.</b> Everything entered in the portal right now is saved in the local preview database. Use the form below to connect.
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold">Active database connection</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd>{dbOk ? <span className="badge-green">Connected</span> : <span className="badge-red">Not connected</span>}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Provider</dt><dd>{active.isSupabase ? <span className="badge-green">Supabase PostgreSQL</span> : active.external ? <span className="badge-green">External PostgreSQL</span> : <span className="badge-yellow">Local PostgreSQL (preview)</span>}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Host</dt><dd className="break-all font-mono text-xs">{active.host}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Configured by</dt><dd className="font-mono text-xs">{active.source}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-slate-500">Portal tables present</dt><dd>{dbOk ? (missing.length === 0 ? <span className="badge-green">All {REQUIRED_TABLES.length}</span> : <span className="badge-yellow">{REQUIRED_TABLES.length - missing.length} of {REQUIRED_TABLES.length}</span>) : "—"}</dd></div>
        </dl>
        {active.note && <p className="mt-3 text-xs text-slate-500">{active.note}</p>}
        {active.external && active.source === "portal settings" && (
          <form action={disconnectDatabaseAction} className="mt-4">
            <button className="btn-outline">Disconnect and use the local preview database</button>
            <p className="mt-1 text-xs text-slate-500">Nothing in Supabase is deleted. You will be signed out, because accounts are separate in each database.</p>
          </form>
        )}
      </div>

      {!active.external && !envLocked && (
        <form action={connectDatabaseAction} className="card mt-6 space-y-4">
          <div>
            <h2 className="font-semibold">Connect to Supabase</h2>
            <p className="mt-1 text-sm text-slate-600">One form, done once. The portal tests the connection, creates its tables, switches over and creates your Super Admin account there.</p>
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold">Where to find the connection string</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5">
              <li>Open your project in Supabase and press <b>Connect</b> at the top of the page.</li>
              <li>Choose <b>Session pooler</b> and copy the string (it starts with <code>postgresql://postgres.</code>).</li>
              <li>Replace <code>[YOUR-PASSWORD]</code>, brackets included, with your <b>database password</b>. Forgotten it? Project Settings → Database → Reset database password.</li>
            </ol>
            <p className="mt-2 text-xs text-slate-500">The API keys (publishable / secret) cannot be used here: Supabase only allows a database connection with the database password.</p>
          </div>

          <div>
            <label className="label" htmlFor="url">Session pooler connection string</label>
            <input id="url" name="url" type="password" required autoComplete="off" spellCheck={false} placeholder="postgresql://postgres.xxxx:your-password@aws-1-....pooler.supabase.com:5432/postgres" className="input font-mono text-xs" />
            <p className="mt-1 text-xs text-slate-500">Hidden while typing because it contains your password. It is stored on this server, never in the browser.</p>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="create" defaultChecked className="mt-1" />
            <span>
              <b>Create the portal tables</b> if they are not there yet. They are created in a separate schema named <code>dprince_portal</code>;
              your existing tables in <code>public</code> (users, courses, results, sessions …) are not read, changed or moved.
            </span>
          </label>

          <div className="border-t border-slate-200 pt-4">
            <p className="font-semibold text-slate-800">Your Super Admin account in Supabase</p>
            <p className="text-sm text-slate-600">Created in the same step, so nobody else can claim it. From then on you sign in with this email.</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label" htmlFor="name">Full name</label><input id="name" name="name" required className="input" autoComplete="name" /></div>
              <div className="sm:col-span-2"><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" placeholder="you@example.com" /></div>
              <div><label className="label" htmlFor="password">Password (8+ characters)</label><input id="password" name="password" type="password" required minLength={8} className="input" autoComplete="new-password" /></div>
              <div><label className="label" htmlFor="confirm">Repeat password</label><input id="confirm" name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" /></div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Accounts, courses and tests in the local preview database are <b>not</b> copied. The portal starts empty in Supabase, apart from your Super Admin account.
          </div>

          <button className="btn-primary">Test and connect</button>
        </form>
      )}

      {envLocked && !active.external && (
        <p className="card mt-6 text-sm text-red-700">SUPABASE_DB_URL is set in the environment but the connection could not be made. Check that value.</p>
      )}

      <details className="card mt-6">
        <summary className="cursor-pointer font-semibold">Prefer to create the tables yourself? (setup script)</summary>
        <p className="mt-2 text-sm text-slate-600">
          Optional. Supabase → SQL Editor → New query → paste → Run; it should end with <code>portal tables ready</code>. Everything goes into the <code>dprince_portal</code> schema and nothing in <code>public</code> is touched.
          Also available without signing in at <Link href="/setup-sql" className="text-[#0b4fb3] underline">/setup-sql</Link>.
        </p>
        <div className="mt-3">{script ? <SqlCopyBox sql={script} rows={10} /> : <p className="text-sm text-red-700">supabase/schema.sql is missing.</p>}</div>
      </details>

      <div className="card mt-6">
        <h2 className="font-semibold">Publish on Vercel</h2>
        <p className="mt-1 text-sm text-slate-600">
          Download these <b>4 files</b> and upload them to the <b>top level</b> of your GitHub repository (replace <code>package.json</code> if asked).
          No folders are needed, so this works from a phone. Vercel then unpacks the whole portal before building.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {([["bundle", "dprince-portal.bundle.json", "1. The portal (all files)"], ["unbundle", "unbundle.mjs", "2. Unpacker"], ["package", "package.json", "3. package.json"], ["lock", "package-lock.json", "4. package-lock.json"]] as const).map(([k, name, label]) => (
            <div key={k} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
              <span>{label}</span>
              <AssignmentFileButtons id={0} fileName={name} fileType="json" url={`/api/admin/vercel-kit?file=${k}`} label="Download" />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Then in Vercel set <code>DATABASE_URL</code> (and the Paystack keys) under Settings → Environment Variables and redeploy. The files contain no passwords or keys.
          On a computer you can instead download the whole project as a zip with its folders:
        </p>
        <div className="mt-2"><AssignmentFileButtons id={0} fileName="dprinceportal-source.zip" fileType="zip" url="/api/admin/source-zip" label="Download project (.zip)" /></div>
      </div>

      <div className="card mt-6">
        <h2 className="font-semibold">Diagnostics</h2>
        <p className="mt-1 text-sm text-slate-600">Server starts, connection checks and errors recorded by the portal, newest first. No passwords, cookies or form contents are stored.</p>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200">
            <table className="table">
              <thead><tr><th>Time (UTC)</th><th>Type</th><th>Details</th></tr></thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap font-mono text-xs">{e.t.replace("T", " ").slice(0, 19)}</td>
                    <td><span className={quiet.has(e.kind) ? "badge-gray" : "badge-red"}>{e.kind}</span></td>
                    <td className="break-words font-mono text-xs text-slate-600">{describe(e)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
