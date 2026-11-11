import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { isStaff, listCourses, listTests, testsForStudent, testWindowStatus } from "@/lib/queries";
import { createTestAction, deleteTestAction, startTestAction } from "@/lib/actions/academics";
import { Empty, Flash, PageHeader, StatusBadge, fmtDate, toLocalInput } from "@/components/ui";

export default async function TestsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const { msg, err } = await searchParams;

  if (!isStaff(me)) {
    const myTests = await testsForStudent(me.id);
    return (
      <div>
        <PageHeader title="CBT Tests" subtitle="Tests for your approved courses. You can only start a test within its start and end dates." />
        <Flash msg={msg} err={err} />
        {myTests.length === 0 ? (
          <Empty text="No tests available. Make sure your courses have been approved by staff and that tests have been published." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {myTests.map((t) => {
              const win = testWindowStatus(t);
              const done = t.attemptStatus === "submitted";
              return (
                <div key={t.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase text-[#0b4fb3]">{t.courseCode} · {t.courseTitle}</p>
                      <h2 className="mt-1 text-lg font-semibold">{t.title}</h2>
                    </div>
                    <StatusBadge status={done ? "submitted" : t.attemptStatus === "in_progress" ? "in_progress" : win} />
                  </div>
                  {t.instructions && <p className="mt-2 text-sm text-slate-600">{t.instructions}</p>}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <div><dt>Questions</dt><dd className="font-semibold text-slate-800">{t.questionCount}</dd></div>
                    <div><dt>Duration</dt><dd className="font-semibold text-slate-800">{t.durationMinutes} minutes</dd></div>
                    <div><dt>Opens</dt><dd className="font-semibold text-slate-800">{fmtDate(t.startAt)}</dd></div>
                    <div><dt>Closes</dt><dd className="font-semibold text-slate-800">{fmtDate(t.endAt)}</dd></div>
                  </dl>
                  <div className="mt-4">
                    {done ? (
                      <Link href="/dashboard/results" className="btn-outline w-full">Score: {t.score}/{t.totalMarks} — View Result</Link>
                    ) : win === "open" ? (
                      <form action={startTestAction}>
                        <input type="hidden" name="testId" value={t.id} />
                        <button className="btn-primary w-full">{t.attemptStatus === "in_progress" ? "Continue Test" : "Start Test"}</button>
                      </form>
                    ) : (
                      <button disabled className="btn-outline w-full">{win === "upcoming" ? "Not yet open" : "Closed"}</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const [tests, courses] = await Promise.all([listTests(), listCourses()]);
  const now = new Date();
  const defaultStart = toLocalInput(now);
  const defaultEnd = toLocalInput(new Date(now.getTime() + 7 * 24 * 3600 * 1000));

  return (
    <div>
      <PageHeader title="CBT Tests" subtitle="Create tests with a timer and a start/end date, then add questions manually, import them, or generate with AI." />
      <Flash msg={msg} err={err} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card overflow-x-auto p-0 lg:col-span-2">
          {tests.length === 0 ? <div className="p-5"><Empty text="No tests yet. Create one on the right." /></div> : (
            <table className="table">
              <thead><tr><th>Test</th><th>Course</th><th>Window</th><th>Qs</th><th>Timer</th><th>Submissions</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {tests.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium"><Link href={`/dashboard/tests/${t.id}`} className="text-[#0b4fb3] hover:underline">{t.title}</Link></td>
                    <td>{t.courseCode}</td>
                    <td className="text-xs text-slate-500">{fmtDate(t.startAt)}<br />→ {fmtDate(t.endAt)}</td>
                    <td>{t.questionCount}</td>
                    <td>{t.durationMinutes}m</td>
                    <td>{t.attemptCount}</td>
                    <td><StatusBadge status={testWindowStatus(t)} /></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <Link href={`/dashboard/tests/${t.id}`} className="btn-outline btn-sm">Manage</Link>
                        <form action={deleteTestAction}><input type="hidden" name="id" value={t.id} /><button className="btn-danger btn-sm">Delete</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form action={createTestAction} className="card space-y-3 self-start">
          <h2 className="font-semibold">Create CBT Test</h2>
          {courses.length === 0 && <p className="rounded bg-amber-50 p-2 text-xs text-amber-700">Create a course first before setting a test.</p>}
          <div>
            <label className="label">Course / Subject *</label>
            <select name="courseId" required className="input">
              <option value="">Select course</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}
            </select>
          </div>
          <div><label className="label">Test title *</label><input name="title" required className="input" placeholder="e.g. Mid-Semester Test" /></div>
          <div><label className="label">Instructions</label><textarea name="instructions" rows={2} className="input" placeholder="Answer all questions..." /></div>
          <div><label className="label">Timer (minutes) *</label><input name="durationMinutes" type="number" min={1} defaultValue={30} required className="input" /></div>
          <div><label className="label">Start date & time *</label><input name="startAt" type="datetime-local" defaultValue={defaultStart} required className="input" /></div>
          <div><label className="label">End date & time *</label><input name="endAt" type="datetime-local" defaultValue={defaultEnd} required className="input" /></div>
          <div><label className="label">Times a student may leave the exam screen</label><input name="maxLeaves" type="number" min={0} max={20} defaultValue={3} className="input" /><p className="mt-1 text-xs text-slate-500">After this many, the next time submits the test automatically. 0 = only record, never submit.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffle" defaultChecked className="h-4 w-4" /> Shuffle questions for each student</label>
          <button className="btn-primary w-full">Create Test</button>
        </form>
      </div>
    </div>
  );
}
