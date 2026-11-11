import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { courses, questions, testAttempts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canStudentTakeTest } from "@/lib/queries";
import { TestRunner } from "@/components/TestRunner";

// Deterministic shuffle per student so the order is stable on refresh
function seededShuffle<T>(arr: T[], seed: number) {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function TakeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser(["student"]);
  const { id } = await params;
  const testId = Number(id);
  const check = await canStudentTakeTest(me.id, testId);
  if (!check.ok) redirect(`/dashboard/tests?err=${encodeURIComponent(check.reason)}`);

  const [attempt] = await db
    .select()
    .from(testAttempts)
    .where(and(eq(testAttempts.testId, testId), eq(testAttempts.studentId, me.id)))
    .limit(1);
  if (!attempt) redirect("/dashboard/tests?err=Please+start+the+test+from+the+tests+page.");
  if (attempt.status === "submitted") redirect("/dashboard/results?msg=You+have+already+submitted+this+test.");

  const [course] = await db.select().from(courses).where(eq(courses.id, check.test.courseId)).limit(1);
  const qs = await db
    .select({ id: questions.id, questionText: questions.questionText, optionA: questions.optionA, optionB: questions.optionB, optionC: questions.optionC, optionD: questions.optionD, marks: questions.marks })
    .from(questions)
    .where(eq(questions.testId, testId))
    .orderBy(asc(questions.sortOrder), asc(questions.id));
  const ordered = check.test.shuffleQuestions ? seededShuffle(qs, me.id * 7919 + testId) : qs;

  // Deadline = min(started + duration, test end)
  const byDuration = attempt.startedAt.getTime() + check.test.durationMinutes * 60000;
  const deadline = Math.min(byDuration, check.test.endAt.getTime());

  return (
    <TestRunner
      testId={testId}
      title={check.test.title}
      courseLabel={`${course?.code ?? ""} — ${course?.title ?? ""}`}
      questions={ordered}
      initialAnswers={attempt.answers ?? {}}
      deadlineMs={deadline}
      maxLeaves={check.test.maxLeaves}
      initialLeaves={attempt.leaveCount ?? 0}
    />
  );
}
