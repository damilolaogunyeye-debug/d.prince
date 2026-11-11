import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { academicSessions, courseRegistrations, courses, studentProfiles, tests, users, type User } from "@/db/schema";

export async function listStudents() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      isActive: users.isActive,
      createdAt: users.createdAt,
      admissionNo: studentProfiles.admissionNo,
      schoolName: studentProfiles.schoolName,
      classLevel: studentProfiles.classLevel,
      department: studentProfiles.department,
      semester: studentProfiles.semester,
      session: studentProfiles.session,
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(eq(users.role, "student"))
    .orderBy(users.name);
}

export type StudentRow = Awaited<ReturnType<typeof listStudents>>[number];

export async function getProfile(userId: number) {
  const [p] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId)).limit(1);
  return p ?? null;
}

export async function listStaff() {
  return db
    .select()
    .from(users)
    .where(or(eq(users.role, "staff"), eq(users.role, "super_admin")))
    .orderBy(desc(users.role), users.name);
}

export async function listCourses() {
  return db
    .select({
      id: courses.id, title: courses.title, code: courses.code, classLevel: courses.classLevel,
      department: courses.department, semester: courses.semester, description: courses.description,
      createdAt: courses.createdAt, createdByName: users.name, createdByRole: users.role,
      registrations: sql<number>`(select count(*)::int from course_registrations cr where cr.course_id = ${courses.id})`,
      tests: sql<number>`(select count(*)::int from tests t where t.course_id = ${courses.id})`,
    })
    .from(courses)
    .leftJoin(users, eq(users.id, courses.createdBy))
    .orderBy(courses.code);
}

export async function studentRegistrations(studentId: number) {
  return db
    .select({
      id: courseRegistrations.id, status: courseRegistrations.status, createdAt: courseRegistrations.createdAt,
      courseId: courses.id, title: courses.title, code: courses.code, classLevel: courses.classLevel,
      department: courses.department, semester: courses.semester,
    })
    .from(courseRegistrations)
    .innerJoin(courses, eq(courses.id, courseRegistrations.courseId))
    .where(eq(courseRegistrations.studentId, studentId))
    .orderBy(courses.code);
}

export async function approvedCourseIds(studentId: number) {
  const rows = await db
    .select({ courseId: courseRegistrations.courseId })
    .from(courseRegistrations)
    .where(and(eq(courseRegistrations.studentId, studentId), eq(courseRegistrations.status, "approved")));
  return rows.map((r) => r.courseId);
}

export async function listTests() {
  return db
    .select({
      id: tests.id, title: tests.title, durationMinutes: tests.durationMinutes, startAt: tests.startAt, endAt: tests.endAt,
      isPublished: tests.isPublished, courseId: courses.id, courseCode: courses.code, courseTitle: courses.title,
      questionCount: sql<number>`(select count(*)::int from questions q where q.test_id = ${tests.id})`,
      attemptCount: sql<number>`(select count(*)::int from test_attempts a where a.test_id = ${tests.id} and a.status = 'submitted')`,
    })
    .from(tests)
    .innerJoin(courses, eq(courses.id, tests.courseId))
    .orderBy(desc(tests.startAt));
}

export async function testsForStudent(studentId: number) {
  const ids = await approvedCourseIds(studentId);
  if (!ids.length) return [];
  return db
    .select({
      id: tests.id, title: tests.title, instructions: tests.instructions, durationMinutes: tests.durationMinutes,
      startAt: tests.startAt, endAt: tests.endAt, courseCode: courses.code, courseTitle: courses.title,
      questionCount: sql<number>`(select count(*)::int from questions q where q.test_id = ${tests.id})`,
      attemptStatus: sql<string | null>`(select a.status from test_attempts a where a.test_id = ${tests.id} and a.student_id = ${studentId} limit 1)`,
      score: sql<number | null>`(select a.score from test_attempts a where a.test_id = ${tests.id} and a.student_id = ${studentId} limit 1)`,
      totalMarks: sql<number | null>`(select a.total_marks from test_attempts a where a.test_id = ${tests.id} and a.student_id = ${studentId} limit 1)`,
    })
    .from(tests)
    .innerJoin(courses, eq(courses.id, tests.courseId))
    .where(and(eq(tests.isPublished, true), inArray(tests.courseId, ids)))
    .orderBy(desc(tests.startAt));
}

export function testWindowStatus(t: { startAt: Date; endAt: Date; isPublished?: boolean }) {
  const now = Date.now();
  if (t.isPublished === false) return "draft";
  if (now < t.startAt.getTime()) return "upcoming";
  if (now > t.endAt.getTime()) return "closed";
  return "open";
}

export const CLASS_LEVELS = [
  "Nursery 1", "Nursery 2", "Primary 1", "Primary 2", "Primary 3", "Primary 4", "Primary 5", "Primary 6",
  "JSS 1", "JSS 2", "JSS 3", "SSS 1", "SSS 2", "SSS 3",
  "ND 1", "ND 2", "HND 1", "HND 2", "100 Level", "200 Level", "300 Level", "400 Level", "500 Level", "600 Level",
];
export const SEMESTERS = ["First Term", "Second Term", "Third Term", "First Semester", "Second Semester", "Rain Semester", "Harmattan Semester"];
export const DEPARTMENTS = ["General", "Science", "Arts", "Commercial", "Engineering", "Social Sciences", "Medical Sciences", "Education", "Management Sciences", "Law", "Agriculture", "Computing / ICT"];

export const isStaff = (u: User) => u.role === "staff" || u.role === "super_admin";

// Internal helper (NOT a server action): the single place that decides whether a
// student may sit a test — approved registration + published + inside the date window.
export async function canStudentTakeTest(studentId: number, testId: number) {
  const [t] = await db.select().from(tests).where(eq(tests.id, testId)).limit(1);
  if (!t) return { ok: false as const, reason: "Test not found." };
  if (!t.isPublished) return { ok: false as const, reason: "This test has not been published yet." };
  const [reg] = await db
    .select()
    .from(courseRegistrations)
    .where(and(eq(courseRegistrations.studentId, studentId), eq(courseRegistrations.courseId, t.courseId)))
    .limit(1);
  if (!reg || reg.status !== "approved")
    return { ok: false as const, reason: "Your registration for this course has not been approved by staff/admin yet." };
  const now = new Date();
  if (now < t.startAt) return { ok: false as const, reason: `This test opens on ${t.startAt.toLocaleString()}.` };
  if (now > t.endAt) return { ok: false as const, reason: `This test closed on ${t.endAt.toLocaleString()}.` };
  return { ok: true as const, test: t };
}

// ---------- Academic sessions ----------
export async function listSessions() {
  return db.select().from(academicSessions).orderBy(desc(academicSessions.name));
}

export async function currentSessionName(): Promise<string | null> {
  const [row] = await db.select({ name: academicSessions.name }).from(academicSessions).where(eq(academicSessions.isCurrent, true)).limit(1);
  return row?.name ?? null;
}

// ---------- Promotion: the class that follows another ----------
/** Last class of each track: "next class" stops here and a class must be chosen by hand. */
export const FINAL_CLASSES = new Set(["SSS 3", "ND 2", "HND 2", "600 Level"]);
export const GRADUATED = "Graduated";

export function nextClassLevel(level: string | null | undefined): string | null {
  if (!level || FINAL_CLASSES.has(level)) return null;
  const i = CLASS_LEVELS.indexOf(level);
  return i >= 0 && i < CLASS_LEVELS.length - 1 ? CLASS_LEVELS[i + 1] : null;
}
