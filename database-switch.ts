import "server-only";
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { logEvent } from "@/lib/diagnostics";
import { PORTAL_SCHEMA, environmentOverridesSettings, localDb, prepareUrl, switchToExternal, switchToLocal } from "@/db";

/**
 * Connecting the portal to Supabase from inside the portal.
 *
 * The Super Admin pastes the Session pooler connection string. We test it, create
 * the portal's tables in their own schema if asked, then save it in the LOCAL
 * database and switch over. Saved there (not in .env) because this hosting resets
 * .env between sessions; the local database persists.
 */
const SETTING_KEY = "external_database_url";
const REQUIRED_TABLES = ["users", "auth_sessions", "student_profiles", "courses", "course_registrations", "tests", "questions", "test_attempts", "notices", "messages", "attendance", "promotion_logs", "academic_sessions", "assignments", "assignment_files", "course_materials", "course_material_files", "material_payments", "payment_proofs", "school_settings"];

async function ensureSettingsTable() {
  await localDb().execute(sql`create table if not exists portal_settings (key varchar(100) primary key, value text not null, updated_at timestamptz not null default now())`);
}

async function readSetting(): Promise<string | null> {
  await ensureSettingsTable();
  const r = await localDb().execute(sql`select value from portal_settings where key = ${SETTING_KEY}`);
  return (r.rows[0] as { value?: string } | undefined)?.value ?? null;
}

/** Called once at server start: reconnects to the saved database, if any. */
export async function restoreSavedConnection() {
  if (environmentOverridesSettings()) return;
  try {
    const url = await readSetting();
    if (url) {
      // Re-checks the tables on every start, so tables added in later versions are created.
      // Applies the (repeatable) setup script on every start, so new tables AND new columns arrive.
      const res = await testAndConnect(url, true, true);
      if (!res.ok) {
        logEvent("database-restore-problem", { stage: res.stage, message: res.error });
        switchToExternal(url); // still use it: its errors are then shown instead of silently using local data
      }
    } else await tryPendingConnection(true);
  } catch {
    // Local database unreachable or no setting: stay on the local database.
  }
}

/**
 * A prepared Supabase connection that waits for the owner to run supabase/connect.sql
 * (which creates the login it uses). Tried at start-up and from the sign-in page,
 * at most every few minutes so failed logins do not pile up at Supabase's pooler.
 */
const PENDING_KEY = "pending_external_database_url";
const RETRY_MS = 3 * 60_000;
const gp = globalThis as typeof globalThis & { __dpPending?: { lastTry: number; lastError?: string } };

export type PendingStatus = { pending: false } | { pending: true; host: string; lastError?: string; lastTry?: number };

export async function pendingStatus(): Promise<PendingStatus> {
  try {
    await ensureSettingsTable();
    const r = await localDb().execute(sql`select value from portal_settings where key = ${PENDING_KEY}`);
    const url = (r.rows[0] as { value?: string } | undefined)?.value;
    if (!url) return { pending: false };
    return { pending: true, host: new URL(url).host, lastError: gp.__dpPending?.lastError, lastTry: gp.__dpPending?.lastTry };
  } catch {
    return { pending: false };
  }
}

export async function tryPendingConnection(force = false): Promise<boolean> {
  if (environmentOverridesSettings()) return false;
  const st = (gp.__dpPending ??= { lastTry: 0 });
  if (!force && Date.now() - st.lastTry < RETRY_MS) return false;
  let url: string | undefined;
  try {
    await ensureSettingsTable();
    if (await readSetting()) return false; // already connected
    const r = await localDb().execute(sql`select value from portal_settings where key = ${PENDING_KEY}`);
    url = (r.rows[0] as { value?: string } | undefined)?.value;
  } catch {
    return false;
  }
  if (!url) return false;
  st.lastTry = Date.now();
  const result = await testAndConnect(url, true);
  if (!result.ok) {
    // Before the owner runs supabase/connect.sql the login simply does not exist yet.
    st.lastError =
      result.stage === "connect" && /does not recognise this host and user|rejected the password/.test(result.error)
        ? "Supabase does not have the portal's login yet. Run the three-line setup script in the Supabase SQL Editor, then press Check now."
        : result.error;
    logEvent("database-pending-check", { stage: result.stage, message: result.error });
    return false;
  }
  st.lastError = undefined;
  await localDb().execute(sql`delete from portal_settings where key = ${PENDING_KEY}`);
  logEvent("database-connected", { host: result.host, tablesCreated: result.created, via: "prepared login" });
  return true;
}

export async function savedConnectionHost(): Promise<string | null> {
  try {
    const url = await readSetting();
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

export type ConnectResult =
  | { ok: true; created: boolean; host: string; note?: string }
  | { ok: false; error: string; stage: "input" | "connect" | "tables" };

function explain(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const m = err.message ?? String(e);
  if (err.code === "28P01" || /password authentication failed/i.test(m)) return "Supabase rejected the password. Use the database password (not an API key). If you are unsure of it, reset it in Supabase: Project Settings → Database → Reset database password, then paste the string again.";
  if (/tenant or user not found|user not found in the database|EAUTHQUERY/i.test(m)) return "Supabase does not recognise this host and user combination. Copy the Session pooler string from Supabase → Connect exactly as shown, including the user name postgres.<project-id>.";
  if (err.code === "ENOTFOUND") return "That host name does not exist. Check that the whole connection string was copied.";
  if (err.code === "ENETUNREACH" || err.code === "EHOSTUNREACH") return "That address cannot be reached from this server. Use the Session pooler string, not the Direct connection (which is IPv6-only).";
  if (err.code === "ETIMEDOUT" || /timeout/i.test(m)) return "The connection timed out. Check the host and port, and that the project is not paused in Supabase.";
  if (/too many/i.test(m)) return "Supabase is temporarily refusing connections after several failed attempts. Wait a few minutes before trying again.";
  return `The database answered with an error: ${m.slice(0, 200)}`;
}

export async function testAndConnect(rawUrl: string, createTables: boolean, alwaysApplyScript = false): Promise<ConnectResult> {
  const input = rawUrl.trim();
  let prepared: ReturnType<typeof prepareUrl>;
  try {
    const u = new URL(input);
    if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("protocol");
    if (input.includes("[YOUR-PASSWORD]")) return { ok: false, stage: "input", error: "Replace [YOUR-PASSWORD] (including the brackets) with your database password." };
    if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(u.hostname)) return { ok: false, stage: "input", error: "This is the Direct connection string, which this server cannot reach (IPv6-only). In Supabase → Connect choose \"Session pooler\" and copy that string instead." };
    if (!u.password) return { ok: false, stage: "input", error: "The connection string has no password in it." };
    prepared = prepareUrl(input);
  } catch {
    return { ok: false, stage: "input", error: "That is not a connection string. It should start with postgresql:// — copy it from Supabase → Connect → Session pooler." };
  }

  const client = new Client({
    connectionString: prepared.connectionString,
    ssl: prepared.isSupabase ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await client.connect();
  } catch (e) {
    await client.end().catch(() => {});
    return { ok: false, stage: "connect", error: explain(e) };
  }

  try {
    const count = async () => {
      const r = await client.query(
        "select count(*)::int as n from information_schema.tables where table_schema = $1 and table_name = any($2)",
        [PORTAL_SCHEMA, REQUIRED_TABLES],
      );
      return (r.rows[0] as { n: number }).n;
    };
    let created = false;
    let n = await count();
    if (n < REQUIRED_TABLES.length || (alwaysApplyScript && createTables)) {
      if (!createTables) {
        return { ok: false, stage: "tables", error: `Connected, but the portal's tables are not there yet (${n} of ${REQUIRED_TABLES.length}). Tick "Create the portal tables" and try again, or run the setup script in the Supabase SQL Editor.` };
      }
      const script = readFileSync(join(process.cwd(), "supabase", "schema.sql"), "utf-8");
      await client.query(script);
      created = true;
      n = await count();
      if (n < REQUIRED_TABLES.length) return { ok: false, stage: "tables", error: `The setup script ran but only ${n} of ${REQUIRED_TABLES.length} tables exist. Run it in the Supabase SQL Editor to see the error.` };
    }

    await ensureSettingsTable();
    await localDb().execute(sql`insert into portal_settings (key, value) values (${SETTING_KEY}, ${prepared.connectionString})
      on conflict (key) do update set value = excluded.value, updated_at = now()`);
    switchToExternal(prepared.connectionString);
    return { ok: true, created, host: prepared.host, note: prepared.note };
  } catch (e) {
    return { ok: false, stage: "tables", error: explain(e) };
  } finally {
    await client.end().catch(() => {});
  }
}

export async function disconnectExternal() {
  await ensureSettingsTable();
  await localDb().execute(sql`delete from portal_settings where key = ${SETTING_KEY}`);
  switchToLocal();
}
