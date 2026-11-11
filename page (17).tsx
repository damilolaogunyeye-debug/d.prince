import { desc, eq, sql } from "drizzle-orm";
import Form from "next/form";
import { db } from "@/db";
import { attendance, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isStaff, listStudents } from "@/lib/queries";
import { markAttendanceAction } from "@/lib/actions/communication";
import { Empty, Flash, PageHeader, StatCard, StatusBadge, fmtDay } from "@/components/ui";

const today = () => new Date().toISOString().slice(0, 10);

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; date?: string; level?: string }> }) {
  const me = await requireUser();
  const { msg, err, date, level } = await searchParams;

  if (!isStaff(me)) {
    const rows = await db
      .select({ id: attendance.id, date: attendance.date, status: attendance.status, note: attendance.note, markedBy: users.name })
      .from(attendance)
      .leftJoin(users, eq(users.id, attendance.markedBy))
      .where(eq(attendance.studentId, me.id))
      .orderBy(desc(attendance.date));
    const present = rows.filter((r) => r.status === "present").length;
    const late = rows.filter((r) => r.status === "late").length;
    const absent = rows.filter((r) => r.status === "absent").length;
    const pct = rows.length ? Math.round(((present + late) / rows.length) * 100) : 0;
    return (
      <div>
        <PageHeader title="My Attendance" subtitle="Attendance marked by your staff/admin." />
        <Flash msg={msg} err={err} />
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <StatCard label="Attendance Rate" value={`${pct}%`} />
          <StatCard label="Present" value={present} color="green" />
          <StatCard label="Late" value={late} color="amber" />
          <StatCard label="Absent" value={absent} color="red" />
        </div>
        <div className="card overflow-x-auto p-0">
          {rows.length === 0 ? <div className="p-5"><Empty text="No attendance records yet." /></div> : (
            <table className="table">
              <thead><tr><th>Date</th><th>Status</th><th>Note</th><th>Marked by</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.id}><td>{fmtDay(r.date)}</td><td><StatusBadge status={r.status} /></td><td className="text-slate-500">{r.note ?? "—"}</td><td className="text-xs text-slate-500">{r.markedBy ?? "—"}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  const day = date || today();
  const all = await listStudents();
  const levels = Array.from(new Set(all.map((s) => s.classLevel).filter(Boolean))) as string[];
  const students = level ? all.filter((s) => (s.classLevel ?? "") === level) : all;
  const existing = await db.select().from(attendance).where(eq(attendance.date, day));
  const byStudent = new Map(existing.map((a) => [a.studentId, a]));
  const summary = await db
    .select({
      studentId: attendance.studentId,
      total: sql<number>`count(*)::int`,
      present: sql<number>`count(*) filter (where status in ('present','late'))::int`,
    })
    .from(attendance)
    .groupBy(attendance.studentId);
  const summaryMap = new Map(summary.map((s) => [s.studentId, s]));

  return (
    <div>
      <PageHeader title="Attendance" subtitle="Mark daily attendance for each student. Students can see it on their dashboard." />
      <Flash msg={msg} err={err} />
      <Form action="/dashboard/attendance" className="mb-4 flex flex-wrap items-end gap-2">
        <div><label className="label">Date</label><input type="date" name="date" defaultValue={day} className="input" /></div>
        <div>
          <label className="label">Class</label>
          <select name="level" defaultValue={level ?? ""} className="input w-48"><option value="">All classes</option>{levels.map((l) => <option key={l} value={l}>{l}</option>)}</select>
        </div>
        <button className="btn-outline">Load</button>
      </Form>
      {students.length === 0 ? <Empty text="No students found." /> : (
        <form action={markAttendanceAction} className="card p-0">
          <input type="hidden" name="date" value={day} />
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
            <h2 className="font-semibold">{fmtDay(day)} · {students.length} student(s) · {existing.length} already marked</h2>
            <button className="btn-primary">Save Attendance</button>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Student</th><th>Class</th><th>Overall</th><th>Status</th><th>Note</th></tr></thead>
              <tbody>
                {students.map((s) => {
                  const cur = byStudent.get(s.id);
                  const sum = summaryMap.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td>
                        <input type="hidden" name="studentIds" value={s.id} />
                        <p className="font-medium">{s.name}</p><p className="font-mono text-xs text-slate-500">{s.admissionNo ?? ""}</p>
                      </td>
                      <td className="text-sm">{s.classLevel ?? "—"}</td>
                      <td className="text-xs text-slate-500">{sum ? `${Math.round((sum.present / sum.total) * 100)}% (${sum.present}/${sum.total})` : "—"}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {(["present", "absent", "late", "excused"] as const).map((st) => (
                            <label key={st} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium has-[:checked]:text-white ${st === "present" ? "has-[:checked]:bg-emerald-600" : st === "absent" ? "has-[:checked]:bg-red-600" : st === "late" ? "has-[:checked]:bg-amber-500" : "has-[:checked]:bg-blue-600"}`}>
                              <input type="radio" name={`status_${s.id}`} value={st} defaultChecked={(cur?.status ?? "present") === st} className="sr-only" />
                              {st}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td><input name={`note_${s.id}`} defaultValue={cur?.note ?? ""} placeholder="optional" className="input w-40 py-1 text-xs" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      )}
    </div>
  );
}
