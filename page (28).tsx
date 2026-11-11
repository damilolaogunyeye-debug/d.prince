import { desc, eq } from "drizzle-orm";
import Form from "next/form";
import { db } from "@/db";
import { courses, studentProfiles, testAttempts, tests, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { isStaff } from "@/lib/queries";
import { Empty, Flash, PageHeader, StatCard, fmtDate } from "@/components/ui";

function grade(pct: number) {
  if (pct >= 70) return "A";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 45) return "D";
  if (pct >= 40) return "E";
  return "F";
}

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; q?: string }> }) {
  const me = await requireUser();
  const { msg, err, q } = await searchParams;
  const staff = isStaff(me);

  const rows = await db
    .select({
      id: testAttempts.id, score: testAttempts.score, total: testAttempts.totalMarks, submittedAt: testAttempts.submittedAt, status: testAttempts.status, leaves: testAttempts.leaveCount, autoSubmitted: testAttempts.autoSubmitted,
      test: tests.title, courseCode: courses.code, courseTitle: courses.title,
      student: users.name, studentId: users.id, admissionNo: studentProfiles.admissionNo, classLevel: studentProfiles.classLevel,
    })
    .from(testAttempts)
    .innerJoin(tests, eq(tests.id, testAttempts.testId))
    .innerJoin(courses, eq(courses.id, tests.courseId))
    .innerJoin(users, eq(users.id, testAttempts.studentId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(staff ? eq(testAttempts.status, "submitted") : eq(testAttempts.studentId, me.id))
    .orderBy(desc(testAttempts.submittedAt));

  const query = (q ?? "").toLowerCase();
  const list = query ? rows.filter((r) => [r.student, r.admissionNo, r.test, r.courseCode, r.classLevel].some((v) => v?.toLowerCase().includes(query))) : rows;
  const submitted = list.filter((r) => r.status === "submitted");
  const avg = submitted.length ? Math.round(submitted.reduce((s, r) => s + (r.total ? (r.score / r.total) * 100 : 0), 0) / submitted.length) : 0;
  const best = submitted.reduce((m, r) => Math.max(m, r.total ? Math.round((r.score / r.total) * 100) : 0), 0);

  return (
    <div>
      <PageHeader title={staff ? "CBT Results" : "My Results"} subtitle={staff ? "All submitted CBT tests." : "Your CBT test scores."} />
      <Flash msg={msg} err={err} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Tests Taken" value={submitted.length} />
        <StatCard label="Average Score" value={`${avg}%`} color="green" />
        <StatCard label="Best Score" value={`${best}%`} color="purple" />
      </div>
      {staff && (
        <Form action="/dashboard/results" className="mb-4 flex gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Search by student, test, course, class..." className="input max-w-md" />
          <button className="btn-outline">Search</button>
        </Form>
      )}
      <div className="card overflow-x-auto p-0">
        {list.length === 0 ? <div className="p-5"><Empty text="No results yet." /></div> : (
          <table className="table">
            <thead><tr>{staff && <th>Student</th>}<th>Course</th><th>Test</th><th>Score</th><th>Percent</th><th>Grade</th><th>Submitted</th></tr></thead>
            <tbody>
              {list.map((r) => {
                const pct = r.total ? Math.round((r.score / r.total) * 100) : 0;
                const g = grade(pct);
                return (
                  <tr key={r.id}>
                    {staff && <td><p className="font-medium">{r.student}</p><p className="font-mono text-xs text-slate-500">{r.admissionNo ?? ""} {r.classLevel ? `· ${r.classLevel}` : ""}</p></td>}
                    <td><b>{r.courseCode}</b><br /><span className="text-xs text-slate-500">{r.courseTitle}</span></td>
                    <td>{r.test}</td>
                    <td className="font-semibold">{r.status === "submitted" ? `${r.score} / ${r.total}` : <span className="badge-yellow">in progress</span>}{staff && (r.leaves > 0 || r.autoSubmitted) && <span className="block text-xs font-normal text-amber-700">left exam screen {r.leaves}×{r.autoSubmitted ? " · auto-submitted" : ""}</span>}</td>
                    <td>{r.status === "submitted" ? `${pct}%` : "—"}</td>
                    <td>{r.status === "submitted" ? <span className={`badge ${pct >= 50 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{g}</span> : "—"}</td>
                    <td className="text-xs text-slate-500">{fmtDate(r.submittedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
