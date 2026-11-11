import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { attendance, promotionLogs, testAttempts, tests, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { CLASS_LEVELS, DEPARTMENTS, SEMESTERS, getProfile, studentRegistrations } from "@/lib/queries";
import { removeUserAction, resetPasswordAction, updateStudentByStaffAction } from "@/lib/actions/users";
import { Empty, Flash, PageHeader, StatusBadge, fmtDate, fmtDay } from "@/components/ui";

export default async function StudentDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireUser(["staff", "super_admin"]);
  const { id } = await params;
  const { msg, err } = await searchParams;
  const studentId = Number(id);
  const [student] = await db.select().from(users).where(eq(users.id, studentId)).limit(1);
  if (!student || student.role !== "student") notFound();

  const [profile, regs, results, att, promos] = await Promise.all([
    getProfile(studentId),
    studentRegistrations(studentId),
    db.select({ id: testAttempts.id, score: testAttempts.score, total: testAttempts.totalMarks, submittedAt: testAttempts.submittedAt, status: testAttempts.status, test: tests.title })
      .from(testAttempts).innerJoin(tests, eq(tests.id, testAttempts.testId)).where(eq(testAttempts.studentId, studentId)).orderBy(desc(testAttempts.startedAt)),
    db.select().from(attendance).where(eq(attendance.studentId, studentId)).orderBy(desc(attendance.date)).limit(30),
    db.select().from(promotionLogs).where(eq(promotionLogs.studentId, studentId)).orderBy(desc(promotionLogs.createdAt)),
  ]);
  const present = att.filter((a) => a.status === "present" || a.status === "late").length;

  return (
    <div>
      <PageHeader title={student.name} subtitle={`${profile?.admissionNo ?? "No admission no"} · ${student.email} · @${student.username}`} action={<Link href="/dashboard/students" className="btn-outline">← Back</Link>} />
      <Flash msg={msg} err={err} />
      <div className="grid gap-6 lg:grid-cols-3">
        <form action={updateStudentByStaffAction} className="card space-y-3 lg:col-span-1">
          <input type="hidden" name="id" value={studentId} />
          <h2 className="font-semibold">Edit Information</h2>
          <div><label className="label">Full name</label><input name="name" defaultValue={student.name} className="input" /></div>
          <div><label className="label">Admission no</label><input name="admissionNo" defaultValue={profile?.admissionNo ?? ""} className="input" /></div>
          <div><label className="label">School / Institution</label><input name="schoolName" defaultValue={profile?.schoolName ?? ""} className="input" /></div>
          <div><label className="label">Class / Level</label><input name="classLevel" list="levels" defaultValue={profile?.classLevel ?? ""} className="input" /><datalist id="levels">{CLASS_LEVELS.map((l) => <option key={l} value={l} />)}</datalist></div>
          <div><label className="label">Department</label><input name="department" list="depts" defaultValue={profile?.department ?? ""} className="input" /><datalist id="depts">{DEPARTMENTS.map((l) => <option key={l} value={l} />)}</datalist></div>
          <div><label className="label">Semester / Term</label><input name="semester" list="sems" defaultValue={profile?.semester ?? ""} className="input" /><datalist id="sems">{SEMESTERS.map((l) => <option key={l} value={l} />)}</datalist></div>
          <button className="btn-primary w-full">Save Changes</button>
          <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>Phone: {profile?.phone ?? "—"} · Gender: {profile?.gender ?? "—"}</p>
            <p>Guardian: {profile?.guardianName ?? "—"} ({profile?.guardianPhone ?? "—"})</p>
            <p>Address: {profile?.address ?? "—"}</p>
          </div>
        </form>

        <div className="space-y-6 lg:col-span-2">
          <div className="card">
            <h2 className="mb-3 font-semibold">Course Registrations</h2>
            {regs.length === 0 ? <Empty text="No course registrations." /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {regs.map((r) => <li key={r.id} className="flex items-center justify-between py-2"><span><b>{r.code}</b> — {r.title}</span><StatusBadge status={r.status} /></li>)}
              </ul>
            )}
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">CBT Results</h2>
            {results.length === 0 ? <Empty text="No test attempts." /> : (
              <table className="table">
                <thead><tr><th>Test</th><th>Status</th><th>Score</th><th>Date</th></tr></thead>
                <tbody>{results.map((r) => <tr key={r.id}><td>{r.test}</td><td><StatusBadge status={r.status} /></td><td className="font-semibold">{r.status === "submitted" ? `${r.score}/${r.total}` : "—"}</td><td className="text-xs text-slate-500">{fmtDate(r.submittedAt)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="card">
              <h2 className="mb-1 font-semibold">Attendance</h2>
              <p className="mb-3 text-xs text-slate-500">{present}/{att.length} present (last 30 records)</p>
              {att.length === 0 ? <Empty text="No attendance records." /> : (
                <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">{att.map((a) => <li key={a.id} className="flex justify-between"><span>{fmtDay(a.date)}</span><StatusBadge status={a.status} /></li>)}</ul>
              )}
            </div>
            <div className="card">
              <h2 className="mb-3 font-semibold">Promotion History</h2>
              {promos.length === 0 ? <Empty text="No promotions yet." /> : (
                <ul className="space-y-1 text-sm">{promos.map((p) => <li key={p.id}>{p.fromLevel ?? "—"} → <b>{p.toLevel}</b> <span className="text-xs text-slate-400">({fmtDay(p.createdAt)})</span></li>)}</ul>
              )}
            </div>
          </div>
          <div className="card flex flex-wrap items-center gap-3">
            <form action={resetPasswordAction} className="flex items-center gap-2">
              <input type="hidden" name="id" value={studentId} />
              <input name="password" placeholder="New password" className="input w-44" />
              <button className="btn-outline">Reset Password</button>
            </form>
            <form action={removeUserAction} className="ml-auto">
              <input type="hidden" name="id" value={studentId} />
              <button className="btn-danger">Remove Student</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
