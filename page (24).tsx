import Link from "next/link";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendance, courseRegistrations, courses, messages, notices, testAttempts, tests, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getProfile, isStaff, testsForStudent, testWindowStatus } from "@/lib/queries";
import { Empty, Flash, PageHeader, StatCard, StatusBadge, fmtDate } from "@/components/ui";

export default async function DashboardHome({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requireUser();
  const { msg, err } = await searchParams;
  const latestNotices = await db
    .select({ id: notices.id, title: notices.title, body: notices.body, createdAt: notices.createdAt, author: users.name })
    .from(notices)
    .leftJoin(users, eq(users.id, notices.createdBy))
    .where(me.role === "student" ? or(eq(notices.audience, "all"), eq(notices.audience, "students")) : undefined)
    .orderBy(desc(notices.createdAt))
    .limit(4);

  if (!isStaff(me)) {
    const profile = await getProfile(me.id);
    const myTests = await testsForStudent(me.id);
    const [regs] = await db
      .select({
        total: sql<number>`count(*)::int`,
        approved: sql<number>`count(*) filter (where status = 'approved')::int`,
        pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      })
      .from(courseRegistrations)
      .where(eq(courseRegistrations.studentId, me.id));
    const [att] = await db
      .select({
        total: sql<number>`count(*)::int`,
        present: sql<number>`count(*) filter (where status in ('present','late'))::int`,
      })
      .from(attendance)
      .where(eq(attendance.studentId, me.id));
    const openTests = myTests.filter((t) => testWindowStatus(t) === "open" && t.attemptStatus !== "submitted");
    const completed = myTests.filter((t) => t.attemptStatus === "submitted");
    const incomplete = !profile?.schoolName || !profile?.classLevel || !profile?.department || !profile?.semester;

    return (
      <div>
        <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} subtitle={`${profile?.schoolName ?? "School not set"} · ${profile?.classLevel ?? "Class not set"} · ${profile?.department ?? "Dept not set"} · ${profile?.semester ?? "Semester not set"}`} />
        <Flash msg={msg} err={err} />
        {incomplete && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>Your profile is incomplete. Add your school/institution, class/level, department and semester.</span>
            <Link href="/dashboard/profile" className="btn-primary btn-sm">Update Profile</Link>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Approved Courses" value={regs.approved} hint={`${regs.pending} pending approval`} />
          <StatCard label="Tests Available Now" value={openTests.length} hint="Open CBT tests" color="green" />
          <StatCard label="Tests Completed" value={completed.length} color="purple" />
          <StatCard label="Attendance" value={att.total ? `${Math.round((att.present / att.total) * 100)}%` : "—"} hint={`${att.present}/${att.total} days present`} color="amber" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Open CBT Tests</h2>
              <Link href="/dashboard/tests" className="text-sm text-[#0b4fb3] hover:underline">View all</Link>
            </div>
            {openTests.length === 0 ? <Empty text="No open tests right now." /> : (
              <ul className="divide-y divide-slate-100">
                {openTests.map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-slate-500">{t.courseCode} · {t.durationMinutes} mins · closes {fmtDate(t.endAt)}</p>
                    </div>
                    <Link href="/dashboard/tests" className="btn-primary btn-sm">Take Test</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Recent Results</h2>
              <Link href="/dashboard/results" className="text-sm text-[#0b4fb3] hover:underline">View all</Link>
            </div>
            {completed.length === 0 ? <Empty text="No results yet." /> : (
              <ul className="divide-y divide-slate-100">
                {completed.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-xs text-slate-500">{t.courseCode}</p>
                    </div>
                    <span className="text-lg font-bold text-[#0b4fb3]">{t.score}/{t.totalMarks} <span className="text-xs font-normal text-slate-500">({t.totalMarks ? Math.round(((t.score ?? 0) / t.totalMarks) * 100) : 0}%)</span></span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <NoticeList items={latestNotices} />
      </div>
    );
  }

  // ---------- Staff / Super admin ----------
  const [counts] = await db
    .select({
      students: sql<number>`count(*) filter (where role = 'student')::int`,
      staff: sql<number>`count(*) filter (where role in ('staff','super_admin'))::int`,
    })
    .from(users);
  const [{ courseCount }] = await db.select({ courseCount: sql<number>`count(*)::int` }).from(courses);
  const [{ pendingRegs }] = await db.select({ pendingRegs: sql<number>`count(*)::int` }).from(courseRegistrations).where(eq(courseRegistrations.status, "pending"));
  const [{ testCount }] = await db.select({ testCount: sql<number>`count(*)::int` }).from(tests);
  const [{ attemptsCount }] = await db.select({ attemptsCount: sql<number>`count(*)::int` }).from(testAttempts).where(eq(testAttempts.status, "submitted"));
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.isRead, false), or(isNull(messages.recipientId), eq(messages.recipientId, me.id))));
  const recentAttempts = await db
    .select({ id: testAttempts.id, score: testAttempts.score, total: testAttempts.totalMarks, submittedAt: testAttempts.submittedAt, student: users.name, test: tests.title })
    .from(testAttempts)
    .innerJoin(users, eq(users.id, testAttempts.studentId))
    .innerJoin(tests, eq(tests.id, testAttempts.testId))
    .where(eq(testAttempts.status, "submitted"))
    .orderBy(desc(testAttempts.submittedAt))
    .limit(6);

  return (
    <div>
      <PageHeader title={me.role === "super_admin" ? "Super Admin Dashboard" : "Staff Dashboard"} subtitle="Overview of the D.prince Learning Portal" />
      <Flash msg={msg} err={err} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Students" value={counts.students} />
        <StatCard label="Staff & Admins" value={counts.staff} color="purple" />
        <StatCard label="Courses / Subjects" value={courseCount} hint={`${pendingRegs} registrations awaiting approval`} color="green" />
        <StatCard label="CBT Tests" value={testCount} hint={`${attemptsCount} submissions`} color="amber" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink href="/dashboard/students/new" title="Admit Student" desc="Register a new student" />
        <QuickLink href="/dashboard/courses/approvals" title="Approve Courses" desc={`${pendingRegs} pending`} />
        <QuickLink href="/dashboard/tests" title="Set CBT Test" desc="Create questions with AI" />
        <QuickLink href="/dashboard/messages" title="Messages" desc={`${unread} unread from students`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent CBT Submissions</h2>
            <Link href="/dashboard/results" className="text-sm text-[#0b4fb3] hover:underline">All results</Link>
          </div>
          {recentAttempts.length === 0 ? <Empty text="No submissions yet." /> : (
            <table className="table">
              <thead><tr><th>Student</th><th>Test</th><th>Score</th><th>Date</th></tr></thead>
              <tbody>
                {recentAttempts.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.student}</td>
                    <td>{a.test}</td>
                    <td><StatusBadge status={a.total && a.score / a.total >= 0.5 ? "approved" : "rejected"} /> {a.score}/{a.total}</td>
                    <td className="text-xs text-slate-500">{fmtDate(a.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <NoticeList items={latestNotices} />
      </div>
    </div>
  );
}

function QuickLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card flex items-center justify-between transition hover:border-[#0b4fb3]">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600">→</span>
    </Link>
  );
}

function NoticeList({ items }: { items: { id: number; title: string; body: string; createdAt: Date; author: string | null }[] }) {
  return (
    <section className="card mt-6 lg:mt-0">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Notice Board</h2>
        <Link href="/dashboard/notices" className="text-sm text-[#0b4fb3] hover:underline">View all</Link>
      </div>
      {items.length === 0 ? <Empty text="No notices yet." /> : (
        <ul className="space-y-3">
          {items.map((n) => (
            <li key={n.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="font-medium">{n.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{n.body}</p>
              <p className="mt-1 text-xs text-slate-400">{n.author ?? "Admin"} · {fmtDate(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
