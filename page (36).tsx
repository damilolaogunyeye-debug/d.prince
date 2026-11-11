import Form from "next/form";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { promotionLogs, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CLASS_LEVELS, GRADUATED, listSessions, listStudents, nextClassLevel } from "@/lib/queries";
import { promoteStudentAction } from "@/lib/actions/users";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { SelectAll } from "@/components/SelectAll";

const promoter = alias(users, "promoter");

export default async function PromotionPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; level?: string }> }) {
  await requireUser(["staff", "super_admin"]);
  const { msg, err, level } = await searchParams;
  const all = (await listStudents()).filter((s) => s.classLevel !== GRADUATED);
  const levels = Array.from(new Set(all.map((s) => s.classLevel).filter(Boolean))) as string[];
  levels.sort((a, b) => (CLASS_LEVELS.indexOf(a) + 1 || 999) - (CLASS_LEVELS.indexOf(b) + 1 || 999));
  const students = level ? all.filter((s) => (s.classLevel ?? "") === level) : all;
  const sessions = await listSessions();
  const current = sessions.find((s) => s.isCurrent)?.name;

  const history = await db
    .select({ id: promotionLogs.id, from: promotionLogs.fromLevel, to: promotionLogs.toLevel, at: promotionLogs.createdAt, student: users.name, by: promoter.name })
    .from(promotionLogs)
    .innerJoin(users, eq(users.id, promotionLogs.studentId))
    .leftJoin(promoter, eq(promoter.id, promotionLogs.promotedBy))
    .orderBy(desc(promotionLogs.createdAt))
    .limit(15);

  return (
    <div>
      <PageHeader title="Student Promotion" subtitle="Move students to their next class, or change them to any class. Optionally move them to a new session at the same time." />
      <Flash msg={msg} err={err} />

      <Form action="/dashboard/students/promotion" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="label">Show students in</label>
          <select name="level" defaultValue={level ?? ""} className="input w-56">
            <option value="">All classes</option>
            {levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <button className="btn-outline">Show</button>
      </Form>

      {students.length === 0 ? (
        <Empty text="No students to promote." />
      ) : (
        <form action={promoteStudentAction} className="card space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <fieldset className="space-y-2 lg:col-span-2">
              <legend className="label">Move the selected students to</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="mode" value="next" defaultChecked className="mt-1" />
                <span><b>Their next class</b> — each student moves up one class (e.g. JSS 2 → JSS 3, SSS 1 → SSS 2). Students in a final class (SSS 3, ND 2, HND 2, 600 Level) are not moved; choose a class for them below.</span>
              </label>
              <label className="flex flex-wrap items-center gap-2 text-sm">
                <input type="radio" name="mode" value="specific" />
                <b>This class:</b>
                <select name="toLevel" defaultValue="" className="input w-48">
                  <option value="">Choose class</option>
                  {CLASS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  <option value={GRADUATED}>{GRADUATED} (left school)</option>
                </select>
                <span className="text-xs text-slate-500">also used to correct a wrong class</span>
              </label>
            </fieldset>
            <div>
              <label className="label">Session</label>
              <select name="session" defaultValue="" className="input">
                <option value="">Keep their current session</option>
                {sessions.map((s) => <option key={s.id} value={s.name}>{s.name}{s.isCurrent ? " (current)" : ""}</option>)}
              </select>
              {sessions.length === 0 && <p className="mt-1 text-xs text-slate-500">The Super Admin adds sessions under Academic Sessions.</p>}
              {current && <p className="mt-1 text-xs text-slate-500">Current session: {current}</p>}
            </div>
          </div>
          <button className="btn-primary">Apply to selected students</button>

          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th><SelectAll name="studentIds" /></th><th>Name</th><th>Admission No</th><th>Current class</th><th>Next class</th><th>Session</th></tr></thead>
              <tbody>
                {students.map((s) => {
                  const next = nextClassLevel(s.classLevel);
                  return (
                    <tr key={s.id}>
                      <td><input type="checkbox" name="studentIds" value={s.id} className="h-4 w-4" /></td>
                      <td className="font-medium">{s.name}</td>
                      <td className="font-mono text-xs">{s.admissionNo ?? "—"}</td>
                      <td>{s.classLevel ?? "—"}</td>
                      <td>{next ?? <span className="text-xs text-amber-700">{s.classLevel ? "final class: choose" : "no class: choose"}</span>}</td>
                      <td>{s.session ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      )}

      <div className="card mt-6">
        <h2 className="font-semibold">Recent promotions and class changes</h2>
        {history.length === 0 ? <p className="mt-2 text-sm text-slate-500">None yet.</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="table">
              <thead><tr><th>When</th><th>Student</th><th>From</th><th>To</th><th>By</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="whitespace-nowrap text-xs">{h.at.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>{h.student}</td><td>{h.from ?? "—"}</td><td className="font-medium">{h.to}</td><td>{h.by ?? "—"}</td>
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
