import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, questions, testAttempts, tests, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { testWindowStatus } from "@/lib/queries";
import { addQuestionAction, deleteQuestionAction, togglePublishAction, updateTestAction } from "@/lib/actions/academics";
import { Empty, Flash, PageHeader, StatusBadge, fmtDate, toLocalInput } from "@/components/ui";
import { QuestionTools } from "@/components/QuestionTools";
import { aiConfig, PROVIDER_LABEL } from "@/lib/ai";

export default async function ManageTestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireUser(["staff", "super_admin"]);
  const aiCfg = await aiConfig();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const testId = Number(id);
  const [row] = await db
    .select({ test: tests, course: courses })
    .from(tests)
    .innerJoin(courses, eq(courses.id, tests.courseId))
    .where(eq(tests.id, testId))
    .limit(1);
  if (!row) notFound();
  const { test, course } = row;
  const [qs, attempts] = await Promise.all([
    db.select().from(questions).where(eq(questions.testId, testId)).orderBy(asc(questions.sortOrder), asc(questions.id)),
    db.select({ id: testAttempts.id, score: testAttempts.score, total: testAttempts.totalMarks, status: testAttempts.status, submittedAt: testAttempts.submittedAt, student: users.name })
      .from(testAttempts).innerJoin(users, eq(users.id, testAttempts.studentId)).where(eq(testAttempts.testId, testId)).orderBy(desc(testAttempts.startedAt)),
  ]);
  const totalMarks = qs.reduce((s, q) => s + q.marks, 0);

  return (
    <div>
      <PageHeader
        title={test.title}
        subtitle={`${course.code} — ${course.title} · ${qs.length} questions · ${totalMarks} marks · ${test.durationMinutes} min timer`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={testWindowStatus(test)} />
            <form action={togglePublishAction}><input type="hidden" name="id" value={test.id} /><button className={test.isPublished ? "btn-outline" : "btn-success"}>{test.isPublished ? "Unpublish" : "Publish Test"}</button></form>
            <Link href="/dashboard/tests" className="btn-outline">← Back</Link>
          </div>
        }
      />
      <Flash msg={msg} err={err} />
      {!test.isPublished && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This test is a draft. Students will not see it until you click <b>Publish Test</b>.</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <QuestionTools testId={test.id} courseTitle={course.title} classLevel={course.classLevel} aiStatus={aiCfg ? `${PROVIDER_LABEL[aiCfg.provider]}, ${aiCfg.model}` : null} />

          <form action={addQuestionAction} className="card space-y-3">
            <input type="hidden" name="testId" value={test.id} />
            <h2 className="font-semibold">Add Question Manually</h2>
            <div><label className="label">Question *</label><textarea name="questionText" required rows={2} className="input" /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Option A *</label><input name="optionA" required className="input" /></div>
              <div><label className="label">Option B *</label><input name="optionB" required className="input" /></div>
              <div><label className="label">Option C *</label><input name="optionC" required className="input" /></div>
              <div><label className="label">Option D *</label><input name="optionD" required className="input" /></div>
              <div><label className="label">Correct option *</label><select name="correctOption" required className="input"><option>A</option><option>B</option><option>C</option><option>D</option></select></div>
              <div><label className="label">Marks</label><input name="marks" type="number" min={1} defaultValue={1} className="input" /></div>
            </div>
            <button className="btn-primary">Add Question</button>
          </form>

          <div className="card">
            <h2 className="mb-3 font-semibold">Questions ({qs.length})</h2>
            {qs.length === 0 ? <Empty text="No questions yet. Use the AI assistant, import, or add manually." /> : (
              <ol className="space-y-3">
                {qs.map((q, i) => (
                  <li key={q.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium"><span className="mr-2 text-slate-400">{i + 1}.</span>{q.questionText}</p>
                      <form action={deleteQuestionAction}><input type="hidden" name="id" value={q.id} /><input type="hidden" name="testId" value={test.id} /><button className="text-xs text-red-600 hover:underline">Remove</button></form>
                    </div>
                    <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                      {(["A", "B", "C", "D"] as const).map((o) => {
                        const text = o === "A" ? q.optionA : o === "B" ? q.optionB : o === "C" ? q.optionC : q.optionD;
                        const correct = q.correctOption === o;
                        return <li key={o} className={`rounded px-2 py-1 ${correct ? "bg-emerald-50 font-semibold text-emerald-700" : "text-slate-600"}`}>{o}. {text} {correct && "✓"}</li>;
                      })}
                    </ul>
                    <p className="mt-1 text-xs text-slate-400">{q.marks} mark(s)</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <form action={updateTestAction} className="card space-y-3">
            <input type="hidden" name="id" value={test.id} />
            <h2 className="font-semibold">Test Settings</h2>
            <div><label className="label">Title</label><input name="title" defaultValue={test.title} required className="input" /></div>
            <div><label className="label">Instructions</label><textarea name="instructions" rows={2} defaultValue={test.instructions ?? ""} className="input" /></div>
            <div><label className="label">Timer (minutes)</label><input name="durationMinutes" type="number" min={1} defaultValue={test.durationMinutes} className="input" /></div>
            <div><label className="label">Start date & time</label><input name="startAt" type="datetime-local" defaultValue={toLocalInput(test.startAt)} className="input" /></div>
            <div><label className="label">End date & time</label><input name="endAt" type="datetime-local" defaultValue={toLocalInput(test.endAt)} className="input" /></div>
            <div><label className="label">Times a student may leave the exam screen</label><input name="maxLeaves" type="number" min={0} max={20} defaultValue={test.maxLeaves} className="input" /><p className="mt-1 text-xs text-slate-500">After this many, the next time submits the test automatically. 0 = only record, never submit.</p></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="shuffle" defaultChecked={test.shuffleQuestions} className="h-4 w-4" /> Shuffle questions</label>
            <button className="btn-primary w-full">Save Settings</button>
          </form>

          <div className="card">
            <h2 className="mb-3 font-semibold">Submissions ({attempts.filter((a) => a.status === "submitted").length})</h2>
            {attempts.length === 0 ? <Empty text="No attempts yet." /> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {attempts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-2">
                    <div><p className="font-medium">{a.student}</p><p className="text-xs text-slate-400">{fmtDate(a.submittedAt)}</p></div>
                    {a.status === "submitted" ? <span className="font-bold text-[#0b4fb3]">{a.score}/{a.total}</span> : <StatusBadge status="in_progress" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
