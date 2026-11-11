import { count } from "drizzle-orm";
import { db } from "@/db";
import { studentProfiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { listSessions } from "@/lib/queries";
import { addSessionAction, deleteSessionAction, setCurrentSessionAction } from "@/lib/actions/sessions";
import { Empty, Flash, PageHeader } from "@/components/ui";

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireUser(["super_admin"]);
  const { msg, err } = await searchParams;
  const sessions = await listSessions();
  const usage = new Map(
    (await db.select({ s: studentProfiles.session, n: count() }).from(studentProfiles).groupBy(studentProfiles.session)).map((r) => [r.s, r.n]),
  );
  const y = new Date().getFullYear();

  return (
    <div>
      <PageHeader title="Academic Sessions" subtitle="Add school sessions and choose the current one. Sessions appear in student profiles, promotion and assignments." />
      <Flash msg={msg} err={err} />

      <form action={addSessionAction} className="card mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="name">New session *</label>
          <input id="name" name="name" required pattern="\s*\d{4}\s*/\s*\d{4}\s*" placeholder={`${y}/${y + 1}`} className="input w-48" />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" name="current" className="h-4 w-4" /> Make it the current session
        </label>
        <button className="btn-primary">Add session</button>
      </form>

      {sessions.length === 0 ? (
        <Empty text="No sessions yet. The first one you add becomes the current session." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Session</th><th>Status</th><th>Students on it</th><th></th></tr></thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="font-semibold">{s.name}</td>
                  <td>{s.isCurrent ? <span className="badge-green">Current</span> : <span className="badge-gray">—</span>}</td>
                  <td>{usage.get(s.name) ?? 0}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      {!s.isCurrent && (
                        <form action={setCurrentSessionAction}><input type="hidden" name="id" value={s.id} /><button className="btn-outline px-2 py-1 text-xs">Make current</button></form>
                      )}
                      {!s.isCurrent && (
                        <form action={deleteSessionAction}><input type="hidden" name="id" value={s.id} /><button className="px-2 py-1 text-xs font-medium text-red-700 hover:underline">Delete</button></form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Deleting a session does not change students already recorded under it. To move students to a new session, use Student Promotion.</p>
    </div>
  );
}

export const dynamic = "force-dynamic";
