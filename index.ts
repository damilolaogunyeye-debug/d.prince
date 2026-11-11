import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Which database the portal uses.
 *
 *  - The local database (DATABASE_URL) always exists. It holds the portal's data
 *    until Supabase is connected, and it always holds the portal's own settings.
 *  - An external database (Supabase) becomes the active one when either
 *      * the environment variable SUPABASE_DB_URL is set, or
 *      * the Super Admin connected it on the "Database / Supabase" page
 *        (saved in the local database, see src/lib/database-switch.ts).
 *
 * On an external database all portal tables live in their own schema, so they can
 * never collide with tables the project already has in "public".
 */
export const PORTAL_SCHEMA = "dprince_portal";

export type DatabaseSource = "DATABASE_URL" | "SUPABASE_DB_URL" | "portal settings";
export type ActiveDatabaseInfo = { host: string; external: boolean; isSupabase: boolean; source: DatabaseSource; note?: string };

type Connection = { db: NodePgDatabase; pool: Pool; info: ActiveDatabaseInfo };
type State = { local: Connection; active: Connection };

// Checked when the database is first used, not when this file loads, so that
// `next build` (e.g. on Vercel) does not need a database.
function requireLocalUrl(): string {
  const url = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required (set it to your Supabase Session pooler connection string).");
  return url;
}

export function isSupabaseHost(hostname: string) {
  return /(^|\.)supabase\.(co|com)$/i.test(hostname);
}

/**
 * Normalises a connection string. For Supabase: TLS is configured in code, so any
 * sslmode is dropped (node-postgres would otherwise demand a CA file), and the
 * transaction pooler port 6543 is switched to the session pooler port 5432,
 * because the portal sets its schema once per connection.
 */
export function prepareUrl(url: string): { connectionString: string; host: string; isSupabase: boolean; note?: string } {
  const u = new URL(url);
  const isSupabase = isSupabaseHost(u.hostname);
  let note: string | undefined;
  if (isSupabase) {
    u.searchParams.delete("sslmode");
    if (u.port === "6543" && u.hostname.includes("pooler.supabase.com")) {
      u.port = "5432";
      note = "Transaction pooler (port 6543) was switched to the session pooler (port 5432).";
    }
  }
  return { connectionString: u.toString(), host: u.host, isSupabase, note };
}

export function createPool(url: string, external: boolean): { pool: Pool; prepared: ReturnType<typeof prepareUrl> } {
  const prepared = prepareUrl(url);
  const pool = new Pool({
    connectionString: prepared.connectionString,
    // Encrypted connection to Supabase. The certificate chain is not verified because
    // Supabase's pooler uses its own CA; supply that CA here if you need strict verification.
    ssl: prepared.isSupabase ? { rejectUnauthorized: false } : undefined,
    // On Vercel every function instance has its own pool: keep it small and let idle
    // connections go quickly, so Supabase's pooler is not exhausted.
    max: process.env.VERCEL ? 2 : external ? 5 : 10,
    idleTimeoutMillis: process.env.VERCEL ? 5_000 : 30_000,
    connectionTimeoutMillis: 10_000,
  });
  if (external) {
    // Runs on every new connection before it is used.
    pool.on("connect", (client) => {
      client.query(`set search_path to ${PORTAL_SCHEMA}, public`).catch(() => {});
    });
  }
  // An idle connection dropped by the server must not crash the process.
  pool.on("error", () => {});
  return { pool, prepared };
}

function connect(url: string, external: boolean, source: DatabaseSource): Connection {
  const { pool, prepared } = createPool(url, external);
  return {
    db: drizzle(pool),
    pool,
    info: { host: prepared.host, external, isSupabase: prepared.isSupabase, source, note: prepared.note },
  };
}

// Shared by every bundle in this server process.
const g = globalThis as typeof globalThis & { __dpDbState?: State };

function state(): State {
  if (!g.__dpDbState) {
    const localUrl = requireLocalUrl();
    // If DATABASE_URL itself points at Supabase (e.g. on Vercel), it is the portal's database:
    // use the portal schema on it too, so settings tables are created where the login may write.
    let localIsSupabase = false;
    try {
      localIsSupabase = isSupabaseHost(new URL(localUrl).hostname);
    } catch {
      localIsSupabase = false;
    }
    const local = connect(localUrl, localIsSupabase, localIsSupabase ? "SUPABASE_DB_URL" : "DATABASE_URL");
    let active = local;
    const envUrl = process.env.SUPABASE_DB_URL?.trim();
    if (envUrl && envUrl !== localUrl) {
      try {
        active = connect(envUrl, true, "SUPABASE_DB_URL");
      } catch {
        active = local; // unreadable connection string: stay on the local database
      }
    }
    g.__dpDbState = { local, active };
  }
  return g.__dpDbState;
}

/** The database the portal reads and writes. Always points at the currently active one. */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const target = state().active.db as unknown as Record<PropertyKey, unknown>;
    const value = target[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
  },
});

/** The local database. Used for the portal's own settings, whatever is active. */
export function localDb(): NodePgDatabase {
  return state().local.db;
}

export function activeDatabase(): ActiveDatabaseInfo {
  return state().active.info;
}

export function environmentOverridesSettings(): boolean {
  return Boolean(process.env.SUPABASE_DB_URL?.trim());
}

/** Makes an external database the active one (used after a successful test). */
export function switchToExternal(url: string) {
  const s = state();
  const next = connect(url, true, "portal settings");
  const previous = s.active;
  s.active = next;
  if (previous !== s.local) void previous.pool.end().catch(() => {});
}

export function switchToLocal() {
  const s = state();
  const previous = s.active;
  s.active = s.local;
  if (previous !== s.local) void previous.pool.end().catch(() => {});
}
