"use server";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { courseRegistrations, courses, questions, testAttempts, tests } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canStudentTakeTest } from "@/lib/queries";
import { go, num, opt, str } from "./helpers";

// =================== COURSES ===================
export async function createCourseAction(formData: FormData) {
  const me = await requireUser();
  const title = str(formData, "title");
  const code = str(formData, "code").toUpperCase();
  if (!title || !code) go("/dashboard/courses", "Course title and code are required.", "err");
  const [course] = await db
    .insert(courses)
    .values({
      title,
      code,
      classLevel: opt(formData, "classLevel"),
      department: opt(formData, "department"),
      semester: opt(formData, "semester"),
      description: opt(formData, "description"),
      createdBy: me.id,
    })
    .returning({ id: courses.id });

  // A student who adds a course is automatically registered for it (pending approval)
  if (me.role === "student") {
    await db.insert(courseRegistrations).values({ studentId: me.id, courseId: course.id }).onConflictDoNothing();
    go("/dashboard/courses", `${code} added and sent for approval.`);
  }
  go("/dashboard/courses", `Course ${code} created.`);
}

export async function deleteCourseAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  await db.delete(courses).where(eq(courses.id, Number(formData.get("id"))));
  go("/dashboard/courses", "Course deleted.");
}

export async function registerCourseAction(formData: FormData) {
  const me = await requireUser(["student"]);
  const courseId = Number(formData.get("courseId"));
  if (!courseId) go("/dashboard/courses", "Select a course.", "err");
  await db.insert(courseRegistrations).values({ studentId: me.id, courseId }).onConflictDoNothing();
  go("/dashboard/courses", "Course registered. Waiting for staff approval.");
}

export async function dropCourseAction(formData: FormData) {
  const me = await requireUser(["student"]);
  const id = Number(formData.get("id"));
  await db
    .delete(courseRegistrations)
    .where(and(eq(courseRegistrations.id, id), eq(courseRegistrations.studentId, me.id), eq(courseRegistrations.status, "pending")));
  go("/dashboard/courses", "Registration withdrawn.");
}

export async function reviewRegistrationAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const id = Number(formData.get("id"));
  const status = str(formData, "status") === "approved" ? "approved" : "rejected";
  await db
    .update(courseRegistrations)
    .set({ status, reviewedBy: me.id, reviewedAt: new Date() })
    .where(eq(courseRegistrations.id, id));
  go("/dashboard/courses/approvals", `Registration ${status}.`);
}

export async function reviewSingleAction(id: number, status: "approved" | "rejected") {
  const me = await requireUser(["staff", "super_admin"]);
  await db
    .update(courseRegistrations)
    .set({ status, reviewedBy: me.id, reviewedAt: new Date() })
    .where(eq(courseRegistrations.id, id));
  go("/dashboard/courses/approvals", `Registration ${status}.`);
}

export async function bulkReviewAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const ids = formData.getAll("ids").map(Number).filter(Boolean);
  const status = str(formData, "status") === "approved" ? "approved" : "rejected";
  for (const id of ids) {
    await db.update(courseRegistrations).set({ status, reviewedBy: me.id, reviewedAt: new Date() }).where(eq(courseRegistrations.id, id));
  }
  go("/dashboard/courses/approvals", `${ids.length} registration(s) ${status}.`);
}

// =================== TESTS ===================
export async function createTestAction(formData: FormData) {
  const me = await requireUser(["staff", "super_admin"]);
  const courseId = num(formData, "courseId");
  const title = str(formData, "title");
  const startAt = new Date(str(formData, "startAt"));
  const endAt = new Date(str(formData, "endAt"));
  if (!courseId || !title || isNaN(startAt.getTime()) || isNaN(endAt.getTime()))
    go("/dashboard/tests", "Course, title, start and end date are required.", "err");
  if (endAt <= startAt) go("/dashboard/tests", "End date must be after the start date.", "err");
  const [test] = await db
    .insert(tests)
    .values({
      courseId,
      title,
      instructions: opt(formData, "instructions"),
      durationMinutes: Math.max(1, num(formData, "durationMinutes") || 30),
      startAt,
      endAt,
      shuffleQuestions: formData.get("shuffle") === "on",
      maxLeaves: Math.min(20, Math.max(0, Math.floor(num(formData, "maxLeaves")))),
      createdBy: me.id,
    })
    .returning({ id: tests.id });
  go(`/dashboard/tests/${test.id}`, "Test created. Now add questions.");
}

export async function updateTestAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const id = num(formData, "id");
  const startAt = new Date(str(formData, "startAt"));
  const endAt = new Date(str(formData, "endAt"));
  if (isNaN(startAt.getTime()) || isNaN(endAt.getTime()) || endAt <= startAt)
    go(`/dashboard/tests/${id}`, "Invalid start/end dates.", "err");
  await db
    .update(tests)
    .set({
      title: str(formData, "title"),
      instructions: opt(formData, "instructions"),
      durationMinutes: Math.max(1, num(formData, "durationMinutes") || 30),
      startAt,
      endAt,
      shuffleQuestions: formData.get("shuffle") === "on",
      maxLeaves: Math.min(20, Math.max(0, Math.floor(num(formData, "maxLeaves")))),
    })
    .where(eq(tests.id, id));
  go(`/dashboard/tests/${id}`, "Test settings saved.");
}

export async function togglePublishAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const id = num(formData, "id");
  const [t] = await db.select().from(tests).where(eq(tests.id, id)).limit(1);
  if (!t) go("/dashboard/tests", "Test not found.", "err");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(questions).where(eq(questions.testId, id));
  if (!t.isPublished && count === 0) go(`/dashboard/tests/${id}`, "Add at least one question before publishing.", "err");
  await db.update(tests).set({ isPublished: !t.isPublished }).where(eq(tests.id, id));
  go(`/dashboard/tests/${id}`, t.isPublished ? "Test unpublished." : "Test published. Approved students can now take it within the date window.");
}

export async function deleteTestAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  await db.delete(tests).where(eq(tests.id, num(formData, "id")));
  go("/dashboard/tests", "Test deleted.");
}

export async function addQuestionAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const testId = num(formData, "testId");
  const text = str(formData, "questionText");
  const a = str(formData, "optionA"), b = str(formData, "optionB"), c = str(formData, "optionC"), d = str(formData, "optionD");
  const correct = str(formData, "correctOption").toUpperCase();
  if (!text || !a || !b || !c || !d || !"ABCD".includes(correct))
    go(`/dashboard/tests/${testId}`, "All question fields are required.", "err");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(questions).where(eq(questions.testId, testId));
  await db.insert(questions).values({
    testId, questionText: text, optionA: a, optionB: b, optionC: c, optionD: d,
    correctOption: correct, marks: Math.max(1, num(formData, "marks") || 1), sortOrder: count + 1,
  });
  go(`/dashboard/tests/${testId}`, "Question added.");
}

export type ImportedQuestion = {
  question: string; a: string; b: string; c: string; d: string; answer: string; marks?: number;
};

export async function importQuestionsAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const testId = num(formData, "testId");
  let items: ImportedQuestion[] = [];
  try {
    items = JSON.parse(str(formData, "payload")) as ImportedQuestion[];
  } catch {
    go(`/dashboard/tests/${testId}`, "Could not read the questions to import.", "err");
  }
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(questions).where(eq(questions.testId, testId));
  const valid = items.filter((q) => q.question && q.a && q.b && q.c && q.d && "ABCD".includes((q.answer || "").toUpperCase()));
  if (!valid.length) go(`/dashboard/tests/${testId}`, "No valid questions found to import.", "err");
  await db.insert(questions).values(
    valid.map((q, i) => ({
      testId,
      questionText: q.question.trim(),
      optionA: q.a.trim(), optionB: q.b.trim(), optionC: q.c.trim(), optionD: q.d.trim(),
      correctOption: q.answer.toUpperCase().trim(),
      marks: Math.max(1, Number(q.marks) || 1),
      sortOrder: count + i + 1,
    })),
  );
  go(`/dashboard/tests/${testId}`, `${valid.length} question(s) imported.`);
}

export async function deleteQuestionAction(formData: FormData) {
  await requireUser(["staff", "super_admin"]);
  const testId = num(formData, "testId");
  await db.delete(questions).where(eq(questions.id, num(formData, "id")));
  go(`/dashboard/tests/${testId}`, "Question removed.");
}

// =================== TAKING A TEST (student) ===================
export async function startTestAction(formData: FormData) {
  const me = await requireUser(["student"]);
  const testId = num(formData, "testId");
  const check = await canStudentTakeTest(me.id, testId);
  if (!check.ok) go("/dashboard/tests", check.reason, "err");
  const [existing] = await db
    .select()
    .from(testAttempts)
    .where(and(eq(testAttempts.testId, testId), eq(testAttempts.studentId, me.id)))
    .limit(1);
  if (existing?.status === "submitted") go("/dashboard/results", "You have already submitted this test.", "err");
  if (!existing) {
    const [{ total }] = await db
      .select({ total: sql<number>`coalesce(sum(marks),0)::int` })
      .from(questions)
      .where(eq(questions.testId, testId));
    await db.insert(testAttempts).values({ testId, studentId: me.id, totalMarks: total });
  }
  go(`/dashboard/tests/${testId}/take`);
}

export async function saveAnswersAction(testId: number, answers: Record<string, string>) {
  const me = await requireUser(["student"]);
  await db
    .update(testAttempts)
    .set({ answers })
    .where(and(eq(testAttempts.testId, testId), eq(testAttempts.studentId, me.id), eq(testAttempts.status, "in_progress")));
  return { ok: true };
}

/**
 * The student left the test screen (tab hidden, window lost focus, or full screen exited).
 * Browsers do not let a website prevent this, so each time is recorded; past the test's
 * limit the page must submit the test.
 */
export async function recordLeaveAction(testId: number, kind: string) {
  const me = await requireUser(["student"]);
  const [t] = await db.select({ maxLeaves: tests.maxLeaves }).from(tests).where(eq(tests.id, testId)).limit(1);
  if (!t) return { ok: false as const };
  const entry = JSON.stringify([{ at: new Date().toISOString(), kind: String(kind).slice(0, 20) }]);
  const [row] = await db
    .update(testAttempts)
    .set({ leaveCount: sql`${testAttempts.leaveCount} + 1`, leaveLog: sql`${testAttempts.leaveLog} || ${entry}::jsonb` })
    .where(and(eq(testAttempts.testId, testId), eq(testAttempts.studentId, me.id), eq(testAttempts.status, "in_progress")))
    .returning({ leaveCount: testAttempts.leaveCount });
  if (!row) return { ok: false as const };
  return { ok: true as const, count: row.leaveCount, max: t.maxLeaves, mustSubmit: t.maxLeaves > 0 && row.leaveCount > t.maxLeaves };
}

export async function submitTestAction(testId: number, answers: Record<string, string>, auto = false) {
  const me = await requireUser(["student"]);
  const [attempt] = await db
    .select()
    .from(testAttempts)
    .where(and(eq(testAttempts.testId, testId), eq(testAttempts.studentId, me.id)))
    .limit(1);
  if (!attempt) return { ok: false, error: "No attempt found." };
  if (attempt.status === "submitted") return { ok: true, score: attempt.score, total: attempt.totalMarks };

  const qs = await db.select().from(questions).where(eq(questions.testId, testId));
  let score = 0;
  let total = 0;
  for (const q of qs) {
    total += q.marks;
    if ((answers[String(q.id)] || "").toUpperCase() === q.correctOption) score += q.marks;
  }
  await db
    .update(testAttempts)
    .set({
      answers, score, totalMarks: total, status: "submitted", submittedAt: new Date(),
      // Marked automatic only if the leave limit was really exceeded (checked here, not trusted from the page).
      autoSubmitted: auto && (await db.select({ m: tests.maxLeaves }).from(tests).where(eq(tests.id, testId)).limit(1)).some((t) => t.m > 0 && attempt.leaveCount > t.m),
    })
    .where(eq(testAttempts.id, attempt.id));
  return { ok: true, score, total };
}
